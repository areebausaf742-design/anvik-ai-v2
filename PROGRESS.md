# ANVIK AI V2 — Progress Log

## Status
- **Phase 1 (public home + auth gate) — COMPLETE & MERGED & DEPLOYED** (PR #59 + PR #60 → main `9098395`; Vercel READY)
- **Phase 2 (design system + /design page) — COMPLETE & MERGED & DEPLOYED** (PR #61 → main `9c46ba1`; Vercel READY; `/design` route live)
- **Phase 3 — Chat core with streaming — IN PROGRESS** (branch `feat/chat-core-phase-3` from main `9c46ba1`)
- **Baseline:** typecheck PASS, tests 383/383 PASS, build clean, `/` 111 kB, `/design` 106 kB first-load JS

## Phase 3 — Chat core with streaming (in progress)
Goal: token-by-token streaming with smooth reveal, scroll respect + jump-to-latest pill, GFM/markdown/math, syntax-highlighted code blocks with language label/copy/wrap toggle, inline citations, message actions (copy/regenerate/edit-resubmit/thumbs w/ reason chips/branch), stop, resumable streams, retry, autosaved drafts, keyboard shortcuts (Enter, Shift+Enter, Cmd/Ctrl+K, Cmd/Ctrl+Shift+O, / for tools), conversation search/rename/pin/delete-with-undo.
- Existing codebase already implements most of this; Phase 3 audits gaps and adds missing pieces + migrates in-app chat bar to the design system.
- Work on fresh branch from origin/main; run typecheck/test/build; PR → merge; verify Vercel.

## Checks per phase: typecheck / test / build / Vercel deploy + runtime logs / PR → merge.
