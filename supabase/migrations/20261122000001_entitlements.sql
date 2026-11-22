-- ANVIK v2 — entitlements ledger (paid-plan activation)
--
-- Apply in the Supabase SQL editor after the initial migration. One row per
-- device: a pack (50 questions total, 30-day), daily (50/day, 30-day) or
-- yearly (50/day, 365-day) entitlement granted by an operator through the
-- admin grant endpoint. Expire rows degrade to the free tier — nothing is
-- auto-renewed.
--
-- Access model:
--   entitlements — RLS enabled with NO anon policies: server-only.

create table if not exists public.entitlements (
  device_id    text primary key,
  plan         text not null check (plan in ('pack', 'daily', 'yearly')),
  activated_at timestamptz not null default now(),
  expires_at   timestamptz not null,
  pack_total   integer,
  pack_used    integer not null default 0 check (pack_used >= 0),
  daily_day    date,
  daily_used   integer not null default 0 check (daily_used >= 0),
  created_at   timestamptz not null default now()
);

alter table public.entitlements enable row level security;

-- Intentionally NO anon policies: only the service role (the server) may
-- read or write it, so paid entitlements cannot be minted or gamed from the
-- browser.
