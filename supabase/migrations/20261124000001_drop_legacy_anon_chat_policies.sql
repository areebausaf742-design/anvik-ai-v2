-- ANVIK v2 — retire the legacy anonymous chat policies
--
-- Context
-- -------
-- `20261122000000_anvik_v2_initial.sql` creates four anon policies:
--
--   chats_anon_insert, chats_anon_select,
--   messages_anon_insert, messages_anon_select
--
-- The live database no longer has them — access is account-scoped
-- (`chats_authenticated_select_own`, `messages_authenticated_select_own`) and
-- the server writes through the service role. But the stale file is still in
-- the repo, so replaying the migration set on a fresh branch or a restored
-- project would silently re-open anonymous INSERT/SELECT on every user's chat
-- history. Repo-vs-live drift is 6 migrations here against 17 applied.
--
-- This migration is the forward fix: it drops the legacy policies if they exist
-- and asserts the account-scoped model. It is idempotent and destroys no rows —
-- it only removes the anonymous grant.
--
-- After this file, the source of truth for chat access is:
--   * writes  → service role only (server routes)
--   * reads   → authenticated, `user_id = auth.uid()::text`
--   * anon    → no table privileges at all

-- 1) Drop the legacy anonymous policies, whatever state the database is in.
drop policy if exists "chats_anon_insert" on public.chats;
drop policy if exists "chats_anon_select" on public.chats;
drop policy if exists "messages_anon_insert" on public.messages;
drop policy if exists "messages_anon_select" on public.messages;

-- 2) Re-assert the account-scoped read policies (no-op when already present).
drop policy if exists "chats_authenticated_select_own" on public.chats;
create policy "chats_authenticated_select_own" on public.chats
  for select to authenticated
  using (user_id = auth.uid()::text);

drop policy if exists "messages_authenticated_select_own" on public.messages;
create policy "messages_authenticated_select_own" on public.messages
  for select to authenticated
  using (
    exists (
      select 1 from public.chats c
      where c.id = messages.chat_id
        and c.user_id = auth.uid()::text
    )
  );

-- 3) RLS stays on. Never disable it (this is a comment, not a toggle).
alter table public.chats enable row level security;
alter table public.messages enable row level security;

comment on table public.chats is
  'Account-scoped. Written by the service role; read by the owner only. No anonymous access.';
