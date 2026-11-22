-- ANVIK v2 — multi-user accounts, consent and credit ledger
--
-- Apply in the Supabase SQL editor for the anvik-ai-v2 project. The tables
-- are created `if not exists` / `alter ... if not exists` so the file is safe
-- to re-run. Every table is RLS-enabled.
--
-- Access model:
--   user_profiles      — RLS: users may read + update their own row; inserts
--                        and writes happen via the service role only.
--   consent_records    — RLS: users may read their own rows (no direct write).
--   user_entitlements  — RLS: users may read their own row (no direct write).
--   credit_balances    — RLS: users may read their own row (no direct write).
--   credit_ledger      — RLS: users may read their own rows (no direct write).
--   usage_events       — RLS: users may read their own rows (no direct write).
-- All privileged operations go through server-side functions using the
-- service-role key. The browser never writes credits or plans directly.
--
-- Atomic enforcement lives in the `reserve_credit` function: it takes a row
-- lock, resets for the new IST day, and either spends a daily credit or
-- falls back to a pack credit — all in one transaction, so two concurrent
-- requests from the same user can never spend the same final credit.
--
-- Idempotency: the caller passes a client-generated reference (request id);
-- if a successful usage row already exists for (user_id, reference), the
-- call is refused as a duplicate without spending anything.

-- ------------------------------------------------------------------
-- Tables
-- ------------------------------------------------------------------

create table if not exists public.user_profiles (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  email                text not null,
  display_name         text,
  avatar_url           text,
  provider             text not null default 'email',
  account_status       text not null default 'active' check (account_status in ('active', 'suspended', 'deleted')),
  terms_accepted_at    timestamptz,
  privacy_accepted_at  timestamptz,
  ai_improvement_consent boolean not null default false,
  ai_improvement_consent_at timestamptz,
  consent_withdrawal_at timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table if not exists public.consent_records (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  agreement_version text not null,
  privacy_version   text not null,
  terms_accepted_at   timestamptz not null default now(),
  privacy_accepted_at timestamptz not null default now(),
  ai_improvement_consent boolean not null default false,
  ai_improvement_consent_at timestamptz,
  withdrawn_at     timestamptz,
  created_at   timestamptz not null default now()
);

create table if not exists public.user_entitlements (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  plan_id              text not null default 'free' check (plan_id in ('free', 'pack', 'daily', 'yearly')),
  daily_message_limit  integer not null default 10 check (daily_message_limit >= 0),
  current_plan_status  text not null default 'active' check (current_plan_status in ('active', 'expired', 'pending')),
  entitlement_start    timestamptz not null default now(),
  entitlement_expiry   timestamptz
);

create table if not exists public.credit_balances (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  available_pack_credits integer not null default 0 check (available_pack_credits >= 0),
  daily_usage      integer not null default 0 check (daily_usage >= 0),
  daily_limit      integer not null default 10 check (daily_limit >= 0),
  last_reset_at    timestamptz not null default now(),
  pack_credits_expires_at timestamptz,
  updated_at       timestamptz not null default now()
);

create table if not exists public.credit_ledger (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  transaction_type text not null check (transaction_type in ('reserve', 'confirm', 'refund', 'pack_grant', 'daily_reset', 'grant', 'adjustment')),
  credit_amount    integer not null,
  description      text,
  reference_id     text,
  created_at       timestamptz not null default now()
);

create table if not exists public.usage_events (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  model           text,
  feature_used    text,
  input_tokens    integer,
  output_tokens   integer,
  credits_consumed integer not null default 1 check (credits_consumed >= 0),
  request_status  text not null default 'success' check (request_status in ('success', 'failure', 'refund', 'aborted')),
  reference_id    text,
  created_at      timestamptz not null default now()
);

create index if not exists credits_ledger_user_created on public.credit_ledger (user_id, created_at desc);
create index if not exists usage_events_user_created on public.usage_events (user_id, created_at desc);
create index if not exists usage_events_reference on public.usage_events (user_id, reference_id) where reference_id is not null;
create index if not exists consent_records_user on public.consent_records (user_id, created_at desc);

-- ------------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------------

alter table public.user_profiles enable row level security;
alter table public.consent_records enable row level security;
alter table public.user_entitlements enable row level security;
alter table public.credit_balances enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.usage_events enable row level security;

-- user_profiles: read + update own row; no anon insert/delete
drop policy if exists "user_profiles_select_own" on public.user_profiles;
create policy "user_profiles_select_own" on public.user_profiles
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "user_profiles_update_own" on public.user_profiles;
create policy "user_profiles_update_own" on public.user_profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- consent_records: read own rows only
drop policy if exists "consent_records_select_own" on public.consent_records;
create policy "consent_records_select_own" on public.consent_records
  for select to authenticated
  using (user_id = auth.uid());

-- user_entitlements: read own row only
drop policy if exists "user_entitlements_select_own" on public.user_entitlements;
create policy "user_entitlements_select_own" on public.user_entitlements
  for select to authenticated
  using (user_id = auth.uid());

-- credit_balances: read own row only
drop policy if exists "credit_balances_select_own" on public.credit_balances;
create policy "credit_balances_select_own" on public.credit_balances
  for select to authenticated
  using (user_id = auth.uid());

-- credit_ledger: read own rows only
drop policy if exists "credit_ledger_select_own" on public.credit_ledger;
create policy "credit_ledger_select_own" on public.credit_ledger
  for select to authenticated
  using (user_id = auth.uid());

-- usage_events: read own rows only
drop policy if exists "usage_events_select_own" on public.usage_events;
create policy "usage_events_select_own" on public.usage_events
  for select to authenticated
  using (user_id = auth.uid());

-- ------------------------------------------------------------------
-- Atomic credit reservation
--
-- p_daily_limit: the user's current per-day allowance (free=10, daily=50).
-- p_daily_limit = 0 + pack credits on file -> straight to pack.
-- Returns a json object:
--   ok      boolean  — reserved
--   source  'daily' | 'pack' | 'none'
--   reason  null | 'exhausted' | 'duplicate_request' | 'not_active'
--   used    integer (daily usage AFTER this call)
--   remaining integer (daily remaining after this call; 0 for pack)
--   pack_remaining integer (pack credits remaining after this call)
-- ------------------------------------------------------------------

create or replace function public.reserve_credit(
  p_user_id uuid,
  p_daily_limit integer default 10,
  p_reference text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ist date := (now() at time zone 'Asia/Kolkata')::date;
  v_row credit_balances%rowtype;
  v_dup boolean;
begin
  if p_user_id is null then
    return json_build_object('ok', false, 'reason', 'not_active', 'source', 'none',
                             'used', 0, 'remaining', 0, 'pack_remaining', 0);
  end if;

  -- idempotency: never spend twice for the same request reference
  if p_reference is not null and p_reference <> '' then
    select exists(
      select 1 from public.usage_events
      where user_id = p_user_id and reference_id = p_reference and request_status = 'success'
    ) into v_dup;
    if v_dup then
      return json_build_object('ok', false, 'reason', 'duplicate_request', 'source', 'none',
                               'used', 0, 'remaining', 0, 'pack_remaining', 0);
    end if;
  end if;

  insert into public.credit_balances (user_id, daily_limit, daily_usage, last_reset_at)
  values (p_user_id, p_daily_limit, 0, now())
  on conflict (user_id)
    do update set daily_limit = excluded.daily_limit;

  select * into v_row from public.credit_balances where user_id = p_user_id for update;

  -- new IST day → fresh allowance
  if (v_row.last_reset_at at time zone 'Asia/Kolkata')::date < v_ist
     or v_row.last_reset_at is null then
    update public.credit_balances
      set daily_usage = 0, last_reset_at = now(), updated_at = now()
      where user_id = p_user_id;
    v_row.daily_usage := 0;
  end if;

  -- daily credit available?
  if v_row.daily_usage < p_daily_limit then
    update public.credit_balances
      set daily_usage = daily_usage + 1, updated_at = now()
      where user_id = p_user_id;

    insert into public.credit_ledger (user_id, transaction_type, credit_amount, description, reference_id)
    values (p_user_id, 'reserve', 1, 'daily credit reservation', p_reference);

    return json_build_object('ok', true, 'source', 'daily', 'reason', null,
                             'used', v_row.daily_usage + 1,
                             'remaining', p_daily_limit - v_row.daily_usage - 1,
                             'pack_remaining', v_row.available_pack_credits);
  end if;

  -- daily exhausted → fall back to pack credits (one-time allowance)
  if coalesce(v_row.available_pack_credits, 0) > 0 then
    update public.credit_balances
      set available_pack_credits = available_pack_credits - 1, updated_at = now()
      where user_id = p_user_id;

    insert into public.credit_ledger (user_id, transaction_type, credit_amount, description, reference_id)
    values (p_user_id, 'reserve', 1, 'pack credit reservation', p_reference);

    return json_build_object('ok', true, 'source', 'pack', 'reason', null,
                             'used', v_row.daily_usage,
                             'remaining', 0,
                             'pack_remaining', v_row.available_pack_credits - 1);
  end if;

  return json_build_object('ok', false, 'reason', 'exhausted', 'source', 'none',
                           'used', v_row.daily_usage, 'remaining', 0,
                           'pack_remaining', 0);
end;
$$;

-- ------------------------------------------------------------------
-- Refund — release a reservation after a failed or aborted request.
-- Returns true when a reservation was actually released.
-- ------------------------------------------------------------------

create or replace function public.refund_credit(
  p_user_id uuid,
  p_source text,
  p_reference text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row credit_balances%rowtype;
begin
  select * into v_row from public.credit_balances where user_id = p_user_id for update;
  if not found then
    return false;
  end if;

  if p_source = 'daily' then
    if v_row.daily_usage > 0 then
      update public.credit_balances
        set daily_usage = daily_usage - 1, updated_at = now()
        where user_id = p_user_id;
      insert into public.credit_ledger (user_id, transaction_type, credit_amount, description, reference_id)
      values (p_user_id, 'refund', -1, 'daily credit refund', p_reference);
      return true;
    end if;
    return false;
  end if;

  if p_source = 'pack' then
    update public.credit_balances
      set available_pack_credits = available_pack_credits + 1, updated_at = now()
      where user_id = p_user_id;
    insert into public.credit_ledger (user_id, transaction_type, credit_amount, description, reference_id)
    values (p_user_id, 'refund', -1, 'pack credit refund', p_reference);
    return true;
  end if;

  return false;
end;
$$;

-- ------------------------------------------------------------------
-- Record a finalized usage event + ledger entry.
-- ------------------------------------------------------------------

create or replace function public.record_usage(
  p_user_id uuid,
  p_source text,
  p_reference text,
  p_model text,
  p_feature text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_status text default 'success'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- One usage-event row per request (auditable). The credit movement is
  -- already recorded by reserve_credit ('reserve', +1) and later by
  -- refund_credit ('refund', -1) — we never double-count here.
  insert into public.usage_events (
    user_id, model, feature_used, input_tokens, output_tokens,
    credits_consumed, request_status, reference_id
  )
  values (
    p_user_id, p_model, p_feature, p_input_tokens, p_output_tokens,
    1, p_status, p_reference
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- email signup hook support: nothing automatic here — user_profiles rows
-- are created/updated by the server after verification.
