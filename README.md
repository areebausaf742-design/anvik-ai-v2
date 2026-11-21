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
  back to the free Pollinations Flux endpoint. The gallery stores **URLs**, capped at 6, never base64.
- **Code lab** (`/code`) — streams a code draft plus an explanation from `/api/code`.
- **Voice** (`/voice`) — browser speech recognition, then the transcript is answered by `/api/voice`.
- **Vision** (`/vision`) — upload an image (≤3 MB) and ask about it.
- **Answer engine** (`/api/ask`, `/j/[slug]`) — the corpus-backed, three-language answer path with
  quota, rate limiting, moderation and a spend ceiling. Public answers get their own shareable page.
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
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | optional | Mirror questions/answers to Postgres (schema in `lib/supabase.ts`). Also enables the optional `/api/learn` copy of likes and corrections. |
| `ANVIK_MODEL` / `ANVIK_IMAGE_MODEL` | optional | Model overrides. |

A user can also paste their own key in Settings; it stays in that browser and is sent only with
their own requests.

## Storage and why it never 500s

`lib/store.ts` resolves, in order: Supabase (when configured) → in-memory document seeded from the
corpus → a JSON file **only if the filesystem is writable**. On a read-only deployment filesystem
the file step is skipped silently, so `/j/[slug]`, `/sitemap.xml` and `/api/ask` keep answering from
memory instead of throwing `EACCES`.

## Project checks

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
npm test            # 46 tests, node:test
npm run build       # production build
npm run verify:chat # live check: do real answers come from Gemini?
```

`npm run verify:chat` sends the five reference prompts ("hii", "what is car?", "what is AI?",
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
