# Fix log — Gemini for every answer, and the dark redesign

Two changes on top of `c65954c`: the answer pipeline, and the theme.

## 1. Why "what is car?" returned a corpus answer

The old `/api/chat` tried four progressively cheaper sources before the model:

```
local answer → 7-day cache → reviewed corpus (cosine-ish token overlap ≥ 0.8) → Gemini
```

The corpus path scored a question against every `CorpusEntry.questions` variant with
`shared / max(asked, variant)`. That is a **token-overlap ratio, not a topic match**: any short
question that shared a couple of ordinary words with a scheme question could clear 0.8. When it
did, the answer came back as a full reviewed answer to a *different* question, labelled
"From the reviewed answer set - 0 credits".

I reproduced the *shortcut* rather than assert it: running the old `lib/credit.ts` on the five
reference prompts shows the canonical failure directly —

| prompt | old local path | result |
| --- | --- | --- |
| `hii` | `localAnswer` matched | canned English greeting, **Gemini never called** |
| `what is car?` | — | (see note below) |
| `write python code for calculator` | — | — |

Whatever scored 0.8 on "what is car?" in your session, the class of bug is the same and is now
impossible: **there is no scoring code left, and no corpus import in the chat route.** A structural
test fails if either returns.

## 2. The new pipeline

```
message → validate (non-empty, ≤40 turns) → resolve key → daily ceiling
        → gemini-2.0-flash (full conversation, 800 tokens, temp ≤ 0.7)
        → safety check (empty / abuse / fake helpline)
        → Gemini's answer, verbatim
```

Anything that is not an answer is honest:

| situation | response |
| --- | --- |
| no key / malformed key | `401 {"error":"Add valid Gemini key in Settings."}` |
| provider rejects or returns nothing | same 401, after exactly one retry |
| stream stops mid-answer | the partial text plus `_The model stopped mid-answer._`, marked `X-ANVIK-CHECK: partial`, never cached |
| empty prompt | `400` |
| daily ceiling (100/device/day) | `429` with a reset time — still no substitute answer |

### What was deleted

| file | removed |
| --- | --- |
| `lib/credit.ts` | `localAnswer`, `corpusAnswer`, `cacheKey`, `memoryGet/Set`, `prepareHistory`, `estimateTokens`, `creditLabel`, usage counters — everything except the model/token/temperature ceilings |
| `lib/learning.ts` | `findReplay`, `saveAnswer`, `readCacheEntry`, `cacheCount`, the `replays` counter, the `anvik-cache` store |
| `lib/checker.ts` | language check, Markdown repair, link/domain stripping, statistics softening, date flagging, and the one-shot regeneration |
| `app/api/chat/route.ts` | the corpus/cache/local branches, the history summary, `guardedTextResponse` streaming, demo mode in chat |
| UI | "From memory · 0 credits used", "From the reviewed answer set", "Low Use · Unlimited", "Unlimited with cache", "Today: N chats · M from memory", "Smart Mode ON · Saving credits", the Smart Mode toggle |

### Verification (complete, with a stubbed model)

No live Gemini key exists in this environment and `generativelanguage.googleapis.com` is unreachable
from it, so I wired the real route to a local stand-in through `GEMINI_BASE_URL` and ran the exact
five prompts from the brief. The stub's replies are keyed off the prompt text, so a topic mix-up is
visible.

```
── greeting: "hii"                              source: gemini  200   ✓
── car: "what is car?"                          source: gemini  200   ✓
── ai: "what is AI?"                            source: gemini  200   ✓
── calculator code: "write python code for…"    source: gemini  200   ✓
── photosynthesis: "what is photosynthesis?"    source: gemini  200   ✓
5/5 passed — model calls recorded: 5
```

Additional checks against the running build:

- the same prompt twice → **two** model calls (no cache)
- `hii` → reaches the model (no local reply)
- no key → `401 Add valid Gemini key in Settings`
- abuse from the model → refused with a neutral sentence, subject unchanged
- invented helpline `1800-999-8888` → `Call the official helpline listed on the department's page for help.` (only the number changed)
- a normal answer is byte-identical to what the model returned

`npm run verify:chat` re-runs the five prompts against any URL with a real key.

### A bug I introduced and caught

The first version passed the whole `streamText()` result to the buffer instead of `result.textStream`.
A `TextStreamResult` exposes no reader, so every live answer surfaced as a 401. Found by probing the
request path, fixed, and pinned with a test (`the route reads textStream, not the lazy result object`).

## 3. Dark theme

`main` was warm paper (`--paper: #faf7f2`), and no commit in this repo has ever contained `#07070b` —
the "WOW dark from last fix" you referred to is not in this history, so I built it here rather than
restoring it. Tokens now carry the deep-black + violet system:

| token | value |
| --- | --- |
| `--paper` | `#08060c` |
| `--paper-raised` | `#100c18` |
| `--ink` / `--ink-soft` / `--ink-mute` | `#f6f3fb` / `#c6bfd6` / `#9d95b3` |
| accent (`--green`, used as text) | `#8f80ff` |
| accent fill (behind white text) | `#5546c0` |
| glass | `rgba(22,17,34,0.66)` + `backdrop-filter: blur(18px)` |
| orb | violet radial ramp `#f3edff → #c3b0ff → #7d6bff → #4326a8 → #1a0f3d` |

Measured contrast (WCAG 2.1):

| pair | ratio |
| --- | --- |
| ink on paper / raised | 18.37 / 17.59 |
| ink-soft on paper | 11.35 |
| ink-mute on paper / sunken | 7.09 / 7.18 |
| accent as text on paper / raised / wash | 6.43 / 6.16 / 5.65 |
| white on accent fill | 6.95 |
| danger on paper | 8.97 |

Every pair clears 4.5:1. The first attempt did not: white on `#7d6bff` is 3.88, so solid accent
seats moved to `--violet-fill` and the text accent was brightened. The shipped CSS was checked for
zero occurrences of `#faf7f2`, `#f2ede4`, `#fffdfa`, `#e0d8cb`.

Gradient and glass are back by request: the headline `.gradient-text` ramp, a violet-tinted body
backdrop, a glass composer, sidebar, top bar and settings cards, and a violet-tinted orb. The
"Checked" tick keeps a green tint so it still reads as a pass rather than as the accent.

## 4. What PR #7 still guarantees

| guarantee | status |
| --- | --- |
| no 500s | all 13 pages 200, `/nope` 404, `/api/learn` 202, `/api/image` 502 from an unreachable provider (unchanged behaviour), `/api/vision` 400 on an empty body |
| honest 401 | `/api/chat` and `/api/code` both answer `Add valid Gemini key in Settings` |
| real CSS on the six pages | `.narrow`, `.plans`, `.about`, `.pub` rules still applied; only the palette changed |
| Markdown rendering | untouched (`markdown.tsx`) |
| URL-only image gallery | untouched (`creative-studio.tsx`) |
| `lib/corpus.ts` | untouched — `git diff -- lib/corpus.ts` empty |
| vulnerabilities | `npm audit` 0 |
| tests | 14 → 46, all passing |

Tests changed shape because the contract changed: the checker no longer rewrites answers, so the
tests that asserted rewriting are now tests that assert **it does not** (`no rewriting of links,
bold, or numbers`, `the checker never injects a corpus answer`), plus the new static guards in
`tests/route.test.ts`.

## 5. Known limits

- **No key, no answer.** Chat no longer has a demo mode. This is deliberate — demo mode was the
  same failure mode as the corpus shortcut — but it means a fresh checkout without
  `GOOGLE_GENERATIVE_AI_API_KEY` (or a key in Settings) shows the 401 on `/chat` rather than a
  scripted reply. `/api/ask` and `/j/[slug]` still answer from the corpus, as they always have.
- Responses are buffered, not streamed, so the answer appears when the model finishes. This is what
  makes the safety check possible; it is capped at 800 tokens and 25 s.
- `/api/ask` still uses the corpus by design (it is the reviewed public-answer path with its own
  quota and moderation). Only chat was in scope.
- Live Gemini success is verified against a stand-in, not the real endpoint, for the reason above.
  Run `npm run verify:chat -- --key …` to confirm against the real API.
