-- ANVIK v2 — initial schema (chats, messages, quota_usage)
--
-- Apply in the Supabase SQL editor (or via the migration tooling) for the
-- anvik-ai-v2 project. The tables are created `if not exists` so the file is
-- safe to re-run.
--
-- Access model:
--   chats / messages — RLS enabled; the anon key may INSERT/SELECT rows whose
--                     user_id is set ("own chats by user_id"). The server
--                     writes via the service-role key, which bypasses RLS.
--   quota_usage      — RLS enabled with NO anon policies: server-only.
--
-- Data flow: the chat route writes chats + messages after an answer completes;
-- the chat route reads and writes quota_usage server-side. Nothing here is
-- ever read by the browser except through the server.

create table if not exists public.chats (
  id         uuid primary key default gen_random_uuid(),
  user_id    text,
  title      text,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  chat_id    uuid not null references public.chats(id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  model_used text,
  created_at timestamptz not null default now()
);

create table if not exists public.quota_usage (
  id         uuid primary key default gen_random_uuid(),
  ip_hash    text not null,
  date       date not null,
  count      integer not null default 0 check (count >= 0),
  created_at timestamptz not null default now(),
  unique (ip_hash, date)
);

create index if not exists chats_user_created on public.chats (user_id, created_at desc);
create index if not exists messages_chat_created on public.messages (chat_id, created_at);
create index if not exists quota_usage_date on public.quota_usage (date);

alter table public.chats enable row level security;
alter table public.messages enable row level security;
alter table public.quota_usage enable row level security;

-- chats: anon may insert + select rows with a user_id they own. Since the
-- product has no accounts, "own" is enforced at the application layer (the
-- server always sets user_id = the client's device id from the request) and
-- the service-role key bypasses RLS. The policy guarantees at least that
-- rows without a user_id are invisible to anon reads.
drop policy if exists "chats_anon_insert" on public.chats;
create policy "chats_anon_insert" on public.chats
  for insert to anon
  with check (user_id is not null);

drop policy if exists "chats_anon_select" on public.chats;
create policy "chats_anon_select" on public.chats
  for select to anon
  using (user_id is not null);

-- messages follow their parent chat.
drop policy if exists "messages_anon_insert" on public.messages;
create policy "messages_anon_insert" on public.messages
  for insert to anon
  with check (
    exists (select 1 from public.chats c
            where c.id = chat_id and c.user_id is not null)
  );

drop policy if exists "messages_anon_select" on public.messages;
create policy "messages_anon_select" on public.messages
  for select to anon
  using (
    exists (select 1 from public.chats c
            where c.id = chat_id and c.user_id is not null)
  );

-- quota_usage: deliberately NO anon policies. Only the service role (the
-- server) may read or write it, so the free-tier limit cannot be bypassed
-- or gamed from the browser.
