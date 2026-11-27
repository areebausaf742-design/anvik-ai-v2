-- prompt_versions: versioned prompt library (Phase 6 — intelligence layer).
-- One row per prompt version; the chat route records the version id used on
-- every response so scores can be attributed per prompt version.

create table if not exists public.prompt_versions (
  id text primary key,
  mode text not null,
  library_version text not null,
  system_prompt text not null,
  created_at timestamptz not null default now(),
  active boolean not null default true
);

create index if not exists prompt_versions_mode_idx on public.prompt_versions (mode, active);

alter table public.prompt_versions enable row level security;

-- Authenticated users may read active prompt versions (for transparency / /design).
drop policy if exists prompt_versions_select_authenticated on public.prompt_versions;
create policy prompt_versions_select_authenticated
  on public.prompt_versions
  for select
  to authenticated
  using (active = true);

-- Service role writes (no anon/authenticated write).
