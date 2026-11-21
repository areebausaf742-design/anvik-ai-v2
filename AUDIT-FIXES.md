# ANVIK — Audit fixes

Companion to `AUDIT-2026-11-21.md`. Every item below was verified by running the code, not by reading it.

## Verification (all run after the changes)

| Check | Command | Result |
| --- | --- | --- |
| TypeScript | `npm run typecheck` | **0 errors** |
| Lint | `npm run lint` | **0 warnings** |
| Tests | `npm test` | **14 / 14 pass** |
| Build | `npm run build` | **pass**, 27 routes |
| Vulnerabilities | `npm audit` | **0** |
| Read-only filesystem | `chmod 555` the data dir + restart | **all routes 200** (was: `/j/[slug]`, `/sitemap.xml`, `/api/ask` → 500) |
| Invalid Gemini key | POST to all four streaming routes | **401 + JSON message** (was: `200`, empty body) |
| Contrast | WCAG math on the new tokens | every text token ≥ 4.87:1 |

Bundle: the landing page went from **415 kB → 111 kB** first-load JS (Three.js is now a lazy chunk).

---

## Phase 1 — critical

| # | Fix | File + line |
| --- | --- | --- |
| 1 | **No more 500 on a read-only disk.** The store is memory-first; the JSON file is used only after a write probe succeeds, with a temp-dir fallback, and every read/persist is wrapped so it can never throw. Supabase is used for durable reads/writes when configured. | `lib/store.ts:74-125` (`resolveDbFile`, `persist`), `lib/store.ts:171-205` (`load`), `lib/supabase.ts` (new) |
| 1b | `/api/ask` wrapped: any store failure returns `503 {"code":"degraded"}`, never a 500. `/sitemap.xml` try/catches the store. `/j/[slug]` serves from memory and 404s only for a genuinely unknown slug. | `app/api/ask/route.ts:41-48`, `app/sitemap.ts:25-35`, `app/j/[slug]/page.tsx:12-45` |
| 2 | **One env name.** `serverKey()` reads only `GOOGLE_GENERATIVE_AI_API_KEY`; the legacy `GEMINI_API_KEY`/`GOOGLE_API_KEY` reads are gone, so `/api/ask`'s live path now matches the other routes. One model id (`AI_MODEL`) for all of them. | `lib/provider.ts:16-24`, `:17` (`AI_MODEL`); routes at `app/api/chat/route.ts:9`, `code:2`, `voice:2`, `vision:2`, `image:2` |
| 3 | **Honest failures.** Empty/whitespace prompts → `400 {"error":"Prompt cannot be empty"}`. A malformed key → `401 {"error":"Add valid Gemini key in Settings."}`. A well-formed but rejected key → `401` with detail. **Never a 200 with an empty body** — an empty stream is treated as failure, because the AI SDK swallows provider errors and ends the stream cleanly. | `app/api/chat/route.ts:57-72`, `:88-98`; `app/api/code/route.ts:20-27`; `app/api/voice/route.ts:20-27`; `app/api/image/route.ts:39-45`; `lib/provider.ts:168-260` (`guardedTextResponse`) |
| 4 | **Six dead pages have real CSS** in the app's own language: `.narrow`, `.wide-list`, `.hist-item`, `.hist-tools`, `.pub`, `.q-head`, `.a-body`, `.meta-line`, `.pub-cta`, `.plans`, `.plan-row`, `.about`, `.ghost-note`, `.ask-btn`, `.field`, `.err-line`, `.caret`. Verified present in the built stylesheet and applied in the rendered HTML. | `app/globals.css:1020-1195`; consumers `app/h/page.tsx`, `app/claim/page.tsx`, `app/pricing/rows.tsx`, `app/about/page.tsx`, `app/j/[slug]/page.tsx`, `app/error.tsx`, `app/not-found.tsx` |
| 5 | **No dead routes.** Code Lab now calls `/api/code` (was `/api/chat`) and Voice now calls `/api/voice` (had no caller). The fake attachment button and fake `⌘ K` badge are deleted. | `components/anvik/creative-studio.tsx:300-330` (code), `:456-500` (voice); removed from `components/anvik/chat-workspace.tsx` |
| 6 | **Markdown is rendered.** A dependency-free renderer (headings, lists, code fences, bold/italic, quotes, links) builds React nodes — no `dangerouslySetInnerHTML`, so model output cannot inject HTML. Used in chat, code, voice, vision and public answer pages. | `components/anvik/markdown.tsx` (new); `components/anvik/chat-workspace.tsx:317-330` |
| 7 | **Images are stored as URLs, capped at 6.** Legacy base64 entries are dropped on load; a quota failure degrades to 2 items with a visible notice instead of losing everything. The route also stops buffering the whole image to base64. | `components/anvik/creative-studio.tsx:27-31`, `:36-95`; `app/api/image/route.ts:51-70` |
| 8 | **Real `.sr-only`** rule added (it was referenced with no CSS, so the "hidden" label rendered as visible text). | `app/globals.css:67-78` |
| 9 | **Regex fixed** (`\\.?` → `\.?`) and hardened with a trailing-separator strip so repeated style clicks cannot grow the prompt. Verified over five consecutive style changes. | `components/anvik/creative-studio.tsx:32-41` |

### Also fixed while in there (all audit items)

| Audit id | Fix | File + line |
| --- | --- | --- |
| C-3 | `crypto.randomUUID` in Edge middleware replaced with a Web Crypto v4 UUID; cookie now `secure` in production. | `middleware.ts:13-22`, `:27-33` |
| H-1 / H-2 | Rate limiting added to the five paid routes via one shared limiter. | `lib/rate-limit.ts` (new); used in `chat:100`, `code:50`, `voice:50`, `vision:58`, `image:52` |
| H-8 | Client IP taken from `x-vercel-forwarded-for`, else the **last** `x-forwarded-for` hop. | `lib/rate-limit.ts:19-29` |
| H-9 | Vision route strips a `data:` prefix, caps at 4.4 MB, and validates the media type. | `app/api/vision/route.ts:8-12`, `:33-40` |
| H-10 | `/api/voice` has a real caller. | `components/anvik/creative-studio.tsx:456-500` |
| H-12 | Abort controllers on chat, code and vision; a page unmount aborts the stream. | `chat-workspace.tsx:71`, `:103`; `creative-studio.tsx:281`, `:475` |
| H-13 | The image provider (`gemini` or `pollinations`) is shown on each generated image. | `creative-studio.tsx:246-249` |
| M-1 | Removed `gsap`, `@tanstack/react-query`, `framer-motion`, `@fontsource-variable/fraunces`, `@fontsource/mukta` — all unused. | `package.json` |
| M-2 | The render-blocking Google Fonts `@import` is gone; Manrope is self-hosted (`@fontsource-variable/manrope`), and the build no longer touches the network. | `app/layout.tsx:2`, `app/globals.css:26` |
| M-3 / M-4 | Three.js is a lazy chunk mounted on intersection; reduced-motion users get the static sphere; geometry detail 5 → 3, starfield removed. | `components/anvik/orb.tsx`, `components/anvik/orb-scene.tsx` (new) |
| M-5 / M-6 | `app/icon.svg`, `app/apple-icon.tsx`, `app/opengraph-image.tsx`; production URL defaults to `https://anvik.ai` everywhere instead of localhost. | `app/layout.tsx:13`, `app/sitemap.ts:7`, `app/robots.ts:3` |
| M-8 | Chat persistence is capped (40 conversations × 200 messages × 24k chars) with a v2 migrate step. | `store/use-chat-store.ts:30-52`, `:96-110` |
| M-9 | Deleted `app/composer.tsx`, `app/sidebar.tsx`, `app/header.tsx` (zero importers, ~370 lines). | — |
| M-12 | The quota day key and the spend-ceiling comparison both use **IST** now; before, they used UTC and IST respectively, so the ceiling read 0 after 18:30 UTC. | `lib/store.ts:130-141`, `:243-250` |
| M-15 | The dead `⌘ K` badge is gone. | `chat-workspace.tsx:139` |
| M-17 | Sitemap lists reviewed answers only, matching their `robots` directive. | `app/sitemap.ts:25-35` |
| M-19 / M-20 | `tsconfig.tsbuildinfo` untracked and ignored; CI workflow added. | `.gitignore`, `.github/workflows/checks.yml` |
| L-1 | The literal `\n` wedged into the CSS is gone (file rewritten). | `app/globals.css` |
| L-2 | `prefers-reduced-motion` now also stops the 3D orb. | `components/anvik/orb.tsx:56-66` |
| L-3 | Composer textarea is `resize:none`. | `app/globals.css:596` |
| L-10 | Functional state update in `saveGallery`. | `creative-studio.tsx:86-95` |
| L-13 | The "Week 7" sprint reference is out of the purchase path and out of the quota error. | `app/pricing/rows.tsx:6`, `app/api/ask/route.ts:126` |
| L-15 / L-17 | Fabricated pull-quote replaced with the real Kautilya line; Portland coordinates removed. | `app/login/page.tsx`, `app/page.tsx` |
| L-17 | CSP added (`script-src`/`connect-src`/`img-src` scoped to what the app actually uses). | `next.config.mjs:15-37` |
| L-18 | Unexpected route failures are `5xx`, not `400`. | all API routes |

---

## Phase 2 — looks human

Rebuilt to the repo's own spec (`docs/ANVIK-PLAN.md` §3.3–3.6) rather than to taste:

| Tell | What changed | File + line |
| --- | --- | --- |
| Violet→cyan→pink gradient, 8 screens | Gradient **text** is gone — `.gradient-text` is now one solid green (`#1f5f4b`). Zero `linear-gradient` in the shipped CSS; the only `radial-gradient` left is the orb's inner shading. | `app/globals.css:3-24`, `:253` |
| Dark neon + glassmorphism | Warm paper (`#faf7f2`), ink (`#14120f`), one accent. `backdrop-filter: 0`, `#07070b: 0`. Five blurred glass surfaces removed. | `app/globals.css:9-24`; `app/page.tsx:87-103` (solid cards) |
| Three-card icon grid / bento | Capabilities are a two-column **rule-separated list** with no icon tiles and no hover lift. The "proof" band is three **real corpus answers** with real `/j/` links. | `app/globals.css:330-372`; `app/page.tsx:113-146`, `:148-180` |
| Announcement pill, fake stats, coordinates | Removed. The hero eyebrow now states what it is ("English · हिंदी · Hinglish"); the meta line states the actual promise ("Three free questions a day"). | `app/page.tsx:47-69` |
| AI-sounding copy | Replaced with what the product does and for whom: "Ask in your own words. Get a straight answer." / "the steps, the fee, the office and the official page". Pricing in rupees instead of "Your universe is open". | `app/page.tsx:48-76`, `:189-205` |
| Generic 3D orb everywhere | Kept as the **only** wow element, now smaller (340 px, 230 px on mobile), monochrome green, lazy-loaded, and static under reduced motion. | `components/anvik/orb.tsx`, `orb-scene.tsx`, `app/globals.css:410-460` |
| Fabricated testimonial | The login pull-quote is now the attributed Kautilya line. | `app/login/page.tsx:19-25` |
| Text too small / low contrast | Minimum body 15.5 px (was 10–12 px), minimum label 10.5 px (was 6–9 px); every text token ≥ 4.87:1 (verified). | `app/globals.css` throughout |
| Small touch targets | Composer/icon buttons 36 px, history rows 40 px, primary buttons 46–50 px, style chips 36 px. | `app/globals.css:600-660`, `:770-790` |

`lib/corpus.ts` was **not touched** (verified: no diff).
