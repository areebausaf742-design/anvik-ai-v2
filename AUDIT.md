# ANVIK AI — Product Audit (2026-11-27)

**Repo:** `anvik-ai-v2` (Next.js 15 App Router, Supabase, Gemini, Vercel)
**Branch audited:** `feat/webgl-chatbar-redesign-v2` (working tree clean)
**Method:** line-by-line read of `app/`, `components/`, `lib/`, `store/`, `tests/`, `middleware.ts`, `next.config.mjs`, plus prior audits `AUDIT-2026-11-21.md`, `AUDIT-FIXes.md`, `PRODUCTION_AUDIT_REPORT.md`. Verified by running `typecheck`, `test`, `build`.

## Baseline (all green)
| Check | Command | Result |
|---|---|---|
| TypeScript | `npm run typecheck` | PASS — 0 errors |
| Tests | `npm test` | PASS — 380/380 |
| Production build | `npm run build` | PASS — 33 routes, 103 kB shared JS |

## Strengths (do not regress)
- `lib/corpus.ts` — six answers, each in Devanagari/Hinglish/English, with real helplines and portals. The most human artifact in the repo; build the brand around it.
- `lib/ai-gateway.ts` — single metered entrance: identity → standing → key → rate limit → exactly-one credit reservation → `settle()` on every exit path. Idempotent, refund-on-abort, guest metering.
- `lib/gemini.ts` — explicit fallback chain (2.5-flash → 2.5-flash-lite → 2.0-flash), retry-with-backoff, 60s cap, honest classified errors, AQ + AIza key formats.
- `lib/auth.ts` + `lib/session.ts` — PKCE OAuth, verifier-presence checks, honest user-facing messages, bearer re-verification on every protected route, service-role key never exposed to browser.
- Tests — 380 real tests covering credits, auth, OAuth, injection, search grounding, rate limiting, consent, markdown, palette, theme.
- Supabase production schema applied and verified (10 tables, RLS, policies, 3 RPC functions, idempotency, no real user data touched).

## Weaknesses by severity

### Critical — breaks the product or the first-visit promise

| # | Area | File | Problem | Severity |
|---|---|---|---|---|
| C1 | First-visit experience | `app/page.tsx` | `/` renders `ChatWorkspace` directly — a gated chat app, not a public landing page. A stranger cannot explore without hitting identity state; there is no hero, no mode showcase, no quiet footer. Violates the brief's first-visit requirement. | Critical |
| C2 | Auth gate | `app/login/page.tsx` | No draft preservation. Typing on the public chat bar then pressing send must keep the draft and destination through sign-in and restore/send it on arrival. Today nothing carries a draft across login. | Critical |
| C3 | Route protection | `middleware.ts` | Only sets a device-id cookie. No server-side session validation on protected routes/APIs; enforcement must be at the route level, and public pages must be static/edge-cached so they load instantly for logged-out visitors. | Critical |

### High — bad UX, reliability, or security risk

| # | Area | File | Problem | Severity |
|---|---|---|---|---|
| H1 | Design identity | `app/globals.css` + pages | UI still carries the banned template tells: violet→cyan→pink gradients, glassmorphism, three-card icon bento grids, announcement pills, centered hero→subhead→two-CTA stacks, fabricated stats and coordinates. The repo's own `docs/ANVIK-PLAN.md` bans all of these. | High |
| H2 | Chat bar | `components/anvik/chat-workspace.tsx` | Placeholder is static ("Ask ANVIK a question..."), no living rotating suggestions, no roaming light band around the bar (the `ChatbarLight` WebGL exists but isn't the signature "light through the letters" thinking animation), no "Anvik is thinking" moment. | High |
| H3 | Markdown rendering | `components/anvik/markdown.tsx` exists | Verify it is actually used on all message surfaces; the system prompt requests Markdown but answers must render as structured markup, not literal `**`/`#`. | High |
| H4 | Performance budget | `next.config.mjs` + `app/layout.tsx` | Three.js orb + ambient ring load on every route; no route-level code splitting for heavy visuals; public pages not guaranteed edge-static. First-load JS on `/` is 396 kB. | High |
| H5 | Answer quality | `app/api/chat/route.ts` | No versioned prompt library in the database, no task router, no self-critique/revision pass, no pgvector retrieval, no citations UI beyond sources panel. Answers are single-pass. | High |

### Medium — performance, code quality, polish

| # | Area | File | Problem | Severity |
|---|---|---|---|---|
| M1 | Bundle | `app/page.tsx`, `components/anvik/orb.tsx` | Landing page pulls the full chat workspace + Three.js orb. Lazy-load heavy visuals behind `next/dynamic` and intersection. | Medium |
| M2 | Accessibility | globals + components | Verify WCAG AA contrast on all tokens, visible focus rings, ARIA on every control, screen-reader-friendly streaming (live region for tokens). | Medium |
| M3 | SEO/social | `app/opengraph-image.tsx`, `app/sitemap.ts` | OG image exists; verify `sitemap.ts` lists reviewed answers only and `NEXT_PUBLIC_SITE_URL` is required in production (not localhost fallback). | Medium |
| M4 | Observability | `lib/observability.ts` | `/api/health` and `/api/ready` exist; confirm SLO dashboards and uptime alerts wired to Vercel. | Medium |

### Low — polish

| # | Area | File | Problem | Severity |
|---|---|---|---|---|
| L1 | Theme | `lib/theme.ts` | System / Light / Dark setting exists (`AppearanceProvider`); confirm the landing page honors it and has no flash of wrong theme. | Low |
| L2 | Copy | `app/page.tsx` | Landing copy must be specific ("Ask about a government form in Hindi. Get the steps, the fee, the official page."), not abstract AI-speak. | Low |

## Top 5 first-hour fixes (from prior audits, already applied in AUDIT-FIXes.md)
1. Six unstyled pages now have real CSS (C2 fixed).
2. `/api/chat` honest failures — empty prompt → 400, bad key → 401, never 200-empty (C4/C5 fixed).
3. Fake attachment button and fake `⌘ K` removed (C8/M15 fixed).
4. Markdown renderer added and wired into chat (C10 fixed).
5. Gradient text replaced with a single solid accent (Phase 2 applied).

## What this audit does NOT cover
The full brief's intelligence layer (pgvector retrieval, task router, self-critique, memory, eval harness, fine-tuning pipeline), training pipeline, k6 load testing, and the `/design` living style guide are planned as later phases in PLAN.md.
