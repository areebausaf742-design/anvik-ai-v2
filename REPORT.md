# ANVIK AI V2 — Rebuild Report

**Date:** 2026-11-27
**Branch:** `main` (after Phases 1–9)
**Method:** 9 phases, each on a fresh branch, with typecheck + lint + tests + production build before merge. 9 PRs merged (#59–#67).

## What changed

### Phase 1 — Public home page + auth gate (PR #59)
- Replaced the gated chat workspace on `/` with a public, no-login landing page: confident ANVIK wordmark hero, live interactive chat bar (roaming `@property` conic-gradient light band, living rotating placeholder), Chat/Image/Code/Vision showcase, quiet footer.
- Pressing send on the public bar stashes the draft + destination in `sessionStorage` and hands off to `/login`; after sign-in, `/chat` restores the draft (cleared on read, never sent twice) and sends it.
- `app/page.tsx`, `components/anvik/landing/*`, `app/globals.css` (landing CSS).

### Phase 2 — Design system (PR #61)
- `lib/utils.ts` — dependency-free `cn()` helper.
- `components/anvik/ui/{button,card,input,badge,separator}.tsx` + index — Button (variants/sizes/asChild), Card, Input, Badge, Separator, all styled via `var(--theme-*)` so System/Light/Dark switching is automatic and WCAG AA contrast is preserved.
- `app/design/page.tsx` — living style guide: token swatches, typography scale, component states, theme switcher that persists.
- Landing page migrated onto the library (hero CTA → Button, mode showcase → Cards).

### Phase 3 — Chat core (PR #62)
- Thumbs feedback with reason chips (Inaccurate, Off-topic, Too verbose, Missing sources, Wrong code) added to `FeedbackBar`; reasons stored on the `Feedback` record (new optional `reasons` field, backward-compatible).
- Chat core already had SSE streaming, GFM markdown + math, syntax-highlighted code blocks, message actions, stop, regenerate, edit+resubmit, scroll respect + jump-to-latest pill, palette, conversation search/rename/delete-with-undo, autosaved drafts, keyboard shortcuts.

### Phase 4 — "Anvik is thinking" light-sweep moment (PR #63)
- Assistant row shows "Anvik is thinking" (or "Anvik is searching" for grounded answers) with a soft band of light travelling through the letters left-to-right in ~1.4s (animated `background-position` on a clipped gradient, GPU-composited, no layout shift). Base letters use the muted text color; the sweeping highlight uses the primary text color with a faint accent tint. The row holds its height so the first streamed token crossfades in. After 6s a quiet "Still working…" appears. Reduced-motion users see a static muted-to-primary gradient.

### Phase 5 — Backend hardening (PR #64)
- `lib/feature-flags.ts` — env-based kill switches for every major capability (`ANVIK_FEATURE_<NAME>`), default ON.
- `app/api/ready/route.ts` — readiness probe verifying Supabase + Gemini reachability (3s caps), 200 ready / 503 not_ready. Complements `/api/health`.
- `app/api/chat/route.ts` — gates chat behind `FEATURES.chat` and forces deep search off when `FEATURES.deepSearch` is disabled.

### Phase 6 — Intelligence layer (PR #65)
- `lib/prompt-library.ts` — versioned system prompts per mode (chat/study/code/vision/image) with stable ids (`anvik-<mode>-v1`) and a shared Anvik persona + honesty/uncertainty rules. Every response records the prompt version used (`X-ANVIK-PROMPT-VERSION` header + done frame).
- `lib/task-router.ts` — `classifyTask` + `routeTask`: casual/factual/reasoning/coding/study/vision/image → temperature + maxOutputTokens + needsSearch.
- `app/api/chat/route.ts` — uses the versioned prompt; Smart mode appends a plan→answer→self-check instruction.
- `supabase/migrations/20261128000000_prompt_versions.sql` — `prompt_versions` table with RLS.
- `tests/golden/prompts.json` — 30-prompt golden set across chat/study/code/multilingual.
- `scripts/eval.ts` — eval runner with deterministic checks (CI gate).

### Phase 7 — Remaining surfaces (PR #66)
- `components/anvik/skeleton.tsx` — `Skeleton` + `SkeletonCard` primitives on the design tokens.
- `app/{chat,image,code,vision,account,settings,projects,artifacts}/loading.tsx` — per-route skeletons shaped like real content.

### Phase 8 — Training pipeline (PR #67)
- `supabase/migrations/20261129000000_model_versions.sql` — `model_versions` table (candidate/shadow/canary/promoted/rolled_back) with RLS.
- `lib/model-versions.ts` — `canPromote`, `nextStatus`, `canRollback` (promotion gate helpers).
- `scripts/pii-scrub.ts` — PII scrubber for the opt-in dataset (names/emails/phones/keys/cards/Aadhaar/tokens).
- `scripts/finetune.py` — Unsloth LoRA fine-tuning + GGUF export + candidate registration (Colab-friendly).

### Phase 9 — Final polish (this PR)
- `scripts/load-test.k6.js` — k6 load test for the chat path (p50/p95/p99, throughput, error rate).
- `REPORT.md` — this report.

## Auth gate (Phase 1 follow-up)
- `app/api/auth/session-cookie/route.ts` — HttpOnly `anvik_session` cookie, set only after Supabase verifies the bearer token; cleared on sign-out.
- `middleware.ts` — edge auth gate: protected pages redirect to `/login?next=...`; protected API routes (`/api/image`, `/api/code`, `/api/voice`, `/api/vision`) return 401 at the edge; public pages + guest chat remain accessible.
- `tests/middleware-callback.test.ts` — updated to new intended behavior + added protected-route redirect, protected-API-401, device-cookie-on-redirect coverage.
- `tests/e2e/auth-gate.spec.ts` + `playwright.config.ts` — Playwright E2E: guest opens public page + uses chat bar; sending redirects to `/login` and preserves draft in `sessionStorage`. (Verified passing against real `next dev` + Chromium.)

## Before / after

### Bundle size (first-load JS)
| Route | Before | After |
|---|---|---|
| `/` (landing) | 415 kB (full chat workspace + Three.js orb) | 111 kB |
| `/chat` | 396 kB | 417 kB (added react-virtuoso virtualization) |
| `/design` | — | 106 kB |
| Shared (all routes) | 103 kB | 103 kB |

### Tests
| Metric | Before | After |
|---|---|---|
| Unit tests | 380 | 383 |
| Pass rate | 380/380 | 383/383 |
| Typecheck errors | 0 | 0 |
| Lint warnings | 0 | 0 |

### Routes
| Metric | Before | After |
|---|---|---|
| Total routes | 33 | 34 (+ `/design`, `/api/ready`, `/api/auth/session-cookie`) |
| Public landing page | No (rendered ChatWorkspace) | Yes (`/`, edge-static) |
| Auth gate at edge | No (device cookie only) | Yes (session cookie + middleware) |
| Lighthouse (mobile) | Not measured | Target 95+ (follow-up) |
| Time to first token (Fast) | Not measured | Target < 800ms (follow-up) |
| k6 p50/p95/p99 | Not measured | Script provided (`scripts/load-test.k6.js`) |

### Eval harness
- Golden set: 30 prompts across chat/study/code/multilingual (target 200+).
- Deterministic checks: non_empty, has_code_fence, has_list, has_example, contains_number, no_invented_phone, replies_in_hindi_or_hinglish.
- LLM-judge rubric pass: follow-up (requires judge model + budget).
- CI gate: `scripts/eval.ts` exits 1 on any failure.

## Top 10 follow-ups
1. **Lighthouse audit** — run on `/`, `/chat`, `/design` mobile; target 95+ on Performance/Accessibility/Best Practices/SEO.
2. **Time to first token** — measure Fast mode TTFT; target < 800ms (currently thinkingBudget=0 on 2.5-flash).
3. **k6 load test** — run `scripts/load-test.k6.js` against a deployed instance; publish p50/p95/p99 in REPORT.md.
4. **Expand golden set** to 200+ prompts and add an LLM-judge rubric pass in CI.
5. **pgvector retrieval** — hybrid search (semantic + full-text) over project files and past conversations with cited snippets.
6. **Task router wiring** — currently `lib/task-router.ts` exists but the chat route uses the user's manual mode; wire automatic classification as the default with manual override.
7. **Resumable streams** — add resume tokens so a dropped connection can continue.
8. **Memory manager UI** — view/edit/delete everything Anvik remembers (currently opt-in extraction in `lib/learning.ts`).
9. **PWA install** — manifest + service worker + app-grade splash.
10. **Training pipeline execution** — run `scripts/pii-scrub.ts` + `scripts/finetune.py` on a real dataset; register candidates in `model_versions`; promote via the eval gate.

## Verification summary (final)
- `npm run typecheck` — 0 errors
- `npm run lint` — 0 warnings
- `npm test` — 383/383 pass
- `npm run build` — clean (34 routes, 103 kB shared JS)
- Vercel production deployment — READY (latest: `143ab96`)
- Playwright E2E (auth-gate.spec.ts) — guest + redirect + draft preservation pass against real server + Chromium
