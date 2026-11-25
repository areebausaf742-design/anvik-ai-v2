-- Incident tracking + daily health reports for autonomous self-healing.

create table if not exists public.incident_logs (
  id uuid primary key default gen_random_uuid(),
  signature text unique not null,
  severity text default 'error',
  route text,
  message text,
  stack text,
  occurrences int default 1,
  status text default 'open' check (status in ('open','pr_opened','resolved')),
  pr_url text,
  last_seen_at timestamptz default now(),
  created_at timestamptz default now()
);

create table if not exists public.daily_health_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date unique not null,
  total_incidents int default 0,
  auto_healed_count int default 0,
  prs_opened int default 0,
  summary_markdown text,
  created_at timestamptz default now()
);

alter table public.incident_logs enable row level security;
alter table public.daily_health_reports enable row level security;

-- Strict RLS: only service_role (server) can access. No anon/authenticated policies.
revoke all on public.incident_logs from anon, authenticated;
revoke all on public.daily_health_reports from anon, authenticated;
