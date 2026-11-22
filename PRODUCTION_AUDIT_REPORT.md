# ANVIK AI — Production Supabase Audit & Repair

- **Date:** 2026-11-22
- **Scope (never left this project):** Supabase project `anvik-ai-v2`, ref `xcpufhqegxumpqoeqmqb`, region `ap-south-1`, Postgres 17.12.0.000 — database `db.xcpufhqegxumpqoeqmqb.supabase.co`
- **Managed by:** this audit session — read-only first, then reviewed idempotent migrations, then verification
- **No user data was deleted, dropped or reset.** All fixes are additive and verified.

---

## 1. Confirmed root cause

**Every privileged write failed in production** — including the onboarding consent POST ("Could not save your consent. Please try again.") — because the production `public` schema only contained the three legacy tables (`chats`, `messages`, `quota_usage`) plus four anon policies on `chats`/`messages`. All of the v2 schema from the repo was missing: `entitlements`, `user_profiles`, `consent_records`, `user_entitlements`, `credit_balances`, `credit_ledger`, `usage_events`, and the server-side functions `reserve_credit`, `refund_credit`, `record_usage`.

`list_migrations` returned **zero recorded migrations**. The repo's migration files (`20261122000000_anvik_v2_initial.sql`, `20261122000001_entitlements.sql`, `20261123000000_multi_user_credits.sql`, `20261123000001_consent_records_hardening.sql`) had never been applied. No code change can fix a missing table — the tables and functions had to exist first.

The chat/messages auth-state path is unaffected (the four legacy anon policies match the repo exactly), which is why the app still loaded.

## 2. DB objects inspected (read-only, before changes)

| Item | State (before) |
|---|---|
| Tables in `public` | `chats`, `messages`, `quota_usage` (plus none of the v2 tables) |
| Columns | Full inventory checked against information_schema |
| Indexes | 2 on chats, 2 on messages, 3 on quota_usage — all present |
| RLS | Enabled on all three tables |
| Policies | 4 anon: `chats_anon_insert`, `chats_anon_select`, `messages_anon_insert`, `messages_anon_select` (matches repo exactly — intentional, not a defect) |
| Functions in `public` | **0** |
| Existing rows | chats 11, messages 22, quota_usage 3 — preserved, untouched |
| Active consent records | 0 — no duplicate active rows; unique constraint was safe to add |
| `auth.users` | 2 users (production accounts, untouched) |
| Migration history | **Empty** — root gap |

## 3. Migrations applied (reviewed, idempotent, non-destructive)

Applied via the Supabase connector in order, each verified record-applied:

1. **`entitlements`** — the repo's exact `20261122000001_entitlements.sql` (table, indexes, RLS enabled, no anon policies — device entitlements are server-only).
2. **`multi_user_credits`** — the repo's exact `20261123000000_multi_user_credits.sql`: 6 tables (`user_profiles`, `consent_records`, `user_entitlements`, `credit_balances`, `credit_ledger`, `usage_events`), indexes, RLS enabled on all, per-user select/update policies to `authenticated`, and the three functions `reserve_credit` / `refund_credit` / `record_usage` (`security definer`, `search_path = public`).
3. **`consent_records_hardening`** — the repo's exact `20261123000001_consent_records_hardening.sql`: existence re-check, `consent_records_user` index, duplicate-active-rows check (**0 duplicates found — the guard would have raised**), unique partial index `consent_records_active_user_id` on `(user_id)` where `withdrawn_at is null`, RLS select policy.
4. **`anvik_v2_initial`** — re-applied the repo's `20261122000000_anvik_v2_initial.sql` (safe `if not exists` / `drop policy if exists` form) to **record it in migration history**; no object was altered. The 4 migrations now appear in `list_migrations`: `entitlements`, `multi_user_credits`, `consent_records_hardening`, `anvik_v2_initial`.

Duplicate check before the unique index: **0** duplicate active consent rows (verified by query, not assumed).

## 4. RLS / policy / function verification (after changes)

- **Tables:** all 10 public tables exist, RLS enabled on all 10.
- **Policies (11):** the 4 legacy anon chat/message policies (unchanged, intentional) + `consent_records_select_own`, `credit_balances_select_own`, `credit_ledger_select_own`, `usage_events_select_own`, `user_entitlements_select_own`, `user_profiles_select_own`, `user_profiles_update_own` — all to `authenticated`, own-row (`user_id = auth.uid()`).
- **Indexes (19):** including `consent_records_active_user_id` (unique partial), `chats_user_created`, `messages_chat_created`, `quota_usage_date`, `quota_usage_ip_hash_date_key`, `usage_events_user_created` / `usage_events_reference`, `credits_ledger_user_created`, and the remaining pkeys.
- **Functions (3):** `reserve_credit(uuid, int, text)`, `refund_credit(uuid, text, text)`, `record_usage(uuid, text, text, text, text, int, int, text)` — all `security definer`, `search_path = public`.
- **Existing data re-checked after all changes:** chats 11, messages 22, quota_usage 3 — identical. 2 production users intact.

## 5. Functional verification (against production, with a synthetic test fixture)

A clearly-labeled synthetic fixture user (`00000000-0000-4000-8000-000000000001`, email `db-verification-test@anvik-ai.test`) was inserted, exercised, then deleted with full cascade verification (final counts: auth.users 2, all test-domain tables 0). **No real user data was touched.**

| Test | Result |
|---|---|
| Consent **save** (terms/privacy accepted, AI improvement = false) | ✅ `INSERT` returned the row, `ai_improvement_consent = false`, `withdrawn_at = null` |
| Consent **duplicate active row** (unique index) | ✅ rejected with `23505` duplicate key — the app's close+insert path is safe |
| Consent **update** (close active row → new row with AI improvement = true) | ✅ close applied (`withdrawn_at` set), new active row inserted, `ai_improvement_consent = true` |
| **Optional consent declined** (`ai_improvement_consent = false`) | ✅ saved and read back — the optional toggle is recorded explicitly, not inferred |
| **Optional consent update** (`set_ai_improvement` true → false path) | ✅ verified at the row level (close+insert) |
| `reserve_credit` | ✅ `{ ok: true, source: "daily", used: 1, remaining: 9 }` |
| `record_usage` | ✅ returned usage event id `d233bac7-…` |
| `refund_credit` | ✅ `true` |
| `reserve_credit` **idempotency** (same reference re-used) | ✅ refused — `{ ok: false, reason: "duplicate_request" }` |
| Final counts (post-cleanup) | chats/messages/quota_usage unchanged; test-domain tables empty; auth.users 2 |

What was verified at the SQL/PostgREST level (exactly what the app does via the service role): consent record/update/withdrawal row semantics, unique-active-row enforcement, credit reserve/record/refund, and idempotent replay protection. End-to-end via the live site (browser, real user, Google sign-in) was **not** performed — the sandbox has no browser access to the Vercel deployment and no network egress to it; that is a device-side check, see §7.

## 6. Auth & connectivity config

**Supabase auth (`get_auth_config`):**
- Site URL: `https://anvik-ai-v2.vercel.app` ✅
- Redirect URLs / allow list: `https://anvik-ai-v2.vercel.app/login`, `https://anvik-ai-v2.vercel.app/auth/reset` (+ a stale legacy `https://v0.app/chat/api/supabase/redirect/V1alf08cTgl` entry). This matches the app's actual OAuth flow: the login page exchanges `?code=` at `/login` (no `/auth/callback` route exists in the repo — nothing to add). ⚠️ the stale `v0.app` entry is harmless but should be pruned in the dashboard; not changed automatically.
- Google OAuth: **enabled**, client ID present (secret never read or recorded). `external_google_email_optional = false` (Google always supplies email).
- JWT exp 3600s; signup allowed; external email enabled; phone disabled; mailer auto-confirm **off** (confirmation emails required — UX handled in login); refresh-token rotation enabled (10s reuse interval).
- Health: `get_project_health` — all components healthy (Auth GoTrue v2.198.0, db, db_postgres_user, pooler, storage, pg_bouncer; realtime db/replication reports disconnected which is informational only for this app).

**Vercel (`anvik-ai-v2`, production `prj_oiiAHXbHfbf2vzdZPw1XsUwstcUK`, status READY):**
- Env vars present in production (names only — no values recorded, secrets never printed): `NEXT_PUBLIC_SITE_URL` (= `https://anvik-ai-v2.vercel.app`), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, `GEMINI_API_KEY` (value masked by the API, so presence is confirmed, content is not — verify in the Vercel dashboard if a prior deploy is suspect).
- Every server-side privileged-write call in the repo (`lib/supabase.ts`) resolves `SUPABASE_URL ?? NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY ?? SUPABASE_SERVICE_KEY` — **all keys present**. The server never falls back to the anon key, so this is fail-closed by design.
- `GEMINI_API_KEY` is required by `lib/provider.ts` (`GOOGLE_GENERATIVE_AI_API_KEY` → `GEMINI_API_KEY`) — present in production.
- Production deployment (`dpl_BS3fGk6NvFzUzxHcvpnT4qwV6zyd`) is **READY**, target production, commit `8ecc3e6`.

## 7. Remaining Vercel / device-side requirements

1. **Live browser check of the failure path** — reload the onboarding flow on the production site and confirm the consent card saves without "Could not save your consent." and that a re-read loads the saved state. (Not performed: no browser access to the deployment from this sandbox.)
2. **Confirm `GEMINI_API_KEY` value** in the Vercel dashboard (it is masked by the API) — chat depends on it.
3. **Prune the stale `v0.app` entry** from the Supabase redirect allow list (cosmetic; needs a manual Supabase dashboard action or an explicit instruction).
4. **Optional:** verify no duplicate-consent or duplicate-user records exist after the browser check (already false today: 0 active consent rows anywhere).
5. If Vercel project settings still point at a different source, confirm the production deployment is the merged PR #19 (`8ecc3e6`).

## 8. Confirmed outcomes

- ✅ Root cause identified and repaired (missing tables/functions + empty migration history).
- ✅ Schema now matches repo migrations — 10 tables, indexes, RLS, policies, 3 server functions, all verified.
- ✅ Consent save/read/update/withdrawal row semantics verified; unique-active-row enforcement verified (23505 on duplicate).
- ✅ Optional consent (AI improvement toggle) recorded explicitly — false by default, true only when accepted.
- ✅ Credit ledger (`reserve_credit` → `record_usage` → `refund_credit`) verified end-to-end, including idempotent replay refusal.
- ✅ No existing data lost; no real users touched; synthetic fixture fully cleaned up and verified gone.
- ✅ Auth config and RLS reviewed; no defects beyond the stale `v0.app` allow-list entry (cosmetic).
- ⚠️ Browser-level live verification remains a device-side step (§7.1) — the schema/infra fix is complete and verified at the data layer.
