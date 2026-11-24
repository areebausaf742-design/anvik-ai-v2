-- ANVIK v2 — atomic quota increment + credit settlement helpers
--
-- Why this migration exists
-- ------------------------
-- The application used to persist the free-tier counter with an upsert that
-- had NO conflict target. PostgREST therefore resolved `merge-duplicates`
-- against the PRIMARY KEY (`quota_usage.id`, a random uuid) instead of the
-- unique `(ip_hash, date)` constraint, so every second write for the same
-- visitor and day raised 23505 and the counter froze at 1 forever. The free
-- "10 answers a day" promise was never enforced.
--
-- Two fixes, both server-side:
--   1. `consume_quota` increments the counter in ONE statement under a row
--      lock, so N concurrent lambdas can never lose an increment.
--   2. `settle_credit` gives the routes a single atomic confirm-or-refund call
--      so a stream that dies mid-answer can never leave a reservation stuck in
--      `reserved` (which silently ate the user's credit).
--
-- Access model: both functions are SECURITY DEFINER and EXECUTE is granted to
-- service_role ONLY — no anon, no authenticated. The browser can never reach
-- them. Nothing here deletes or rewrites existing rows.

-- ------------------------------------------------------------------
-- 1) Atomic free-tier counter
-- ------------------------------------------------------------------
-- Returns the count AFTER this increment.
--
-- The INSERT ... ON CONFLICT (ip_hash, date) DO UPDATE is a single atomic
-- statement: Postgres serialises the two writers on the unique index, so the
-- returned `count` is always the true post-increment value.

create or replace function public.consume_quota(
  p_ip_hash text,
  p_day date
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
begin
  if p_ip_hash is null or length(btrim(p_ip_hash)) = 0 or length(p_ip_hash) > 128 then
    return null;
  end if;
  if p_day is null then
    return null;
  end if;

  insert into public.quota_usage (ip_hash, date, count)
  values (p_ip_hash, p_day, 1)
  on conflict (ip_hash, date) do update
    set count = public.quota_usage.count + 1
  returning count into v_count;

  return v_count;
end;
$$;

comment on function public.consume_quota(text, date) is
  'Atomically increments the per-IP/per-day free-tier counter. Returns the post-increment count. Service-role only.';

revoke all on function public.consume_quota(text, date) from public, anon, authenticated;
grant execute on function public.consume_quota(text, date) to service_role;

-- ------------------------------------------------------------------
-- 2) One-call credit settlement
-- ------------------------------------------------------------------
-- Called at the end of a stream instead of record_usage/refund_credit being
-- invoked separately and best-effort. Either the reservation is confirmed AND
-- a usage event is written, or the reservation is refunded — never both, never
-- neither. Idempotent per (user_id, reference_id).

create or replace function public.settle_credit(
  p_user_id uuid,
  p_reference text,
  p_outcome text,
  p_model text default null,
  p_feature text default null,
  p_input_tokens integer default null,
  p_output_tokens integer default null
)
returns json
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_reservation public.credit_reservations%rowtype;
  v_balance public.credit_balances%rowtype;
  v_usage_id uuid;
begin
  if p_user_id is null or p_reference is null or length(btrim(p_reference)) = 0 then
    return json_build_object('ok', false, 'reason', 'invalid_request');
  end if;
  if p_outcome not in ('success', 'failure', 'aborted') then
    return json_build_object('ok', false, 'reason', 'invalid_outcome');
  end if;

  select * into v_reservation
  from public.credit_reservations
  where user_id = p_user_id and reference_id = p_reference
  for update;

  if not found then
    -- Nothing was reserved (own-key request, or a replay after cleanup).
    return json_build_object('ok', false, 'reason', 'no_reservation');
  end if;

  -- Already settled: report the existing state, change nothing.
  if v_reservation.status = 'confirmed' then
    return json_build_object('ok', true, 'status', 'confirmed', 'replayed', true);
  end if;
  if v_reservation.status = 'refunded' then
    return json_build_object('ok', true, 'status', 'refunded', 'replayed', true);
  end if;

  if p_outcome = 'success' then
    insert into public.usage_events (
      user_id, model, feature_used, input_tokens, output_tokens,
      credits_consumed, request_status, reference_id
    )
    values (
      p_user_id, left(coalesce(p_model, ''), 120), left(coalesce(p_feature, ''), 80),
      p_input_tokens, p_output_tokens, 1, 'success', p_reference
    )
    on conflict (user_id, reference_id) where reference_id is not null do nothing
    returning id into v_usage_id;

    update public.credit_reservations
      set status = 'confirmed', updated_at = now()
      where id = v_reservation.id;

    insert into public.credit_ledger (user_id, transaction_type, credit_amount, description, reference_id)
      values (p_user_id, 'confirm', 0, 'credit reservation confirmed', p_reference)
      on conflict do nothing;

    return json_build_object('ok', true, 'status', 'confirmed', 'usage_event', v_usage_id);
  end if;

  -- failure / aborted → give the credit back exactly once
  select * into v_balance
  from public.credit_balances
  where user_id = p_user_id
  for update;

  if found then
    if v_reservation.source = 'daily' then
      update public.credit_balances
        set daily_usage = greatest(daily_usage - 1, 0), updated_at = now()
        where user_id = p_user_id;
    else
      update public.credit_balances
        set available_pack_credits = available_pack_credits + 1, updated_at = now()
        where user_id = p_user_id;
    end if;

    insert into public.credit_ledger (user_id, transaction_type, credit_amount, description, reference_id)
      values (p_user_id, 'refund', -1, v_reservation.source || ' credit refund', p_reference)
      on conflict do nothing;
  end if;

  update public.credit_reservations
    set status = 'refunded', updated_at = now()
    where id = v_reservation.id;

  insert into public.usage_events (user_id, credits_consumed, request_status, reference_id)
    values (p_user_id, 0, 'refund', p_reference)
    on conflict (user_id, reference_id) where reference_id is not null do nothing;

  return json_build_object('ok', true, 'status', 'refunded');
end;
$$;

comment on function public.settle_credit(uuid, text, text, text, text, integer, integer) is
  'Atomically confirms or refunds a credit reservation and records usage. Idempotent per reference. Service-role only.';

revoke all on function public.settle_credit(uuid, text, text, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.settle_credit(uuid, text, text, text, text, integer, integer)
  to service_role;

-- ------------------------------------------------------------------
-- 3) Reclaim abandoned reservations
-- ------------------------------------------------------------------
-- A lambda that is killed mid-stream (timeout, OOM, deploy) never settles its
-- reservation, so the credit would stay spent. This sweeper refunds anything
-- still `reserved` after 15 minutes, and is safe to run on a schedule.

create or replace function public.reclaim_stale_reservations(
  p_older_than interval default interval '15 minutes'
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public.credit_reservations%rowtype;
  v_count integer := 0;
begin
  for v_row in
    select * from public.credit_reservations
    where status = 'reserved'
      and updated_at < now() - p_older_than
    for update skip locked
  loop
    if v_row.source = 'daily' then
      update public.credit_balances
        set daily_usage = greatest(daily_usage - 1, 0), updated_at = now()
        where user_id = v_row.user_id;
    else
      update public.credit_balances
        set available_pack_credits = available_pack_credits + 1, updated_at = now()
        where user_id = v_row.user_id;
    end if;

    update public.credit_reservations
      set status = 'refunded', updated_at = now()
      where id = v_row.id;

    insert into public.credit_ledger (user_id, transaction_type, credit_amount, description, reference_id)
      values (v_row.user_id, 'refund', -1, 'stale reservation reclaimed', v_row.reference_id)
      on conflict do nothing;

    insert into public.usage_events (user_id, credits_consumed, request_status, reference_id)
      values (v_row.user_id, 0, 'aborted', v_row.reference_id)
      on conflict (user_id, reference_id) where reference_id is not null do nothing;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.reclaim_stale_reservations(interval) is
  'Refunds credit reservations abandoned by a killed request. Service-role only.';

revoke all on function public.reclaim_stale_reservations(interval) from public, anon, authenticated;
grant execute on function public.reclaim_stale_reservations(interval) to service_role;

-- Run the sweeper every 10 minutes (idempotent: unschedule then schedule).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'anvik-reclaim-stale-reservations') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'anvik-reclaim-stale-reservations';
  end if;
end
$$;

select cron.schedule(
  'anvik-reclaim-stale-reservations',
  '*/10 * * * *',
  $job$ select public.reclaim_stale_reservations(interval '15 minutes'); $job$
);

-- ------------------------------------------------------------------
-- 4) Idempotent pack grant
-- ------------------------------------------------------------------
-- The operator grant path did a JS read-modify-write:
--
--     read available_pack_credits -> add packTotal -> upsert
--
-- Two retries of the same request (or two operators clicking twice) could
-- either double-credit the user or lose credits to a lost update. It was also
-- not idempotent: there was no way to tell "already applied" from "apply now".
--
-- `grant_pack_credits` locks the balance row, increments it once, and records a
-- ledger entry keyed on a supplied idempotency reference. A replay returns
-- `applied: false` and changes nothing. Existing rows are only ever ADDED to —
-- nothing is deleted or reset.

create or replace function public.grant_pack_credits(
  p_user_id uuid,
  p_credits integer,
  p_reference text,
  p_description text default null,
  p_expires_at timestamptz default null
)
returns json
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_existing public.credit_ledger%rowtype;
  v_balance integer;
begin
  if p_user_id is null or p_reference is null or length(btrim(p_reference)) = 0 then
    return json_build_object('ok', false, 'reason', 'invalid_request');
  end if;
  if p_credits is null or p_credits <= 0 or p_credits > 100000 then
    return json_build_object('ok', false, 'reason', 'invalid_amount');
  end if;

  -- Replay guard: this exact grant was already applied.
  select * into v_existing
  from public.credit_ledger
  where user_id = p_user_id
    and reference_id = p_reference
    and transaction_type = 'pack_grant';

  if found then
    select available_pack_credits into v_balance
    from public.credit_balances where user_id = p_user_id;
    return json_build_object(
      'ok', true, 'applied', false, 'replayed', true,
      'available_pack_credits', coalesce(v_balance, 0)
    );
  end if;

  insert into public.credit_balances (user_id, available_pack_credits, pack_credits_expires_at, updated_at)
  values (p_user_id, p_credits, p_expires_at, now())
  on conflict (user_id) do update
    set available_pack_credits = public.credit_balances.available_pack_credits + p_credits,
        pack_credits_expires_at = coalesce(p_expires_at, public.credit_balances.pack_credits_expires_at),
        updated_at = now()
  returning available_pack_credits into v_balance;

  insert into public.credit_ledger (user_id, transaction_type, credit_amount, description, reference_id)
  values (p_user_id, 'pack_grant', p_credits, coalesce(p_description, 'pack credits granted'), p_reference);

  return json_build_object(
    'ok', true, 'applied', true, 'replayed', false,
    'available_pack_credits', v_balance
  );
end;
$$;

comment on function public.grant_pack_credits(uuid, integer, text, text, timestamptz) is
  'Adds pack credits exactly once per reference. Idempotent, row-locked. Service-role only.';

revoke all on function public.grant_pack_credits(uuid, integer, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.grant_pack_credits(uuid, integer, text, text, timestamptz)
  to service_role;
