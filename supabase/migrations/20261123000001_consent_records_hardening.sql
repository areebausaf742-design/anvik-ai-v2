-- ANVIK v2 — consent_records hardening
--
-- This file is SAFE TO RE-RUN (idempotent). It does three things:
--
--  1. Ensures the consent_records table exists in its canonical shape (in
--     case the environment was created from an older schema).
--  2. Enforces the "at most one active consent row per user" invariant with a
--     partial unique index. A withdrawal leaves an active row no longer active
--     (withdrawn_at is set), so the index allows the withdrawal history to be
--     appended while guaranteeing exactly one active row at a time.
--  3. Re-asserts the RLS policy so users can read their own rows only.
--     Writes always go through the service role, which bypasses RLS.
--
-- NOTE: the partial unique index will fail loudly if the table already
-- contains users with multiple active rows. Run this only after reviewing
-- `select user_id, count(*) from public.consent_records
--   where withdrawn_at is null group by user_id having count(*) > 1`.
--
-- Apply in the Supabase SQL editor for the ANVIK AI V2 project. Do NOT apply
-- to any other project.

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

create index if not exists consent_records_user on public.consent_records (user_id, created_at desc);

-- Fail loudly (without fabricating or deleting any history) when the table
-- already contains users with more than one active row.
do $$
declare
  dup_count integer;
begin
  select count(*) into dup_count
  from (
    select user_id
    from public.consent_records
    where withdrawn_at is null
    group by user_id
    having count(*) > 1
  ) dupes;
  if dup_count > 0 then
    raise exception 'consent_records has duplicate active rows for % user(s); review and resolve before applying the active-row uniqueness index', dup_count;
  end if;
end $$;

create unique index if not exists consent_records_active_user_id
  on public.consent_records (user_id)
  where withdrawn_at is null;

alter table public.consent_records enable row level security;

drop policy if exists "consent_records_select_own" on public.consent_records;
create policy "consent_records_select_own" on public.consent_records
  for select to authenticated
  using (user_id = auth.uid());
