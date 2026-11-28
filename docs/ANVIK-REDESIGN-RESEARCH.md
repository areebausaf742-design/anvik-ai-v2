# ANVIK redesign research

## Product references

- Framer: https://www.framer.com/
  - Sparse hero composition, compact utility metadata, editable/product-in-context visual language, and restrained CTA hierarchy.
- Lovable: https://lovable.dev/build/website-builder
  - Clear describe/build/refine/publish narrative and direct product storytelling.
- Linear: https://linear.app/
  - Product UI shown in context, strong typographic hierarchy, emphasis on speed, and low-noise layouts.

## Framework references

- Next.js App Router lazy-loading: https://github.com/vercel/next.js/blob/canary/docs/01-app/02-guides/single-page-applications.mdx
  - Keep the page shell server-rendered and dynamically load browser-only interactive visuals with a fallback.
- React Three Fiber scaling performance: https://github.com/pmndrs/react-three-fiber/blob/master/docs/advanced/scaling-performance.mdx
  - Cap DPR, use adaptive performance controls, and prefer on-demand rendering where continuous animation is not required.
- GSAP ScrollTrigger: https://gsap.com/docs/v3/Plugins/ScrollTrigger/
  - Use pinned scrubbed timelines with scoped cleanup and reduced-motion alternatives.

## Approved implementation constraints

- Near-black `#050505`, off-white text, cobalt `#5B7CFF` as the only accent.
- Existing live ANVIK chatbar remains the primary hero interaction.
- R3F/Three.js scene uses a custom GLSL shader, lazy loading, DPR max 2, on-demand rendering where possible, reduced-motion support, and a static fallback only for unsupported WebGL devices.
- Supabase, auth, and existing chat logic are not to be changed.
