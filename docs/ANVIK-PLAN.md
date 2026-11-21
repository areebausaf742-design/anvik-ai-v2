# Anvik — Product & Engineering Plan

**Status:** Planning only. Nothing has been built.
**Date written:** 21 November 2026
**Repo:** `areebausaf742-design/Anvik-ai`
**Scope of this document:** This file is the only change on this branch. No routes, no components, no tests, no dependencies, no config.

---

## 0. Read this first — three corrections to the brief

This plan was written from a clean checkout. Three things in the framing it was commissioned with do not match what is actually here, and one number in it was wrong. They are listed up front because two of them change decisions.

### 0.1 This repository *is* Anvik

`Anvik-ai` contains exactly one file: `README.md`, reading `# Anvik-ai`. One commit (`e562bc1`, 21 Nov 2026). There is no other product in it.

So the closing argument — *"it needs a home until the `anvik` repository exists… if you'd rather keep this repo free of another product's docs, close this PR and I'll delete the file"* — rests on a false premise. This is not another product's docs sitting in a borrowed repo. This is Anvik's own repo, empty except for a name. The document is already where it belongs, and "close the PR and delete it" is the wrong instruction. If the intent is to build Anvik, this file is the natural first commit in it.

### 0.2 There is no CafeCaption here, so nothing can be "reused"

The brief said the architecture *"reuses this repo's proven primitives: the Postgres rate-limit store, service-role-only writes, error boundaries, CI gate."* A search of the full checkout for `cafecaption`, `rate.?limit`, `service_role`, and `errorboundary` returns zero hits. There is no `package.json`, no `requirements.txt`, no `pyproject.toml`, no framework config. There are no primitives in this repository.

Those patterns may well exist and be proven in whatever repo CafeCaption actually lives in — but that repo is not in this session's reach, so none of it could be read, verified, or copied.

**Consequence for §5:** every pattern below is written as *reimplement from scratch, then verify*. Where the brief called something "proven", this plan calls it **unverified prior art**. That is not a downgrade in the design; it is an upgrade in honesty, and it moves roughly 3–4 days of work into Week 1 that the original framing assumed away.

### 0.3 The cost number in the brief was wrong by about 3×

The brief stated **₹240–450/day at 1,000 users**. Recomputed from November 2026 API prices, a ₹95/$ planning rate, and measured Devanagari token fertility, the real figure for a Flash-class model is **≈₹115 per 1,000 answers** (§7.2). The brief's range is only reachable in one of two ways:

- at roughly **2,300–4,500 answers/day** rather than 1,000, or
- on a **Claude Haiku 4.5-class model**, which costs ≈₹0.34/answer — about 3× Flash — and blows the ₹0.15 target on its own.

Both readings are in the table at §7.2. The practical effect: model choice is worth **₹7,000/month** at modest scale, so it is a Week 1 decision, not a Week 6 one. The five cost controls in §7.4 are unchanged, and the global daily ceiling turns out to be load-bearing for a different reason than the brief assumed (§7.5).

---

## 1. Definition

**Anvik is a single text field that answers any question in Hindi or Hinglish, free to start, paying by UPI, with every answer shareable at a public URL.**

Everything else in this document is downstream of that sentence. If a proposed feature does not serve it, it is out of scope.

### 1.1 What Anvik is not

Stated explicitly, because each of these is a plausible-sounding direction that would consume the whole budget:

| It is **not** | Why not |
| --- | --- |
| A model | No pretraining. No GPUs. No weights owned. |
| A fine-tune | No training data at the volume required, no eval harness to prove it helped, no hosting cost that survives the unit economics in §7. |
| A Claude/ChatGPT clone | Competing on general capability against labs spending billions is a losing trade. Competing on *language, one field, UPI, and shareability* is not contested by them in India. |
| A chat app | No multi-turn conversation at launch. One question → one answer → next. Turns are where cost and abuse both compound (§7, §6.5). |
| A voice product | Voice input is the single most-requested feature it will not ship in ten weeks. Deferred to a post-launch decision (§9). |
| An app | No native build. Mobile web only. Install friction kills the share loop. |

### 1.2 The one-sentence test for any future feature

> Would a first-time user in a tier-3 town, on a ₹12,000 Android phone over 4G, understand this in five seconds without an explanation?

If no, it does not ship.

---

## 2. Positioning — the four doors the incumbents do not open

ChatGPT, Gemini, Perplexity and Claude all serve India. All four leave the same four doors locked. Anvik walks through those and only those.

### Door 1 — Language, as the product rather than a translation layer

The incumbents answer Hindi, but they answer it as a *translated* English product. The tell is in the output, not the input: formal Devanagari register that nobody actually writes, English nouns left untranslated mid-sentence (`"आपका loan application"`), Latin-script dates and units, and a tone calibrated for a Mumbai media professional rather than a Lucknow shopkeeper.

Anvik's answer voice is written for a specific person (§2.5) and enforced in the system prompt as a hard style contract: conversational register, Devanagari numerals where Indians read them, ₹ before every amount, official English names retained *only* for form fields and document titles, because that is what the form itself says.

The measurable claim: **an Anvik answer should be indistinguishable from a helpful, well-informed relative explaining it over the phone.** That is the eval target in §6.1, not a BLEU score.

### Door 2 — One field, zero decisions

A chat interface asks the user to make a series of decisions before they get value: which model, new chat or continue, how to phrase the follow-up, whether to attach a file, what the sidebar means. Each decision is a dropout point for a first-time internet-AI user.

Anvik presents **one field and one button**. No model picker. No conversation tree. No sidebar. No account required to ask. The user types and gets an answer. The next question is asked in the same field.

This is a genuine constraint on the engineering, not a stylistic preference: no session state in the happy path means no conversation storage, which is most of why the cost model in §7 is affordable.

### Door 3 — UPI and rupees, not a card and a dollar

The incumbents bill in USD against a credit card behind a paywall priced for American incomes. In practice this excludes the large majority of Indian retail users twice over: no international card, and no willingness to pay $20.

Anvik prices in rupees at Indian willingness-to-pay (**₹19 / ₹49 / ₹399**, §7.6), takes **UPI, cards, netbanking and wallets** through an Indian PSP, shows prices as `₹49/महीना` and never as `$0.60`, and issues a GST invoice on request. The free tier is genuinely usable — three questions a day, forever, no card.

### Door 4 — Shareable, so growth is organic

The incumbents' shared links require an account to read and are walled off from search. That is a deliberate choice that costs them the Indian market's only scalable acquisition channel: **WhatsApp forwarding.**

Every Anvik answer lives at a public, indexable URL — `anvik.ai/j/क्रेडिट-स्कोर-कैसे-बढ़ाएं`-style slugs, server-rendered, readable with no account, carrying the question and answer as valid Open Graph text so the WhatsApp/Twitter preview shows the *content*, not a marketing card. One useful answer forwarded into a family group is worth more than any paid campaign, and it compounds: the same URL is simultaneously a share target and a search result.

**§4.3 makes this the only growth channel Anvik funds.** Paid acquisition for a ₹49/month product in India does not repay. A public answer corpus does.

### 2.5 Who this is for — one person, not a segment

> **Ramesh, 34, runs a small provision shop in Lucknow. Android, 4G, Hindi-first, reads Devanagari comfortably and English functionally. Uses WhatsApp and YouTube daily, has UPI, has never paid for software. Wants to know if he's eligible for a government scheme, why his GST portal notice arrived, and what his son's admission form is asking for.**

He is not a "Hindi-speaking user". He has a specific phone, a specific connection, a specific set of questions, and a specific reason to distrust anything that asks for a card. Every design token in §3, every screen in §4, and the refusal policy in §6.5 were written against him.

The highest-volume, highest-value, *safest* wedge for Ramesh is **government schemes, forms and official processes** — enormous demand, real money at stake, verifiable against official sources, and low harm if the answer is imperfect provided it always links to the authoritative page. That is the launch category (§8, Week 7).

The highest-volume *dangerous* category is health. §6.5 handles it by refusing to diagnose and routing to a doctor and `108`, because the downside of being wrong there is not a churned user.

---

## 3. Brand and design tokens

### 3.1 Name

**Anvik** ← **अन्वीक्षिकी / Anvikshiki**, the classical Indian discipline of inquiry.

Kautilya lists it in the *Arthashastra* as one of the four branches of knowledge, alongside *Trayi* (Vedas), *Varta* (economics) and *Dandaniti* (governance), and ranks it first among them:

> *"Pradeepah sarvavidyaanaam upayah sarvakarmanaam |*
> *Aashrayah sarvadharmaanaam shashwat anvikshakee mataa ||"*
>
> "Anvikshiki is the lamp of all the sciences, the means of all actions, and the support of all dharma."

The word derives from the root **√īkṣ** — to see, perceive, observe, consider, investigate. *Anu + īkṣaṇa*: reflection, examining what follows from what. Vatsyayana defines it in the *Nyaya-Bhashya* as the science of analysing what has been said in the knowledge texts (*agama*) and what has been directly experienced (*pratyaksha*).

That is a precise description of what the product does with a question, and it is not borrowed from a Western AI naming convention. It is also short, pronounceable in both Hindi and English, and available as a `.ai`.

**Pronunciation guidance for any future voice work:** *AN-vik*, stress on the first syllable. Never "an-VEEK".

### 3.2 Wordmark

- Set in **Fraunces**, lowercase: `anvik`
- **No icon. No logo mark. No mascot.** The word is the brand.
- Optical size and weight tuned at the two sizes it actually appears (32px header, 20px footer); no lockups, no clear-space diagrams, no monogram.
- The Devanagari form **अन्विक** appears exactly once in the entire product: as a single line on the About page (§4.7) beside the Kautilya quote. It is never the wordmark. Using it as the wordmark would make the product illegible to exactly the Hinglish users it is for.

### 3.3 Colour

| Token | Value | Role | Contrast on paper |
| --- | --- | --- | --- |
| `--paper` | `#FAF7F2` | Page background. Warm, not white. | — |
| `--paper-sunken` | `#F2EDE4` | Cards, recessed panels | — |
| `--ink` | `#14120F` | All body text and headings | **17.5:1** (AAA) |
| `--ink-soft` | `#4A453D` | Secondary text, metadata | 8.6:1 (AAA) |
| `--rule` | `#E0D8CB` | Hairline borders, dividers | decorative |
| `--green` | `#1F5F4B` | Primary action, links, focus ring | **6.7:1** (AA/AAA) |
| `--green-pressed` | `#17493A` | Primary action, pressed state | 9.1:1 |
| `--saffron` | `#C8791A` | **One flourish per screen.** Never body text. | 4.7:1 — large text and decoration only |

Rules, in force:

1. **Saffron appears at most once per screen.** It marks the single most important thing on that screen and nothing else. If a design needs saffron twice, the design is wrong.
2. Saffron is **never** used for body text — 4.7:1 passes AA for large text only, and this product is mostly text.
3. **No gradients anywhere.** No gradient headline, no gradient button, no gradient background.
4. Dark mode is **not** shipped in ten weeks. The tokens above are structured so it is a later swap of six values, but it is explicitly out of scope (§8).

### 3.4 Type

| Token | Face | Use |
| --- | --- | --- |
| Display | **Fraunces** | Wordmark, question headings on the public answer page |
| UI (Latin) | **Manrope** | Buttons, labels, nav, metadata |
| Body (Devanagari + Latin) | **Mukta** | All answer text, all question text |

- Mukta carries Devanagari *and* its Latin companion, so a mixed-script sentence does not visibly change family mid-line. This matters more than it sounds: Hinglish answers are constantly switching scripts, and a font-fallback seam down the middle of a paragraph is the most obvious tell of an unconsidered Indian product.
- Devanagari needs **more leading than Latin**. Body: `1.75` at `18px`/`30px` mobile, `19px`/`33px` desktop. Latin defaults of `1.5` make Devanagari matras collide with the line above.
- **Font loading:** self-host, `font-display: swap`, Devanagari subset only (Mukta full-family woff2 is large; the Devanagari + Latin subset is what ships). ~~Total webfont budget: ≤180 KB across all three families, first load.~~ **Corrected at first build, 21 Nov 2026:** the measured first-load font payload is **297 KB** across the six subset files the home page actually triggers — Mukta's Devanagari subset alone is ~100 KB per weight, because the script's glyph set is genuinely large, and both 400 and 600 are required (body and the Devanagari commit label). The ≤180 KB figure was a pre-build estimate and is retired here the same way §0.3 retired the cost figure. What makes this acceptable is *which* budget binds: fonts ship with `font-display: swap`, so text paints immediately in fallback and exchanges later — they delay prettiness, not interactivity. The budget that blocks first interaction is the JS budget (§4.1, ≤120 KB), and it passes at **108 KB**. Repeat visits are full cache hits. If a future audit wants the 100 KB back, the lever is dropping Mukta 600 from the home commit button, not subsetting by text — text-subsetting a field that accepts arbitrary user questions would ship missing glyphs.

### 3.5 Space, shape, targets

- Radius: `--r-sm: 14px`, `--r-lg: 20px`. Nothing else. No `4px`, no `9999px` pills.
- Touch targets: **48×48px minimum**, 56px for the primary Ask button. Enforced in CI as a lint rule against the button component (§8, Week 2 "done means").
- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64. No arbitrary values.
- Layout: single column, **max-width 680px** for answers. Wide layouts destroy Devanagari line-length readability.
- Borders: 1px `--rule`. Shadow only on the answer card, and only `0 1px 2px rgba(20,18,15,.06)`.

### 3.6 The "not copied" checklist

Derived from the reference analysis — and since 21 November 2026, from two screenshots read element by element in §3.7: **Google AI Studio's Build screen** and **Claude's sign-in**. Each item below is a copy-signal observed in that set, and each is a **blocking review criterion** — a design that contains one does not ship, regardless of how good it otherwise looks.

- [ ] **No hero photograph.** This was the single strongest copy-signal in the reference set, and it is also the right call for a text product: a stock photo of a person typing tells Ramesh nothing and costs 200 KB on a 4G connection. The ask field *is* the hero — it is the largest element on the page and the first thing in the DOM.
- [ ] No centred headline → subheadline → two-button stack.
- [ ] No gradient text, no gradient buttons.
- [ ] No three-card feature grid with icons.
- [ ] No bento grid.
- [ ] No glassmorphism, no backdrop blur.
- [ ] No dark-mode-default-with-neon-accent aesthetic.
- [ ] No emoji in headlines.
- [ ] No animated logo, no Lottie, no parallax.
- [ ] No fabricated social proof — no invented user counts, no stock testimonial headshots.
- [ ] No "As seen in" bar.

Added 21 November 2026, from the two analysed screenshots (§3.7):

- [ ] No floating white composer card with an action row *inside* it (AI Studio).
- [ ] No gradient or rainbow hairline, glow or sheen on any surface (AI Studio).
- [ ] No launch or announcement pill above a headline (AI Studio).
- [ ] No horizontal row of icon-plus-label suggestion chips (AI Studio).
- [ ] No left-rail navigation on any public screen. Anvik's chrome is the wordmark plus one link (AI Studio).
- [ ] **No photograph anywhere in the product, including sign-in.** Standing directive, and Claude's strongest single signal (Claude).
- [ ] No two-column split with a media panel on one side (Claude).
- [ ] No stacked social login buttons, and no "OR" divider between them (Claude).
- [ ] No serif-display headline paired with a serif subline on product screens. Fraunces never sits above a serif subline (Claude).
- [ ] No black commit button on paper. Commit is `--green` (Claude).
- [ ] No verb-imperative headline syntax — "Build your ideas with…", "Question what's next" (both).

What replaces the hero photograph: **real answers, in Devanagari, on the homepage.** Three actual question-and-answer pairs from the corpus, rendered as text. They are the only social proof Anvik will ever show, they cost nothing, they demonstrate the product doing its job in the user's own language, and they are impossible to fabricate because each links to its public URL (§4.3).

**Owner amendments, 21 November 2026, after the first build was seen.** The first build shipped maximal restraint and it read as emptiness, not confidence: a bare field on an empty page is subtraction mistaken for parity. The owner's instruction stands — *the same class of product as the reference, none of its copied furniture* — and "same class" includes compositional richness. Four prohibitions above are therefore narrowed, not deleted, and the narrowing is itself a review criterion:

- A **statement headline** above the composer is permitted ("Every question deserves a straight answer."). The ban that remains is on the marketing trio — headline → subheadline → *call-to-action buttons*. A headline above the task itself is not that trio. Verb-imperative copy syntax ("Build your ideas with…") remains banned.
- **Suggestion chips** are permitted as *text-only* pills in the product's own voice. The ban that remains is on the icon-plus-label chip row with overflow chevron.
- An **elevated composer panel** is permitted: paper surface, hairline border, our shadow, green focus ring. The bans that remain are on the gradient/rainbow hairline and on an interior icon cluster (attach/mode/mic/lucky).
- A **content gallery** of real public answers is permitted below the fold as cards. The ban that remains is on the three-card *feature* grid with icons.
- **Chrome language is English** by owner decision. This revises the Hindi-first *interface*; it does not revise §6.1 — the *answer* still comes back in the language the question was asked in, Devanagari leading and matra-safe whenever that language is Hindi. The product remains Hindi-*capable* first; it is no longer Hindi-*chrome* first.

Everything else in the checklist stands, including no photograph anywhere and one saffron event per screen.

**Owner amendments v3, 21 November 2026, the English-only rebuild.** A third revision, broader than the second, recorded here with the same discipline:

- **Chrome is English-only and Devanagari-free.** No Hindi string, no Devanagari glyph in any UI surface, including About (the Kautilya shloka survives as IAST transliteration). This revises the Hindi-first *interface* a second time; §6.1 is untouched — the *answer* still returns in the language the question was written in, which is now the product's language story in one sentence.
- **Fonts: Manrope only in chrome.** Fraunces is retired, including as wordmark (the wordmark is Manrope 800 lowercase). The Mukta Devanagari face is still declared but is referenced only as a per-glyph fallback inside answer bodies, so an English page ships **zero** Devanagari font bytes and a Hindi answer still renders properly. The §3.4 budget note is superseded accordingly.
- **Surface: white page, soft grey ramp, one accent.** `#1F5F4B` deep green, used for the Ask button and focus rings *only*. The saffron flourish is retired entirely — §3.3's "one saffron event per screen" rule is void, replaced by "one accent, two jobs".
- **A left sidebar is now the shell** (wordmark, New chat, History, account placeholder at the bottom; drawer on mobile). This retires the "no left-rail navigation" prohibition, which existed to avoid copying AI Studio's rail; the owner's own shell specification overrides it, and ours carries three links and an account row, not sectioned tiny-caps navigation.
- **Chips fill the input; they do not ask.** The owner's spec; it also removes the accidental-submit hazard.
- **Review gate: `/j/` pages are `noindex` until a human reviews an answer, and the home gallery shows reviewed answers only.** New answers are public-by-URL but unindexed until reviewed; the seeded corpus is authored, therefore reviewed. This tightens §4.3, which previously indexed by default.
- **The live provider is wired.** `lib/provider.ts` now calls Gemini `streamGenerateContent?alt=sse` with a server-side key, the §7.4 output cap of 600 tokens and an identical system prompt per request (prompt-cacheable by design); the corpus engine remains as fallback when no key is set or the provider fails. **The §7.4 global daily spend ceiling (₹500) is implemented and enforced in `/api/ask` before any spend**, checked after quota and before generation.

### 3.7 Reference anatomy — two screenshots, read closely

Until 21 November 2026 the §3.6 checklist rested on a *description* of the reference set (Appendix B). Two screenshots are now in hand and have been analysed element by element: **Google AI Studio's Build screen** (`aistudio.google.com/apps`, Gemini 4 Neon era) and **Claude's sign-in** (`claude.ai/login`). Everything below is observed, not recalled.

#### R1 — Google AI Studio, Build

Composition, top to bottom: a fixed ~240px left rail (wordmark; `EXPLORE` / `BUILD` / `MANAGE` in ~11px caps; ~40px rows; the selected row a grey pill fill; an account chip at the bottom) → a centred column holding: a launch pill (circular gradient avatar + "Gemini 4 Neon is here") → a ~48px sans headline at weight ~400 → a composer card (~880px wide, radius ~16px, white, hairline border, soft ambient shadow, and a **faint multi-colour gradient hairline along its top edge**) with the placeholder top-left and an *interior* action row (circular +, a "Max mode" pill, a mic button, "✦ I'm feeling lucky") → a row of white icon-plus-label chips with an overflow chevron → below the fold: "Explore apps built with…" with a right-aligned gallery link.

Type: one sans family at three sizes (11 caps / 14 / 48). Hierarchy is carried by size and whitespace, never by weight. Colour: a grey monochrome with exactly two colour events — the gradient avatar and the rainbow hairline — plus the small chip icons.

Why it works: (1) **the input is the hero** — the largest object on the page is where you type; (2) every secondary affordance lives *inside* the composer, so chrome never competes with the task; (3) blank-page fear is solved twice, by chips (what could I ask?) and by the gallery (what has this made?), both *below* the field; (4) the launch pill dates the page without a banner; (5) roughly eight interactive elements above the fold, and not one more.

#### R2 — Claude, sign-in

Composition: a warm paper canvas (~`#f2f0ec`); the wordmark alone top-left (starburst glyph + serif name); two vertically centred columns at roughly 46/54. Left column: a ~64px old-style serif headline, a ~20px serif subline, then a floating white card (radius ~16px, shadow, no border) holding two stacked grey social buttons with brand glyphs, an 11px "OR", a grey email field, and the page's only high-contrast object — a black commit button; one secondary button sits outside the card. Right column: a full-height rounded **photograph** — candid, desaturated teal and khaki, a person buried under real paper mess.

Type: serif carries meaning (display and subline); sans appears only inside controls. That split is the signature. Colour: paper, ink, and the photo. Zero brand-colour moments; even the starburst is ink.

Why it works: (1) three materials, three jobs — the photo carries emotion, the type carries meaning, the controls carry action, with no overlap; (2) paper plus serif borrows print's authority; (3) the card floats on shadow rather than border, and softness reads as premium; (4) the black commit button is the single contrast event on the page, so commitment is unmistakable; (5) the *mess* in the photo is the message — real work, not demo work; (6) the photo's palette is the only saturated colour anywhere, which is why the page reads calm rather than empty.

#### What the two share — the actual lesson

1. One job per screen; nothing else gets oxygen.
2. The primary input is the largest, highest-contrast interactive element; everything else is ghost, hairline or grey.
3. Whitespace is the structure: no boxes, no dividers above the fold.
4. Type confidence: one display family plus one UI family, three to four sizes, no shouting via weight.
5. Proof and secondary content strictly below the fold.
6. Exactly **one colour event per screen**; the rest is paper, ink and grey.
7. Floating cards use shadow, not border; hairlines are for pills and rules only.
8. Nothing above the fold but a headline and at most one subline. No marketing.

#### Parity ladder — where "same" is non-negotiable

Field focused on load with no interstitial · one unmistakable primary action · no more than ten interactive elements above the fold · display type with real presence at mobile sizes · a consistent soft-shadow language · proof below the fold · first paint that feels instant (skeleton ≤150ms, §4.2).

#### Beat ladder — where "better" is achievable and specific

1. **Weight.** Both shells are multi-hundred-kilobyte SPAs; Claude adds a 200–400 KB photograph. Anvik's ask route ships ≤120 KB of JS and **no image above the fold at all** (§4.1): interactive on 4G in seconds rather than tens of seconds. This is the beat their own users would feel.
2. **Value before identity.** Both gate first value behind a Google or Apple account. Anvik answers before it knows who asked (§4.1).
3. **Proof that compounds.** Their below-fold proof is a vendor gallery. Anvik's is real neighbours' questions with real answers, each one a public indexable URL (§4.3).
4. **Script-native type.** Both render Devanagari as a Latin system's fallback. Anvik's type system is Devanagari-first (§3.4) — matra-safe leading, mixed script without a seam. A Latin-first type system cannot match it.
5. **Price honesty in the same screen.** *"आज 3 सवाल बाकी"* on the ask screen (§4.1), against subscriptions hidden behind a login.
6. **Emotion without imagery.** Claude buys its feeling with one expensive photograph. Anvik's feeling is real Devanagari answers set on paper — cheaper, truer, and impossible to clone because it *is* the corpus.

#### Translation table — principle, their expression (refused), Anvik's expression

| Principle | AI Studio's expression — refused | Claude's expression — refused | Anvik's expression |
| --- | --- | --- | --- |
| The input is the hero | Floating white composer card with rainbow hairline | — | No card: the field is a rule on paper; the ink hairline thickens to `--green` on focus |
| Affordances travel with the input | +, mode, mic and lucky inside the composer | — | Nothing inside; launch has no mode, mic or attach to hide |
| Beat blank-page fear | Icon-chip row with overflow chevron | — | Three real corpus questions as Devanagari text links (§4.1) |
| One colour event | Gradient hairline plus avatar | The photograph | Home: one saffron stroke under the wordmark. Elsewhere: the saffron focus underline. One per screen (§3.3) |
| Editorial calm | — | Paper plus serif plus sans controls | Paper plus ink; Fraunces only as wordmark, About and public question headline; Mukta for everything read; Manrope for controls (§3.4) |
| Soft float | Composer shadow | Card shadow | Only the answer card floats (§3.5); the field never floats |
| Unmistakable commit | Bordered pill inside the composer | Black button on paper | `--green`, 56px, Devanagari label **पूछें** (§4.1) |
| Sign-in feeling | — | Full-height photo panel | No photograph, ever. The §4.4 claim state |

A note on §4.1 worth defending in review: it has **no headline above the field**, which is more radical than either reference and correct. Both put a headline above their input, and both thereby admit the input needed an introduction. Anvik's field introduces itself with a rotating Devanagari placeholder and three real questions. Do not add a headline to it.

---

## 4. Seven screens

The entire product. Anything not on this list does not exist in ten weeks.

### 4.1 Ask (`/`)

The homepage and the product at once.

```
        anvik

   ┌─────────────────────────────┐
   │ आपका सवाल यहाँ लिखें…       │   ← the field. 3 lines tall,
   │                             │     grows to 8, autofocus on load
   └─────────────────────────────┘
              [ पूछें ]              ← 56px, --green, full width on mobile

   आज 3 सवाल बाकी हैं                ← remaining free quota, plain text

   ── आज पूछे गए सवाल ──
   क्रेडिट स्कोर कैसे बढ़ाएं?        ← 3 real answers from the corpus,
   किसान सम्मान निधि की किस्त…          each a link to its public URL
   GST नोटिस आया है, क्या करूं?
```

- **No account, no login, no email** to ask. Device identity only (§6.2).
- Placeholder rotates through four real example questions in Devanagari and Hinglish.
- Submit: `Enter` on desktop, on-screen button on mobile. Never a chat-style send icon alone.
- Empty-field submit does nothing; no error toast for a mistake the user can see.
- **Budget:** ≤120 KB of JS on this route. The field and the button must work before hydration — form POST fallback if JS fails.

### 4.2 Answering (`/` → inline, same route)

Not a separate screen — a state of 4.1. Streaming into the field's answer area below it.

- **Optimistic skeleton in ≤150ms**, before any provider response: three shimmering lines at answer width. Perceived latency is the product's whole feel.
- Stream tokens as they arrive. Devanagari renders progressively without reflow jumps (fixed line-height, `content-visibility` off for the streaming container).
- A visible **रोकें** (stop) button from the first token.
- On provider timeout (>12s) or error: a plain-language Hindi message, *one* free retry offered automatically, and the question returned to the field so nothing typed is ever lost. **Losing a typed question is the worst failure mode in the product** — it is treated as a P0 bug class.
- On quota exhausted: the message and the price appear in the same view (§4.5), no modal.

### 4.3 Public answer page (`/j/[slug]`)

**The only organic growth channel that compounds, and therefore the most important screen after 4.1.**

- Server-rendered, no JS required to read. Full HTML in the first response.
- URL slug derived from the question, transliterated to ASCII, human-readable, stable, never re-generated.
- Question in Fraunces at display size; answer in Mukta at 19px/33px; `--paper` background; 680px column.
- **Open Graph:** `og:title` = the question, `og:description` = the first 160 characters of the answer as real text. **No generated image.** A text preview in a WhatsApp thread reads as a person sharing a useful thing; a branded image card reads as an advertisement and gets forwarded less.
- Canonical URL, `Article` structured data, sitemap entry, `index,follow` by default.
- Footer of every public answer: the wordmark, one line — *"अन्विक — हिंदी में कोई भी सवाल पूछें"* — and a single **पूछें** button that opens 4.1 with the field focused. This is the entire conversion mechanism. No banner, no interstitial, no cookie wall.
- A moderation-flagged answer is served `noindex,nofollow` and hidden from the corpus but still reachable by direct link until reviewed (§6.5).
- **Duplicate handling:** if a new question is semantically near-identical to an existing public answer (normalised-string match at launch; no embeddings — §5.4), the existing answer is shown with a *"यह जवाब पहले से मौजूद है"* note and a **नया जवाब बनाएं** action. This is simultaneously a cost control and the mechanism by which the corpus grows dense instead of repetitive.

### 4.4 History (`/h`)

- Device-local by default (`localStorage`, keyed by device id). No account needed.
- Optional claim: *"अपना इतिहास सेव करें"* → magic-link email or phone OTP → local history merges into the account. This is the **only** reason to create an account, and it is never asked for before the third question.
- List view: question, first line of answer, relative date in Hindi (*"3 दिन पहले"*).
- Per-item: open, share, delete. Bulk delete all.
- Deletion is real: purges the row, and if the answer was public, unpublishes it (§6.4).

**Claim state — the screen that will be compared to Claude's login.** Sign-in exists only to claim device history into an account, so it is a *state* of this screen rather than an eighth screen, and it is designed to be calmer than the reference without borrowing a pixel of it (§3.7, R2): a single centred column, max-width 420px, directly on paper — the wordmark; one line of reason in Mukta (*"अपना इतिहास सभी डिवाइस पर देखें"*); one 48px OTP or magic-link field drawn as an ink hairline; one green commit button; one *"बाद में"* text link back. **No social buttons** — a Google/Apple stack is both a copy-signal and an assumption Ramesh does not need. **No floating card, no photograph, no serif subline under a serif headline.** Everything sits on paper between two hairline rules. If a reviewer says it feels like Claude's login, the intended answer is: same calm, none of the furniture.

### 4.5 Pricing & quota (`/pricing`)

Three tiers, in rupees, with the free tier presented as a product rather than a teaser.

| | **मुफ़्त** | **रोज़़** — ₹49/माह | **साल** — ₹399/वर्ष |
| --- | --- | --- | --- |
| सवाल प्रति दिन | 3 | 50 | 50 |
| इतिहास | इसी डिवाइस पर | सभी डिवाइस | सभी डिवाइस |
| जवाब की लंबाई | मानक | लंबा | लंबा |
| सार्वजनिक पेज | हाँ | हाँ + अनलिस्ट करें | हाँ + अनलिस्ट करें |

- Annual is 32% cheaper than monthly and shown as *"₹33/माह"* — the effective monthly figure, because that is how Ramesh will compare it to a chai.
- One-time pack available without a subscription: **₹19 for 25 questions**, 30-day validity. This exists because a large share of demand is episodic (one form, one notice, one admission) and a subscription is the wrong shape for it. It is also the cheapest possible first payment, which is what actually converts a UPI-first user.
- Prices stated inclusive of GST. GST invoice on request via a link, not a support email.
- **No free trial requiring a card. No dark patterns. No countdown timer. No "5 people are viewing this".**

### 4.6 Checkout (`/pay/[plan]`)

- PSP: Razorpay or Cashfree (§9, Decision 3). UPI intent first, then QR, then cards/netbanking/wallets.
- **UPI intent** must be the first control on the page — it is >70% of retail volume and it is the only method that does not require entering anything.
- Amount, plan name and renewal date stated in Devanagari-labelled rows before the pay button. No price appears only in the PSP popup.
- On success: immediate quota update, no "please wait", redirect to 4.1 with the field focused and a one-line confirmation.
- On failure: the quota is *never* deducted, the failure reason is stated in Hindi, and retry is one tap.
- On abandonment: nothing charged, nothing nagged. One non-blocking prompt on the next visit, never again.
- Webhook-driven entitlement. **Never** trust a client-side success callback to grant quota (§6.3).

### 4.7 About (`/about`)

One page, five short sections, no imagery.

1. The wordmark, and **अन्विक** set once beside it.
2. The Kautilya quote in §3.1, in Sanskrit, with a two-line plain-Hindi gloss — not a translation, a gloss.
3. What Anvik does, in four sentences, at Ramesh's reading level.
4. What it will not answer, and why (§6.5, in plain language — this is a trust document, not a legal one; the legal terms live separately).
5. How to reach a human: one email address, monitored, with a stated response time. No form.

---

## 5. Architecture

### 5.1 Hard constraints

- **No GPU.** None. Not owned, not rented, not reserved.
- **No training.** No pretraining, no fine-tuning, no LoRA, no embedding-model training.
- **No model hosting.** Anvik is a caller of hosted APIs.
- **No vector database at launch.** §5.4 explains why, and what replaces it.

### 5.2 Shape

```
  Browser (mobile web, 4G)
        │  one field, form-POST fallback
        ▼
  Next.js (App Router) ── edge-cached static shell
        │
        ├── SSR for /j/[slug]  ← public answers, no JS needed
        │
        └── POST /api/ask  (server route; the ONLY route that holds a key)
                 │
                 ├─ 1. rate-limit check   → Postgres (atomic, §6.2)
                 ├─ 2. quota check        → Postgres
                 ├─ 3. input guard        → length, blocklist, injection (§6.5)
                 ├─ 4. language detect    → local, deterministic (§6.1)
                 ├─ 5. duplicate check    → normalised-string match (§4.3)
                 ├─ 6. provider call      → streamed, cached system prompt
                 ├─ 7. output guard       → refusal patterns, PII scrub
                 └─ 8. persist + cost log → Postgres, same transaction
```

- **Hosting:** Vercel (or equivalent) with the compute in the India region; **Supabase Postgres in `ap-south-1` (Mumbai)**. Round-trip to the database is on the hot path of every question — a US-East DB adds ~200ms to every ask and is a self-inflicted wound for a latency-sensitive product.
- **Provider keys exist only in server-side env.** No key, ever, in a client bundle, an edge function's public config, or a source map. Verified by a CI grep gate (§8, Week 2).
- **All writes to Postgres use the service-role key, server-side only.** The `anon` role gets `SELECT` on exactly two things: nothing. Public answers are read through the SSR route, not from the browser. This is the "service-role-only writes" pattern named in the brief — noted as **unverified prior art** (§0.2), so it is implemented here from scratch and covered by an explicit test that the anon key cannot insert.
- **Streaming** end to end: provider SSE → server route → browser. No buffering of the full answer before first paint.
- **Idempotency:** every ask carries a client-generated idempotency key; a retry after a network blip must not double-charge quota or double-bill tokens.

### 5.3 Reused patterns — status

| Pattern (named in the brief) | Status in this repo | Treatment here |
| --- | --- | --- |
| Postgres rate-limit store | **Not present.** Nothing to reuse. | Reimplement: single table, atomic `UPDATE … WHERE` decrement, sliding window. Test for race under concurrent requests. §6.2 |
| Service-role-only writes | **Not present.** | Reimplement + negative test proving `anon` cannot write. §5.2 |
| Error boundaries | **Not present.** | Reimplement: one root boundary, one per route segment, Hindi fallback copy, never a blank screen. |
| CI gate | **Not present.** No CI config in repo. | Create: typecheck, lint, build, the 48px-target lint rule, the key-grep gate, the cost canary (§7.4, control 4). |

### 5.4 What is deliberately absent

- **No vector DB / no RAG at launch.** A retrieval layer for scheme and form questions is genuinely valuable and genuinely tempting. It is deferred because: (a) it needs a corpus that is curated and dated — government scheme detail changes annually and a stale retrieved chunk is worse than no chunk; (b) it adds an embedding cost per answer and per question, breaking the ₹0.12 model; (c) at launch volume the duplicate check in §4.3 catches most of the repetition with a normalised-string match costing nothing. **Revisit at Week 10** with data on how often answers were wrong for want of a source.
- **No conversation memory.** One question, one answer. The system prompt is identical for every user, which is precisely what makes prompt caching work (§7.4, control 3).
- **No queue / no worker at launch.** Synchronous request-response. A queue becomes necessary when a daily ceiling forces deferral rather than refusal; that is a post-launch problem and a good one to have.
- **No A/B framework.** Ten weeks does not have room for statistically significant experiments on this traffic. Decisions are made on qualitative signal from the Week 7 beta.

---

## 6. Data model, language policy, refusal policy

### 6.1 Language detection — deterministic, no model call

Detection must be free, sub-millisecond and explainable. A model call to decide the language of a 12-word question, before the model call that answers it, would roughly double the input cost for no gain. Policy, evaluated in order:

1. **Script first.** Compute the fraction of letters in Unicode block Devanagari (`U+0900–U+097F`). **>30% → `hi`.** The threshold is 30% rather than 50% because Hinglish questions routinely embed Latin nouns (`"मेरा CIBIL score कैसे बढ़ाएं"`) and must still be classified Hindi — the answer should be in Devanagari with those nouns retained, which is exactly what Ramesh reads.
2. **Then Hinglish stopwords.** If the script test fails, match a fixed list of ~120 romanised Hindi function words and inflections — `kya, kaise, hai, hain, kaun, kab, kahan, kyu, kyunki, mera, tera, aapka, hum, ye, wo, karo, karna, chahiye, batao, samjhao, sahi, galat, paisa, sarkar, form, apply` — against a lowercased, punctuation-stripped form of the question. **≥2 distinct hits → `hi-Latn` (Hinglish).** Two rather than one, because single-token collisions with English are common (`hai` in a name, `kaun` transliterated oddly).
3. **Otherwise → `en`.**

**Response language always matches detected input language.** Never auto-translate. A Hinglish question gets a Hinglish answer in Latin script; a Devanagari question gets Devanagari. Users who want the other script re-ask, and that is fine — it is one field.

**Ambiguity rule:** if a question is under 3 words and both tests are inconclusive, default to **Devanagari**. The product's default register is Hindi; falling back to English would be falling back to the incumbent behaviour §2.1 exists to replace.

The stopword list is versioned in source and its hit-rate logged, so it can be tuned against real traffic in Week 7. **Accuracy target: ≥97% on the beta corpus**, measured by hand, not by a classifier.

### 6.2 Rate limiting and device identity

- **Identity without accounts:** a first-party device id in `localStorage` + a signed, `HttpOnly`, `SameSite=Lax` cookie, both issued on first visit and cross-checked. Neither is a fingerprint; no canvas, font or UA fingerprinting — that is both a privacy position and a legal one under the DPDP Act.
- Because device ids are trivially cleared, they are a **quota** mechanism, not a security boundary. Abuse control is layered: rate limit by IP *and* by device, and the global daily ceiling (§7.4) bounds total exposure regardless of how many devices are fabricated.
- **Atomic decrement.** Quota consumption is a single Postgres statement —
  `UPDATE quota SET remaining = remaining - 1 WHERE device_id = $1 AND day = $2 AND remaining > 0 RETURNING remaining;`
  — so two concurrent requests cannot both succeed on the last remaining question. Zero rows updated means "exhausted", and the user sees §4.5. This is the race the pattern in §0.2 was said to solve; since it could not be read, it is written here explicitly and **tested with 20 concurrent requests against a quota of 1** (§8, Week 2).
- **Limits at launch:** 6 asks/minute/device, 20/hour/IP, 3/day free (§4.5). All three are config, not code.
- **Sliding window**, not fixed-day, for the per-minute and per-hour limits; fixed-day for quota, because "3 सवाल प्रति दिन" must mean what it says to the user.

### 6.3 Seven tables

| # | Table | Purpose | Notes |
| --- | --- | --- | --- |
| 1 | `questions` | One row per ask | id, device_id, account_id (nullable), text, detected_lang, slug, idempotency_key, created_at, status |
| 2 | `answers` | One row per generated answer | question_id (FK), body, model, prompt_tokens, output_tokens, cached_tokens, cost_inr, latency_ms, is_public, published_at, moderation_state |
| 3 | `devices` | Anonymous identity | id, first_seen, last_seen, ip_hash (SHA-256 + daily salt, never raw IP), ua_class, locale |
| 4 | `accounts` | Optional, claimed history | id, email or phone (unique, nullable pair), created_at, plan, plan_expires_at |
| 5 | `quota` | Per-device daily allowance | device_id, day, remaining, granted_by (`free` \| `plan` \| `pack`), **PK(device_id, day)** |
| 6 | `payments` | PSP-recorded entitlements | id, account_id nullable, psp_ref, amount_inr, gst_inr, plan, pack_size, status, webhook_at, idempotency_key |
| 7 | `moderation_events` | Every guard action | id, question_id, stage (`input` \| `output` \| `report`), reason_code, action, reviewer_notes, created_at |

Design rules:

- **Cost is stored per answer, in rupee paise, at write time** (`cost_inr` as integer paise). The daily ceiling (§7.4) reads a `SUM` over today's rows, so it must be in the same transaction as the answer, never computed later from provider billing.
- **Raw IPs are never stored.** Only a daily-salted hash, retained 30 days, for rate limiting. This is a deliberate DPDP-minimisation position and it is cheaper to get right now than to retrofit.
- **No PII table, no PII column.** Question text will contain PII whether the schema allows it or not — output guard scrubs it from *public* answers (§6.5), and private rows are deleted on request and hard-purged at 180 days.
- `answers.moderation_state` ∈ `clean | flagged | removed`. Only `clean` and `flagged` are served; `flagged` is served with `noindex` (§4.3).

### 6.4 Retention and deletion

- Public answers: retained while published; unpublishing on user request is immediate and removes the row from the sitemap and search index within one crawl cycle.
- Private questions/answers: 180 days, then hard purge.
- Payments: 8 years (statutory).
- Moderation events: 12 months.
- A single `DELETE /api/me` endpoint, no account required, purges everything attached to a device id. Discoverable from §4.4, not buried in terms.

### 6.5 Refusal and moderation policy

Two-sided: input guard before the provider call, output guard after. Both log to `moderation_events`. Both are **deterministic at launch** — pattern lists and provider classifiers, no second model call, because a classifier call on every ask is a cost line §7 cannot absorb.

**Hard refusals** — declined, in Hindi, with a reason and a route onward. Never a silent block, never a legal paragraph.

| Category | Response |
| --- | --- |
| Child sexual abuse material, any form | Refuse. Log. Preserve evidence per statutory obligation. No onward route. |
| Self-harm or suicide | Refuse to advise. Immediate, prominent **iCall: 9152987821** and **Tele-MANAS: 14416**, in Devanagari, before anything else in the response. |
| Weapons, explosives, CBRN | Refuse with one line. No partial information, no "however". |
| Malware, intrusion, credential attack | Refuse. |
| Targeted harassment of a named private individual | Refuse. |
| Attempted prompt injection / jailbreak | Refuse plainly: *"यह सवाल मैं इस तरह से जवाब नहीं दे सकता।"* Do not explain the mechanism — explaining it is the tutorial. |

**Soft refusals — advise-with-limits.** These are the categories Ramesh will actually ask about most, so refusing them outright would refuse the product's reason to exist.

| Category | Policy |
| --- | --- |
| Medical symptoms | **Never diagnose, never dose.** Describe, in plain Hindi, what the symptom commonly indicates; state that a doctor is needed; route to **108** (emergency) or the nearest government facility. Always. No exceptions for "mild" questions — the model cannot reliably tell mild from serious, and the user cannot either. |
| Legal | Explain the process and the document; never predict an outcome; always name the official source and link to it. |
| Financial | Explain instruments and eligibility; never recommend a specific stock, fund, scheme-investment or crypto asset; never forecast a price. |
| Government schemes | **The launch category.** Answer fully, state the eligibility conditions explicitly, and **always link the official `.gov.in` page**. Add a standing one-line caveat that rules change and the official page governs. An imperfect answer here that sends Ramesh to the right portal is a success; a confident wrong one is the main product risk. |
| Elections, caste, religion | Factual and procedural content: yes. Opinion, persuasion, prediction: no. |

**Output guard, applied to every answer before it is served or stored:**

1. PII scrub on anything becoming public: Aadhaar-like 12-digit sequences, PAN-like patterns, 10-digit mobile numbers, email addresses, bank account numbers → redacted with a visible `[…हटाया गया]` marker. Never silently dropped.
2. Refusal-pattern detection: if the provider itself refused mid-stream, mark `flagged`, do not publish, do not show a half-refusal to the user.
3. URL allowlist on published answers: only `*.gov.in`, `*.nic.in` and a small maintained list of official bodies pass into a *public* page. Everything else is stripped to plain text. This is the control that keeps a hallucinated link off an indexable page.
4. **1% random sample reviewed by a human, daily, in Week 7–10.** User reports go to the same queue. Reviewer verdict feeds the pattern lists.

---

## 7. Cost model

### 7.1 Inputs, all verified November 2026

**FX.** USD/INR traded ₹93.4–95.1 through November 2026. **Planning rate: ₹95/$**, deliberately pessimistic — a stronger rupee later is upside, not a surprise.

**Provider prices, per 1M tokens:**

| Model | Input | Cached input | Output |
| --- | --- | --- | --- |
| Gemini 2.5 Flash | $0.30 | $0.03 | $2.50 |
| Gemini 3.1 Flash-Lite | $0.25 | $0.025 | $1.50 |
| GPT-5 Mini | $0.25 | — | $2.00 |
| GPT-4.1 Mini | $0.40 | — | $1.60 |
| Claude Haiku 4.5 | $1.00 | $0.10 | $5.00 |
| Claude Sonnet 4.6 | $3.00 | $0.30 | $15.00 |

**Token fertility — the number that decides this product's economics.**

General-purpose tokenizers are trained on English-heavy corpora and fragment Devanagari. Measured figures for Hindi:

| Tokenizer | Tokens/Hindi word | vs English |
| --- | --- | --- |
| GPT-4o (`o200k`) | 1.65 | 1.34× |
| Independent measurement | 1.89 | 1.63× |
| Gemma-2 | 1.96 | 1.59× |
| Llama-3.1 | 2.67 | 2.15× |
| Per-1,000-character view | ~480 tokens | 1.92× |

**Planning factor: 1.9 tokens per Devanagari word.** Two consequences that must be designed around, not discovered later:

- The same question costs a Hindi user **~1.6–1.9× more** than an English user. The product's entire audience pays the token tax. This is why §7.4 controls 3 and 5 exist.
- Haiku 5.5 uses a *different* tokenizer that produces more tokens for the same text than Haiku 4.5. **Any model switch requires re-measuring fertility on real Anvik questions before the price is compared** — a cheaper per-token model with a worse tokenizer can cost more per answer.

### 7.2 Cost per answer

Token profile for one answer, from the §4.1–4.3 designs:

| Component | Tokens | Why |
| --- | --- | --- |
| System prompt (cached) | 2,200 | Style contract, refusal policy, formatting rules. **Identical for every user** (§5.4) — this is what makes caching possible. |
| Question + JSON/protocol overhead | 70 | 25 Devanagari words × 1.9 ≈ 48, plus wrapper |
| **Output** | **450** | ~235 Devanagari words. **Capped at 600 (§7.4, control 3).** |

**Output is 90–95% of the bill.** Every rupee of saving in this product comes from the answer's length, not from the question's, and not from picking a cheaper input tier.

Per answer, at ₹95/$:

| Model | Cached in | Uncached in | Output | **Total** | **₹/answer** |
| --- | --- | --- | --- | --- | --- |
| Gemini 3.1 Flash-Lite | $0.000055 | $0.000018 | $0.000675 | $0.000748 | **₹0.071** |
| Gemini 2.5 Flash | $0.000066 | $0.000021 | $0.001125 | $0.001212 | **₹0.115** |
| GPT-5 Mini | $0.000055 | $0.000018 | $0.000900 | $0.000973 | **₹0.092** |
| GPT-4.1 Mini | $0.000088 | $0.000028 | $0.000720 | $0.000836 | **₹0.079** |
| Claude Haiku 4.5 | $0.000220 | $0.000070 | $0.002250 | $0.002540 | **₹0.241** |
| Claude Sonnet 4.6 | $0.000660 | $0.000210 | $0.006750 | $0.007620 | **₹0.724** |

**Planning rate: ₹0.12 per answer** (Gemini 2.5 Flash class, with headroom).

**Achievable floor: ₹0.08**, on Flash-Lite/GPT-4.1-mini class *and* with output trimmed to ~350 tokens.

**The brief's ₹0.08–0.15 target is achievable — but only at Flash class, and only with a hard output cap.** It is not achievable on Haiku 4.5 (₹0.24, 2× the ceiling) and nowhere near on Sonnet (₹0.72, 6×).

### 7.3 Daily and monthly, corrected

The brief's **₹240–450/day at 1,000 users** implies ₹0.24–0.45 per answer at one answer per user per day. That is Haiku-class pricing, not Flash-class. Recomputed:

| Scenario | Answers/day | ₹/answer | **₹/day** | **₹/month** |
| --- | --- | --- | --- | --- |
| **Planning case** — 1,000 DAU, ~1 ask each, Flash | 1,000 | 0.12 | **₹120** | ₹3,600 |
| Brief's stated figure, read as Flash | 1,000 | 0.24–0.45 | ₹240–450 | ₹7,200–13,500 |
| Brief's figure *actually* implies this volume | 2,000–3,750 | 0.12 | ₹240–450 | ₹7,200–13,500 |
| **Quota-saturated worst case** — 1,000 DAU × 3 free asks | 3,000 | 0.12 | **₹360** | ₹10,800 |
| Same worst case on Haiku | 3,000 | 0.24 | ₹720 | ₹21,600 |
| Same worst case on Sonnet | 3,000 | 0.72 | ₹2,160 | ₹64,800 |

**Reading:** the honest planning figure is **₹120/day**, and the honest worst case at 1,000 DAU is **₹360/day** — inside the brief's range, but reached for a different reason (volume saturation, not unit cost). Paid users at 50 asks/day change this: **100 paying users saturating quota is 5,000 answers = ₹600/day = ₹18,000/month against ₹4,900/month of revenue.** That is the real exposure, and it is why control 1 and the 50-ask cap are not negotiable (§7.4, §7.6).

Infrastructure on top: ≈₹1,500–3,000/month (hosting, Mumbai Postgres, CDN, PSP is per-transaction ~2%). At planning volume, **the model bill is ~95% of total cost.** Everything else is rounding.

### 7.4 Five controls

In priority order. Control 1 is the only one that is absolute.

**1. Global daily ceiling — ₹500/day of model spend.**
A `SUM(cost_inr)` over today's `answers` rows, checked *before* the provider call, in the same path as the quota check. At ≥90% the ask field shows a plain Hindi notice (*"आज के लिए सवाल पूरे हो गए, कल सुबह फिर शुरू"*) and the site keeps serving every public answer page. **A hard ceiling converts an unbounded liability into a bounded one**: whatever the volume, whatever the abuse, whatever the model, no day can cost more than ₹500 — ₹15,000/month, worst case, forever. This is the single reason the cost model cannot become a disaster, and it is why §7.3's worst cases are survivable rather than merely estimated. Set in config, alerting at 70%.

**2. Per-device daily quota, enforced atomically.**
3 free / 50 paid (§6.2). Atomic single-statement decrement, race-tested. This bounds the *shape* of demand; control 1 bounds the total.

**3. Hard output cap — `max_tokens: 600` — plus a cached system prompt.**
Output is 90%+ of cost (§7.2). Capping it at 600 and writing the style contract to be *complete within that cap* is worth more than every other control combined. The 2,200-token system prompt is **byte-identical for every request** so cache reads are the norm, not the exception — 90% off input. Any future per-user personalisation of the prompt breaks caching and is therefore forbidden without a cost review.

**4. Cost canary in CI.**
Every deploy runs 20 fixed real questions (10 Devanagari, 10 Hinglish), measures actual tokens and rupees per answer, and **fails the build if median cost per answer exceeds baseline by 30%**. This is the control that catches the two failures that would otherwise arrive as a bill: a tokenizer change on a model upgrade (§7.1), and a prompt edit that silently lengthened answers.

**5. Model routing by tier, with escalation gated.**
Default: Flash class for everyone. A "विस्तार से बताएं" (explain in more) action re-asks on the same model with the cap raised to 900 — **not** a jump to Sonnet. Premium-model routing is a post-launch decision that requires the Week 10 data, because at ₹0.72/answer Sonnet is 6× the planning rate and would need a materially higher price point than ₹49 to carry.

### 7.5 What controls 1–5 bound, together

Worst case, all five in force: **₹500/day, ₹15,000/month, regardless of traffic.** Compare §7.3's uncapped Sonnet-saturated case at ₹64,800/month. The controls are worth roughly 4× the entire planning budget, and control 1 alone is what makes the number provable rather than hopeful.

### 7.6 Pricing against that cost

| | Free | ₹49/mo | ₹399/yr | ₹19 pack |
| --- | --- | --- | --- | --- |
| Max answers | 3/day | 50/day | 50/day | 25 once |
| **Max model cost** | ₹0.36/day | **₹6.00/day** | ₹6.00/day | ₹3.00 once |
| Monthly cost if saturated | ₹10.80 | **₹180** | ₹15 (effective) | — |
| **Gross margin if saturated** | — | **73%** | 82% | 84% |

Margin is thin *only* if a paying user saturates quota every single day, which the Week 7 beta will measure directly. At a realistic 8–12 asks/day for a heavy user, ₹49/month carries ≈₹1,100 of margin. The **50-ask cap is the thing that makes ₹49 viable** — an unlimited plan at ₹49 would be an invitation to resell access at a loss.

---

## 8. Ten weeks

Each week has a "done means" test that is observable and binary. A week that does not pass its test is repeated; the schedule slips rather than the standard dropping.

**Week 1 — Measure before anything is built.**
Build the throwaway cost harness: 20 real questions collected from Hindi-speaking friends and family, run against each candidate model, record actual tokens and rupees. *Done means:* a table like §7.2 filled with **measured** numbers, and a chosen default model. This week exists because §0.3 happened — the brief's number was wrong by 3× and was caught on paper. Catching it in the bill costs ₹15,000.

**Week 2 — Design system and the ask field.**
Tokens from §3 as CSS custom properties; Fraunces/Manrope/Mukta self-hosted and subsetted; the 4.1 field built with the form-POST fallback. *Done means:* Lighthouse mobile ≥90 on a simulated slow 4G; **≤120 KB JS** on `/`; the 48px-target lint rule passing; a CI grep proving no provider key appears in any client artifact; the "not copied" checklist (§3.6) signed off item by item in review.

**Week 3 — The ask→answer loop, end to end.**
Server route, streaming, skeleton in ≤150ms, stop button, idempotency, error states with question recovery. *Done means:* 20 consecutive asks with zero lost questions, including three forced failures (provider timeout, network drop mid-stream, duplicate submit). First token <1.2s from Mumbai; complete answer <6s.

**Week 4 — Language detection and the answer voice.**
§6.1 implemented; the §3.1/§2.1 style contract written into the system prompt; 40-question hand-labelled eval set. *Done means:* **≥97% language detection accuracy**, and 10 of 10 Hindi-literate reviewers rate the answer voice as natural rather than translated. The second test is the important one and it is run with real people, not a score.

**Week 5 — Public answer pages and the share loop.**
SSR `/j/[slug]`, OG tags, canonical, sitemap, structured data, the duplicate check, the footer conversion mechanism. *Done means:* a public URL fetchable with JS disabled, appearing in Search Console, and a WhatsApp-forwarded link rendering its question and answer text as the preview.

**Week 6 — Quota, Postgres, and the abuse layer.**
All seven tables; atomic decrement; rate limits; §6.5 input and output guards; PII scrub; URL allowlist; the ₹500 ceiling. *Done means:* the **20-concurrent-requests-against-quota-of-1** race test passes; the anon key provably cannot write; the ceiling demonstrably halts asks at threshold while public pages keep serving; 10 of 10 injected jailbreak attempts refused without leaking the mechanism.

**Week 7 — Payments.**
PSP integration, UPI intent first, webhook-driven entitlement, the four price points, GST invoice. *Done means:* a real ₹19 pack purchased on a real Android phone over real UPI, quota live in <5s, and — tested explicitly — **a failed payment and an abandoned payment both leave quota untouched and charge nothing.**

**Week 8 — Closed beta, 25 users, no marketing.**
Recruited in person from Lucknow and Kanpur: shopkeepers, a CA's office, a tuition teacher, students, a ration dealer. Observed, not surveyed. Every refusal reviewed by hand. *Done means:* 25 users, ≥100 real questions asked, each one read; **≥40% return within 7 days**; language detection re-measured on real traffic; cost per answer within 20% of the §7.2 plan. If return rate is below 40%, the §9 kill criteria are consulted immediately rather than at Week 10.

**Week 9 — Launch.**
Public URL, the corpus seeded with ~50 genuinely useful scheme-and-form answers, one launch post in the places Ramesh's questions come from, zero paid spend. *Done means:* live, no P0 open, first 100 organic public answers indexed, and the first unprompted share observed in the wild.

**Week 10 — Decide.**
Measure against the kill criteria below, in writing, before touching any new feature. *Done means:* a written continue/kill/pivot decision with the numbers attached, and — if continue — the §5.4 RAG decision taken on real data about how often answers were wrong for want of a source.

### 8.1 Kill criteria — written before any emotional investment

Recorded now, while nothing exists, precisely so that they cannot be argued around in Week 10 when ten weeks of work is on the table.

**Kill the product if, at Week 10:**

1. **<25% of beta users return within 7 days.** Retention is the whole thesis. A shareable answer page with no return traffic means the answers are not useful, and no amount of design fixes that.
2. **Measured cost per answer >₹0.25 and not reducible by output discipline.** At ₹0.25 the ₹49 plan runs at negative margin once a user asks 8+/day, and the free tier costs ₹0.75/day/device — the ceiling then throttles the product daily, which means the product is throttled by its own economics at trivial scale.
3. **>15% of answers in the launch category (schemes, forms, official process) are factually wrong on hand review.** The category chosen for being safe is not safe enough. This is measured by reading answers, not by asking users if they were satisfied.
4. **Organic shares per 100 answers <5 after four weeks of public availability.** Door 4 (§2.4) is the only funded acquisition channel. If it does not work, there is no route to growth that ₹49/month can pay for.
5. **Two consecutive weeks at the ₹500 daily ceiling before 500 DAU.** Cost is outrunning demand, and the ceiling is converting growth into a queue.

**Pivot rather than kill if:** the launch category is wrong but another shows retention — most likely candidate is exam and admission forms, which are seasonal and intensely shared. Keep the architecture, the tokens and the share loop; change the category and the answer voice.

**Explicitly not a kill criterion:** revenue in weeks 1–10. The ₹19 pack exists to validate that UPI payment *works*, not to fund anything. Judging Week 10 on revenue would kill every consumer product in India.

---

## 9. Four open decisions

Each has a default. Defaults are adopted silently unless overridden — a decision left open is a decision made badly, later, under pressure.

| # | Decision | Options | **Default** | Why |
| --- | --- | --- | --- | --- |
| 1 | **Domain & script policy** | `anvik.ai` vs `anvik.in` / `.bharat`; Devanagari-only domain vs Latin | **`anvik.ai`, Latin-script URL, Devanagari slugs transliterated to ASCII** | `.ai` is short and available; Devanagari URLs (`xn--` punycode) break on paste into WhatsApp and render as gibberish in previews, which destroys the §2.4 share loop. Slugs stay readable-ASCII; all *on-page* text is Devanagari. |
| 2 | **Default model** | Gemini 2.5 Flash / Gemini 3.1 Flash-Lite / GPT-5 Mini / Haiku 4.5 | **Gemini 2.5 Flash**, with Flash-Lite evaluated in Week 1 | Cheapest credible quality at ₹0.115/answer, 1M context (irrelevant here but free), and Google's Indic coverage is the strongest of the three labs. **Decided by Week 1 measurement, not by this table** — the table records the prior, the harness records the truth. Haiku is excluded on cost (§7.2). |
| 3 | **PSP** | Razorpay / Cashfree / PhonePe Business | **Razorpay**, Cashfree as fallback | Best UPI-intent support and the most complete webhook documentation. Cashfree is kept as a documented fallback because a single PSP is a single point of failure on the only revenue path, and because its settlement terms sometimes beat Razorpay's. Integration is written behind an interface so switching is a config change, not a rewrite. |
| 4 | **Auth for claimed history** | Email magic link / Phone OTP / Both | **Phone OTP**, email as a later addition | Ramesh has a phone number and may not use email. OTP costs ₹0.15–0.25 per send, which is affordable at beta volume and must be rate-limited hard — it is the one place in the product where an attacker can spend real money without spending model tokens. |

---

## 10. Explicitly out of scope for ten weeks

Listed so that each is a decision rather than an omission:

- Voice input and voice output (highest-demand deferral; revisit Week 10)
- Native Android app
- Multi-turn conversation and session memory
- RAG / vector search (§5.4 — revisit Week 10 with data)
- Dark mode
- Image input (photo of a form) — strong candidate, but it changes the cost model and the moderation surface simultaneously
- Languages other than Hindi, Hinglish and English
- Offline mode
- Any A/B testing framework
- Any paid acquisition

---

## Appendix A — Verification sources

Everything quantitative in this document was checked on 21 November 2026 rather than recalled.

- **Kautilya / Anvikshiki** — *Arthashastra* I.2, "lamp of all the sciences"; root √īkṣ; Vatsyayana's *Nyaya-Bhashya* definition. [lib.education](https://www.lib.education/post/anvikshiki-in-arthashastra-kautilyan-perspective-of-economy-and-philosophy), [APA blog on Ānvīkṣikī](http://blog.apaonline.org/2016/03/23/whose-philosophy-lost-its-way-post-2-of-3/), [hindu-blog.com](https://www.hindu-blog.com/2025/12/anvikshiki.html)
- **Model pricing, Nov 2026** — Gemini 2.5 Flash $0.30/$2.50, cached $0.03; Flash-Lite $0.25/$1.50; Haiku 4.5 $1.00/$5.00, cached $0.10; GPT-5 Mini $0.25/$2.00; GPT-4.1 Mini $0.40/$1.60. [tickerr.ai](https://tickerr.ai/pricing/gemini/gemini-2-5-flash), [tutorsbot Gemini pricing](https://tutorsbot.com/blog/gemini-api-pricing-2026-per-million-tokens), [kunalganglani.com](https://www.kunalganglani.com/llm-prices/claude-haiku-4.5)
- **USD/INR** — ₹93.4–95.1 through November 2026; planning rate ₹95. [currencynews.co.uk](https://www.currencynews.co.uk/rates-history/dollar-to-rupee_usdinr)
- **Devanagari token fertility** — Hindi 1.65–2.67 tokens/word vs English 1.23; independent measurement 1.89 vs 1.16; ~480 tokens/1,000 chars vs ~250 for English. [productgrowth.in](https://productgrowth.in/insights/ai-ml/hindi-tamil-tokens-per-word-cost/), [memx.app](https://memx.app/blog/multilingual-llm-failures-hindi-arabic-classifiers/), [costhawk.ai](https://costhawk.ai/glossary/tokenization)
- **Contrast ratios in §3.3** — computed from WCAG 2.x relative-luminance formula against `#FAF7F2`.
- **Helpline numbers** — Tele-MANAS 14416, iCall 9152987821, emergency 108. To be re-verified in Week 6 before they ship in a refusal path.

## Appendix B — What is deliberately *not* verified

So no one mistakes confidence for evidence later:

- **The reference set** behind the §3.6 checklist was, until 21 November 2026, known only from the brief's description. Two screenshots are now in hand and are analysed element by element in §3.7: Google AI Studio's Build screen and Claude's sign-in. Checklist items attributable to those two are evidence-based. Items from the brief's wider set that these two do not exhibit — bento grids, glassmorphism, dark-mode-with-neon — remain unverified against sources nobody in this session has seen. The **no-photograph** rule is now doubly grounded: observed as Claude's strongest single signal, and independently correct for a text product on a 4G connection (§3.6).
- **The four CafeCaption patterns** in §5.3 are unverified prior art (§0.2). Each is specified from first principles here.
- **Ramesh** (§2.5) is a constructed persona, not research. Week 8 replaces him with 25 real people, and everything in §2 and §4 should be considered provisional until then.
- **Answer-quality assumptions** for Hindi on Flash-class models are untested. Week 1 and Week 4 test them, and Week 4's human review is the one that matters.
