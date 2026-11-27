# ANVIK AI V2 — Execution Plan

**Goal:** A stranger opens the app, sends "hii", and thinks "this feels more expensive than the apps I pay for." Dark, quiet, confident, spacious. Original identity — one obsessive human's point of view.

**Baseline:** typecheck PASS, tests 380/380 PASS, build PASS (33 routes, 103 kB shared JS). Branch `feat/webgl-chatbar-redesign-v2`.

## Phase order

| Phase | Focus | Definition of done |
|---|---|---|
| 1 | **Public home page + auth gate** (this session) | Public `/` landing page: hero, live interactive chat bar, mode showcase (Chat/Image/Code/Vision), footer. Chat bar send → `/login` preserving draft + destination. `/login` restores draft after sign-in; `/chat` restores + sends draft. All checks pass, commit, PR, merge. |
| 2 | **Design system (tokens + library)** | Semantic `--theme-*` tokens for Dark/Light/System, Geist/Inter Tight + mono scale, 4px grid, radii, elevation by border+tone, stroke icon family, motion 150–250ms spring honoring `prefers-reduced-motion`, WCAG AA. Living `/design` page. |
| 3 | **Chat core** | Chat bar with roaming light band, living rotating placeholder, quick-start chips in sync, model selector popover, deep search toggle, attachments, voice, send→stop morph. Streaming pipeline with SSE, scroll respect, jump-to-latest pill. |
| 4 | **"Anvik is thinking" moment** | Optimistic send, assistant row with light-sweep through letters (~1.4s loop), holds height, "Still working…" at 6s, mode-specific verbs (painting/looking/writing code/searching). |
| 5 | **Backend hardening** | RLS audited, credit ledger append-only + idempotent, rate limit per user+IP, zod validation, consistent error envelope, ai-gateway fallback/circuit-breaker, feature flags/kill switches, `/api/health` + `/api/ready`. |
| 6 | **Intelligence layer + eval harness** | Versioned prompt library (DB), task router, Smart self-critique pass, pgvector hybrid search + citations, opt-in memory, golden set 200+ prompts + LLM judge, CI gate. |
| 7 | **Remaining surfaces** | Projects, Artifacts, Image studio, Vision, Code, Account, Onboarding — all mobile-first, skeletons, optimistic updates, offline banner, toasts, 404/error boundary, PWA. |
| 8 | **Training pipeline** | PII-scrubbed opt-in dataset, LoRA fine-tuning scripts (Unsloth), GGUF export, model_versions registry, shadow→canary→rollback promotion gate. |
| 9 | **Final polish + REPORT.md** | k6 load test (p50/p95/p99), Lighthouse 95+ mobile, bundle budget in CI, REPORT.md with before/after numbers + top-10 follow-ups. |

## Phase 1 — Public home page + auth gate (in progress)

### Scope
- `app/page.tsx` → public landing page (Server Component), no auth required, edge-static.
- New landing components under `components/anvik/landing/` (hero, chat-bar preview, quick-start chips, mode showcase, footer).
- `/login` accepts `?draft=` and `?next=`; after sign-in restores draft + destination to `/chat`.
- `app/chat/page.tsx` / `ChatWorkspace` reads a pending draft on mount and sends it.
- Draft stored in `sessionStorage` (`anvik-pending-draft`, `anvik-pending-destination`) across the login round-trip.

### Out of scope for Phase 1
- Design system rebuild (Phase 2), thinking animation (Phase 4), backend hardening (Phase 5+).

### Checks (run before commit)
- `npm run typecheck` — 0 errors
- `npm test` — all pass
- `npm run build` — clean production build

### Delivery
- Commit on feature branch, push, open PR → main, merge.
