# ANVIK AI V2 — Progress Log

## Status
- **Phase 1 (public home + auth gate) — COMPLETE & MERGED** (PR #59, `a8880e0` on main)
- **Auth-gate middleware enforcement — COMPLETE & MERGED** (branch `feat/auth-gate-middleware`, in progress of committing)
- **Baseline checks:** typecheck PASS, tests 383/383 PASS, build clean (no lint warnings), landing `/` 110 kB first-load JS

## Auth gate enforcement (this session, branch `feat/auth-gate-middleware`)
- `app/api/auth/session-cookie/route.ts` (new) — POST verifies bearer token vs Supabase then sets HttpOnly `anvik_session` cookie; DELETE clears it (sign-out). Cookie presence = verified session, trustworthy because only set post-verification.
- `components/anvik/session-provider.tsx` — added `setSessionCookie`/`clearSessionCookie`; login flow mirrors session into the cookie after Google/password sign-up and on load when already authed; sign-out clears it.
- `app/login/page.tsx` — sets the session cookie before every post-sign-in redirect (avoids infinite /login↔/chat redirect loop).
- `middleware.ts` — edge auth gate:
  - Public: `/`, `/login`, `/auth/reset`, `/about`, `/pricing`, `/claim`, `/h`, `/j/[slug]`, all `/api/*` (self-enforce)
  - Protected pages (redirect to /login?next= when no session cookie): `/chat`, `/onboarding`, `/welcome`, `/account`, `/settings`, `/projects`, `/artifacts`, `/image`, `/code`, `/vision`, `/voice`, `/library`
  - Protected API routes (401 at edge when no session cookie): `/api/image`, `/api/code`, `/api/voice`, `/api/vision`
  - Device cookie (`anvik_dev`) still issued; set on redirect responses too.
- `tests/middleware-callback.test.ts` — updated to new intended behavior + added protected-page redirect + protected-API-401 + device-cookie-on-redirect tests (383 total, all pass).
- `tests/e2e/auth-gate.spec.ts` (new) + `playwright.config.ts` — E2E: guest opens public page + uses chat bar; sending redirects to /login and preserves draft in sessionStorage. (Verified passing against real `next dev` server + Chromium.)
- `package.json` — added `react-virtuoso` (was declared but missing, broke typecheck on current main) and `@playwright/test` (dev).

## Next
- Commit auth-gate work, open PR → main, merge, verify Vercel deployment + runtime logs.
- Then Phase 2 (design system: tokens, theme System/Light/Dark, component library, /design page; migrate landing + existing screens) on a fresh branch from origin/main.
