# ANVIK AI V2 — Progress Log

## Status
- **Phase 1 (public home + auth gate) — COMPLETE & MERGED & DEPLOYED** (PR #59 + PR #60 → main `9098395`; Vercel production READY)
- **Phase 2 — Design system + /design page — IN PROGRESS** (branch `feat/design-system-phase-2` from main `9098395`)
- **Baseline:** typecheck PASS, tests 383/383 PASS, build clean, landing `/` 110 kB first-load JS

## Phase 2 — Design system (in progress)
Goal: tokens + component library + living /design page; migrate landing + existing screens onto it.
- Tokens: `--theme-*` for Dark/Light/System, one premium sans (Inter Tight/Geist) + mono, 4px grid, fixed radii, elevation by border+tone, one signature accent, stroke icon family, motion 150–250ms spring honoring `prefers-reduced-motion`, WCAG AA.
- Existing: `lib/theme.ts` (AppearanceMode light/dark/system, THEME_INIT_SCRIPT, resolveTheme), `components/anvik/appearance-provider.tsx`, `app/globals.css` (already has `--theme-*` tokens + `.anvik-dark` + light overrides).
- Plan: consolidate into a clean token layer, build primitive components (button, input, card, badge, etc.), add `/design` page, then migrate landing page and existing screens.

## Checks per phase: typecheck / test / build / Vercel deploy + runtime logs / PR → merge.
