# ANVIK AI V2 — Progress Log

## Status
- **Branch:** `feat/webgl-chatbar-redesign-v2` → creating feature branch for Phase 1
- **Baseline checks:** typecheck PASS (0 errors), tests 380/380 PASS, build PASS (33 routes, 103 kB shared JS)
- **In-flight phase:** Phase 1 — Public home page + auth gate (first-visit experience) — IMPLEMENTED
  - `app/page.tsx` → public landing page (hero, live interactive chat bar, mode showcase, footer)
  - `components/anvik/landing/chatbar.tsx` — roaming light band (@property conic-gradient), living rotating placeholder, interactive composer; send → stores draft + destination in sessionStorage, pushes /login
  - `components/anvik/landing/hero.tsx` — ANVIK wordmark, confident copy, CTA
  - `components/anvik/landing/showcase.tsx` — Chat/Image/Code/Vision mode cards
  - `components/anvik/landing/footer.tsx` — quiet footer
  - `app/globals.css` — landing CSS (@property mask, roaming glow, dark/light variants, reduced-motion static)
  - `components/anvik/chat-workspace.tsx` — restores `anvik-pending-draft` from sessionStorage once identity is ready and sends it (cleared on read, never sent twice)
- **Decisions:** draft preserved via sessionStorage (survives /login → /onboarding → /welcome → /chat); no /login changes needed
- **Open issues:** none yet
- **Next:** run typecheck + test + build, commit, open PR → main, merge
