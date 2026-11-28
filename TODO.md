# ANVIK premium redesign

## Stage 1 — Nav, hero, live chatbar, and R3F/GLSL scene
- [x] Keep the existing live ANVIK chatbar and submission flow working.
- [x] Replace the public landing visual system with near-black `#050505`, off-white text, and cobalt `#5B7CFF` only.
- [x] Add scroll-aware blurred navigation with mobile menu treatment.
- [x] Lazy-load the real Three.js/R3F hero scene with a custom GLSL shader, DPR max 2, reduced-motion support, and WebGL fallback.
- [x] Run diagnostics, lint, and `next build` before committing and pushing.

## Stage 2 — Pinned scroll story
- [ ] Implement Chat > Code > Image > Voice > Vision as one pinned, scrubbed visual story.
- [ ] Keep the same 3D object and transition its shader state without purple or unrelated accents.
- [ ] Respect reduced motion and mobile performance constraints.

## Stage 3 — Logo marquee and bento features
- [ ] Add grayscale infinite logo marquee.
- [ ] Add asymmetric bento cards with restrained cobalt hover glow and lightweight looping demos.

## Stage 4 — Metrics, final CTA shader, and footer
- [ ] Add animated metrics strip.
- [ ] Add final CTA shader background with cobalt-only treatment.
- [ ] Finish minimal footer and whole-page responsive/performance pass.

## Final verification
- [ ] Confirm Supabase, auth, and existing chat logic remain unchanged.
- [ ] Run lint and `next build` successfully before each push.
- [ ] Never push `main` or force-push.
