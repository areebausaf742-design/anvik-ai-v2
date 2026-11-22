# ANVIK AI

**A straight answer, in the language you asked in.** Ask in English, Hindi or Hinglish and get the
steps, the fee, the office and the official page — free to start, no account required.

## What works

- **Chat** (`/chat`) — conversations with Fast / Smart / Creative / Coder modes, Markdown
  rendering, conversation search, browser dictation, copy-to-clipboard. History is kept in this
  browser (capped so it can't silently stop saving).
- **Every answer comes from Gemini.** One flow, no exceptions: your message → validated → sent to
  `gemini-2.0-flash` → a safety check → Gemini's answer. There is no corpus lookup, no answer cache
  and no local reply for greetings in chat. If the model cannot be reached you get
  `Add valid Gemini key in Settings` with a 401 — never a substitute answer dressed up as one.
- **Safety check** (`lib/checker.ts`) — the last step before an answer is shown, and it only has
  three jobs: an empty answer fails, abuse is refused, and an invented helpline number is replaced
  with the real one. It never rewrites an answer, never changes its topic, and never swaps in text
  about something else.
- **Learning** (`lib/learning.ts`) — like / dislike / "Teach ANVIK" under each reply, stored in
  `anvik-memory` and `anvik-learning` on the device. Keys, passwords, phone numbers, Aadhaar and card
  numbers are stripped before anything is written. Feedback is a record, not a lookup: it never
  replaces a fresh answer.
- **Image studio** (`/image`) — Gemini image generation when a key is present, automatically falling
  back to the free Pollinations Flux endpoint. The gallery stores compressed images in this browser,
  capped at 12.
- **Code lab** (`/code`) — streams a code draft plus an explanation from `/api/code`.
- **Voice** (`/voice`) — browser speech recognition, then the transcript is answered by `/api/voice`.
- **Vision** (`/vision`) — upload an image (≤3 MB) and ask about it.
- **Answer engine** (`/api/ask`, `/j/[slug]`) — the corpus-backed, three-language answer path with
  quota, rate limiting, moderation and a spend ceiling. Public answers get their own shareable page.
- **Projects** (`/projects`) — every conversation as a searchable project: grouped by recency,
  with rename, two-step delete and Open-in-Chat deep links.
- **Artifacts** (`/artifacts`) — every image rendered in the studio, kept on this device: download,
  copy prompt, two-step delete, empty-state CTA back to the studio.
- **Settings** (`/settings`) — add or remove a browser-local Gemini key, pick a mode, set response
  character, clear history.

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
cp .env.example .env.local   # optional: add GOOGLE_GENERATIVE_AI_API_KEY
npm run dev
```

Open http://localhost:3000. Without a key the product still runs: Chat answers in demo mode,
`/api/ask` answers from the corpus, and Code/Voice/Vision return a clear "add a key" message.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `GOOGLE_GENERATIVE_AI_API_KEY` | recommended | The **only** Gemini key name. Used by every route. |
| `NEXT_PUBLIC_SITE_URL` | in production | Canonical origin for sitemap, robots, metadata and share cards. |
| `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | for accounts | Public URL + publishable key — safe to ship to the browser. |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | for accounts (server) | Server-only service role. Used exclusively server-side for consent, credits, entitlements and history. Never in the browser. |
| `ANVIK_ADMIN_TOKEN` | for paid-plan activation | Operator token for `/api/entitlements/grant`. Never in the browser. |
| `ANVIK_MODEL` / `ANVIK_IMAGE_MODEL` | optional | Model overrides. |

A user can also paste their own key in Settings; it stays in that browser and is sent only with
their own requests.

## Storage and why it never 500s

`lib/store.ts` resolves, in order: Supabase (when configured) → in-memory document seeded from the
corpus → a JSON file **only if the filesystem is writable**. On a read-only deployment filesystem
the file step is skipped silently, so `/j/[slug]`, `/sitemap.xml` and `/api/ask` keep answering from
memory instead of throwing `EACCES`.

## Accounts, consent and credits (v3)

Supabase Auth + per-user credit system. All privileged operations run server-side
with the service role; the browser holds only the public publishable key and its own
session (a bearer access token, validated per request against Supabase).

- **Sign in** — `/login`: Google (PKCE, no client secret) or email + password (signup and
  signin), password recovery, "Already have an account?" toggle, "Continue without an account"
  (anonymous free tier). Returning users skip onboarding; new users are routed there.
- **Onboarding** — `/onboarding`, full-screen, one step at a time: identity (verified Google name
  or sanitized email fallback), Terms of Service (required), Privacy Policy (required), and the
  **AI Model Improvement Consent** (optional, never preselected, explicit opt-out path, withdrawal
  always available). Consent is recorded server-side with versions + timestamps.
- **Welcome** — `/welcome`, personalized "Hello, {name}." + "Welcome to ANVIK AI." +
  "Your intelligence companion is ready." with animated gradient lighting and ambient
  particles (reduced-motion respected).
- **Account** — `/account`: profile, subscription, credits (daily used/remaining with IST-day
  reset), usage history, transaction ledger, AI-improvement consent toggle, sign-out.
- **Credits** — `user_entitlements` (one per user: plan, daily limit, status, expiry),
  `credit_balances` (daily usage + pack credits), `credit_ledger` (append-only audit),
  `usage_events` (per-request outcomes). Atomic enforcement lives in the `reserve_credit`
  Postgres function (row lock, IST-day reset, daily-first then pack fallback, idempotent by
  request reference). Refunds use `refund_credit`; successful usage is recorded with
  `record_usage`. Paid plans are granted only by an operator (the authorised admin grant
  endpoint) — never by the browser or by WhatsApp enquiry.
- **Enforcement** — `/api/chat` and `/api/quota` resolve the bearer token first. Verified users
  are governed by the per-user system; anonymous users keep the original device/IP-based path.

Migration: `supabase/migrations/20261123000000_multi_user_credits.sql` (paste into the
`anvik-ai-v2` Supabase SQL editor — the Supabase connector only reaches other projects).

## Backend v2 — schema, quota, chat

The `chats`, `messages` and `quota_usage` tables live in the `anvik-ai-v2` Supabase project
(Mumbai, India South). Create them with the migration in
`supabase/migrations/20261122000000_anvik_v2_initial.sql` — paste it in the Supabase SQL editor
(the connector only reaches other projects, so the SQL must be applied there by hand).

- `chats` — one row per ANVIK conversation (`user_id` = device id, `title` = first 60 chars of the
  user's message). RLS enabled; anon may insert/select own rows by `user_id`.
- `messages` — one row per user turn and one per assistant turn (`model_used` = the model that
  produced it). RLS enabled, same scope as `chats`.
- `quota_usage` — one row per `(ip_hash, date)`; `count` = free answers used that day. RLS enabled
  with **no** anon policies: server-only. IP addresses are salted-hashed before they reach the DB.

**Quota is server-side**, counted per IP + IST day, 20 free answers per visitor per day on the
server key — unlimited on a user's own key. The count is persisted **only after a successful stream**
(never on a failed request), with an in-process reservation so a process cannot double-spend the
same slot. `/api/quota` reads the same table and returns
`{"hasServerKey":true,"status":"ok","remaining":X,"googleStatus":200,"modelUsed":"gemini-2.5-flash","limit":20}`.

**Chat pipeline** (`/api/chat`): strict validation (4,000 chars per message, 40 messages max,
last turn a user turn, secrets stripped) → prompt-injection screen (key/prompt exfiltration is
refused 403 before any paid call) → key resolution (user key wins, else server key — never the
other way around) → per-IP rate limit (1 request / 2s, 60 / minute) → quota → Gemini with
streaming + fallback (gemini-2.5-flash → gemini-2.0-flash → gemini-2.0-flash-lite, 404/429/500
fall forward, 1s/2s backoff per model, 60s cap). Answers are streamed as tokens arrive — first
token < 1s with the default model. Clients that ask for `text/event-stream` receive the same
tokens as SSE frames; the locked chat UI continues to read the raw text stream.

**Security** — `GEMINI_API_KEY`/`GOOGLE_GENERATIVE_AI_API_KEY` never leave the server; both
`AIza` and `AQ` key prefixes are accepted everywhere; prompts containing secrets are redacted
before they reach Gemini; key material is never logged (audit logs carry only the last 4 chars);
images are capped at 3 MB (vision compresses before sending); `/api/health` answers keyless.

## Project checks

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
npm test            # 93 tests, node:test
npm run build       # production build
npm run verify:chat # live check: do real answers come from Gemini?
```

`npm run verify:chat` sends the five reference prompts ("hii", "What is the speed of light?", "what is AI?",
"write python code for calculator", "what is photosynthesis?") to a running `/api/chat` and fails if
any answer is off-topic, is corpus text, or does not report `X-ANVIK-SOURCE: gemini`. It needs a real
key:

```bash
npm run verify:chat -- --key AIza... --url https://your-deployment
```

`tests/route.test.ts` guards the same property statically: the chat route and the composer are
checked for any import of the corpus, the cache or a local-answer path, so the shortcut cannot be
wired back in without a failing test.

## Deploy

Import the repo in Vercel, add `GOOGLE_GENERATIVE_AI_API_KEY` and `NEXT_PUBLIC_SITE_URL`, then
deploy. No database is required to boot; add the Supabase variables when you want durable storage.

See `docs/ANVIK-PLAN.md` for the product and design reasoning, and `AUDIT-2026-11-21.md` for the
audit that drove the current structure.
