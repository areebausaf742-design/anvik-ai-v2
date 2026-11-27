-- model_versions: registry for trained candidate models (Phase 8 — training pipeline).
-- A candidate serves traffic only after it beats the current baseline on the
-- evaluation harness: first in shadow mode, then as a small canary, with
-- one-click rollback. Promotion state is tracked here.

create table if not exists public.model_versions (
  id text primary key,
  base_model text not null,
  adapter_path text,
  gguf_path text,
  status text not null default 'candidate' check (status in ('candidate','shadow','canary','promoted','rolled_back')),
  eval_score numeric,
  baseline_score numeric,
  traffic_pct integer not null default 0 check (traffic_pct between 0 and 100),
  created_at timestamptz not null default now(),
  promoted_at timestamptz,
  rolled_back_at timestamptz,
  notes text
);

create index if not exists model_versions_status_idx on public.model_versions (status, created_at desc);

alter table public.model_versions enable row level security;

-- Authenticated users may read promoted/canary models (transparency).
drop policy if exists model_versions_select_authenticated on public.model_versions;
create policy model_versions_select_authenticated
  on public.model_versions
  for select
  to authenticated
  using (status in ('promoted', 'canary'));

-- Service role writes (no anon/authenticated write).
