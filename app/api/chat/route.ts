/**
 * /api/chat — the one answer path: validate → key → quota → Gemini → stream.
 *
 * Every answer comes live from Gemini — never from a corpus, a cache or a
 * template (a dedicated test enforces that this route imports no corpus).
 *
 * Pipeline:
 *   1. parse + strictly validate the conversation (max 4,000 chars per
 *      message, max 40 messages, last turn must be a user turn)
 *   2. screen for prompt-injection attempts (key/prompt exfiltration) — blocked
 *      requests are refused BEFORE any paid call
 *   3. strip secrets from the history (keys, phones, Aadhaar, card numbers)
 *   4. resolve the key: valid user key wins, else the server key
 *   5. per-IP rate limit (1 request / 2s, 60 / minute)
 *   6. entitlements (server key only): paid plans (pack/daily/yearly)
 *      enforced against the server-side ledger, keyed by device. Free
 *      falls back to 10/day per IP (counted in Supabase only after a
 *      successful stream — never on a failed request). Own keys bypass.
 *   7. stream tokens immediately; fallback across gemini-2.5-flash →
 *      2.0-flash → 2.0-flash-lite on 404/429/500 (retried 1s/2s first)
 *   8. persist every exchange (chat + user message + answer with model_used)
 *      best-effort — a Supabase outage never breaks the answer
 *
 * Response contract (the locked UI reads this exact shape):
 *   - 200 streams raw UTF-8 text chunks; when the client asks for
 *     `text/event-stream` the same tokens arrive as SSE frames, one
 *     `data: {"t":"tok","s":"…"}` per chunk, plus `meta` and `done` frames
 *   - non-2xx returns JSON `{ error, detail?, code }`
 */

import { modes, type ModeId } from "@/lib/prompts";
import { serverKey } from "@/lib/provider";
import { CHAT_MAX_TOKENS, CODE_MAX_TOKENS, MAX_TEMPERATURE, PAID_MAX_TOKENS } from "@/lib/credit";
import { memoryInstruction, type Memory } from "@/lib/learning";
import {
  openGeminiStreamWithFallback,
  type GeminiTurn,
  type SearchMetaCapture,
} from "@/lib/gemini";
import {
  normalizeSearchMode,
  normalizeSources,
  normalizeQueries,
  shouldAutoSearch,
  type SearchStatus,
} from "@/lib/search";
import { buildSearchFreshnessInstruction } from "@/lib/search-grounding";
import { buildExternalSearchContext, searchExternalWeb, type ExternalSearchResult } from "@/lib/search-providers";
import { sanitizeTurns, buildGeminiContents } from "@/lib/history";
import { safeKeyLog, scanHistory, stripSecrets } from "@/lib/security";
import type { PlanId } from "@/lib/plans";

import { recordChatExchange } from "@/lib/chat-record";
import { getVerifiedUserIfPresent } from "@/lib/session";
import { beginMeteredRequest } from "@/lib/ai-gateway";
import { logRouteEvent } from "@/lib/observability";

export const runtime = "edge";
export const maxDuration = 30;

const validModes = new Set<string>(modes.map(({ id }) => id));
const MIN_SPACING_MS = 2_000;
const PER_MINUTE = 60;
const STREAM_ERROR_MESSAGE = "ANVIK lost the connection before finishing. Please try again.";

const modeInstructions: Record<ModeId, string> = {
  fast: "Keep answers concise and prioritize the quickest useful response.",
  smart: "Think carefully and provide a clear, accurate, well-reasoned answer.",
  creative: "Explore fresh angles and expressive ideas while staying relevant to the question.",
  coder: "Be precise about code, include clean runnable examples, and explain key decisions clearly.",
};

const SYSTEM = [
  "You are ANVIK, a sharp, warm, and deeply knowledgeable personal AI assistant.",
  "Always answer the user's exact question directly on its own topic. Never switch topics.",
  "Use clean Markdown when it improves readability (headings, bullet lists, fenced code blocks).",
  "Answer in the same language the user wrote in (English, Devanagari Hindi, or Roman Hinglish).",
  "Never claim to have performed external actions or invent links, phone numbers, or statistics.",
  "Identity: ANVIK AI was created and engineered by Areeb, an AI Engineer. If asked who made, created, built, developed you, or who your creator/founder is, clearly and confidently state that you were created and engineered by Areeb, an AI Engineer. Never claim to be made by Google, OpenAI, or Gemini.",
].join(" ");

function readMemory(input: unknown): Memory | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Partial<Memory>;
  const lang = raw.lang === "hi" || raw.lang === "hi-Latn" ? raw.lang : "en";
  const style = raw.style === "detailed" || raw.style === "coder" ? raw.style : "short";
  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 40) : "";
  if (!name && lang === "en" && style === "short") return null;
  return { name, lang, style, updatedAt: Date.now() };
}

function sseFrame(payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send a valid JSON body with a messages array." }, { status: 400 });
  }

  if (!body || typeof body !== "object" || !("messages" in body)) {
    return Response.json({ error: "A conversation is required." }, { status: 400 });
  }

  const { messages, mode, temperature, memory, search: rawSearch, deepSearch } = body as {
    messages: unknown;
    mode?: unknown;
    temperature?: unknown;
    memory?: unknown;
    search?: unknown;
    deepSearch?: unknown;
  };

  // 1. Strict validation + history normalization.
  const sanitized = sanitizeTurns(messages);
  if (!sanitized.ok) {
    return Response.json({ error: sanitized.error }, { status: 400 });
  }
  const safeMessages = sanitized.turns;

  // 2. Prompt-injection screening — before any key or paid call.
  const injection = scanHistory(safeMessages);
  if (injection.blocked) {
    console.warn(`injection blocked: ${injection.reason ?? "unknown"}`);
    return Response.json(
      {
        error: "That request is not something ANVIK can answer. Ask about your own problem instead of trying to extract ANVIK internals.",
        detail: "Prompt injection refused.",
        code: "injection_blocked",
      },
      { status: 400 },
    );
  }

  // 3. Strip secrets — keys, phones, Aadhaar, card numbers must never reach
  //    the model or the logs.
  const redactedMessages = safeMessages.map((turn) => ({
    ...turn,
    content: stripSecrets(turn.content).text,
  }));

  // 4. Resolve identity — a verified account, or a guest.
  //
  //    `getVerifiedUserIfPresent` never throws and never trusts a header: a
  //    bad/absent token simply means "guest". Chat is the one AI surface the
  //    product promises without an account, so the guest branch is real here and
  //    everywhere else refuses with `unauthenticated`.
  const caller = await getVerifiedUserIfPresent(request).catch(() => null);
  const auth = caller ? { user: caller } : null;

  // Build Gemini contents BEFORE metering so an empty/invalid conversation never consumes a credit or guest answer.
  const contents: GeminiTurn[] = buildGeminiContents(redactedMessages);
  if (contents.length === 0) {
    return Response.json({ error: "Prompt cannot be empty. Write a message and try again." }, { status: 400 });
  }

  // 5. The single metered entrance: key choice → account standing → rate limit
  //    → exactly one reservation (account credit, or one of the ten free guest
  //    answers). This route used to duplicate that chain inline, which is how
  //    /api/chat and the other five AI routes drifted apart.
  const gateway = await beginMeteredRequest(request, "chat", caller);
  if (!gateway.ok) return gateway.response;

  const { key, userId, guest, remaining } = gateway.session;
  const settleSession = gateway.session.settle;

  if (!guest && key === serverKey()) {
    console.warn(`chat using ${safeKeyLog(key)}`);
  }

  // Plan label for the response, mirroring the credit the gateway reserved.
  const paidPlan: PlanId | null = gateway.session.metered && !guest ? (gateway.session.plan as PlanId) : null;

  const selectedMode = (validModes.has(String(mode)) ? mode : "smart") as ModeId;
  const remembered = readMemory(memory);
  const systemInstruction = [
    SYSTEM,
    modeInstructions[selectedMode],
    remembered ? memoryInstruction(remembered) : "",
    buildSearchFreshnessInstruction(),
  ]
    .filter(Boolean)
    .join(" ");

  // Paid plans get longer AI responses (both code and general answers); the
  // free tier stays at the default cap.
  const tokenCap = paidPlan
    ? PAID_MAX_TOKENS
    : selectedMode === "fast"
      ? 1024
      : selectedMode === "coder"
        ? CODE_MAX_TOKENS
        : CHAT_MAX_TOKENS;
  const requested = typeof temperature === "number" ? temperature : 0.65;
  const safeTemperature = Math.max(0, Math.min(MAX_TEMPERATURE, requested));

  const wantSSE = (request.headers.get("accept") ?? "").includes("text/event-stream");

  // Exa and Tavily are optional server-side providers. Their content is
  // untrusted evidence only; Google Search grounding remains the fallback.
  // Fast mode never pays for search unless the caller explicitly asks for it:
  // this keeps the "fast" promise (lowest latency) instead of spending 1-3
  // extra round trips on grounding.
  const searchMode = (selectedMode === "fast" && typeof deepSearch !== "boolean")
    ? "off"
    : (typeof deepSearch === "boolean"
        ? (deepSearch ? "on" : "off")
        : normalizeSearchMode(rawSearch));
  const lastUser = [...redactedMessages].reverse().find((turn) => turn.role === "user");
  const searchQuery = lastUser?.content ?? "";
  const searchNeeded = searchMode === "on" || (searchMode === "auto" && shouldAutoSearch(searchQuery));
  let externalSearchResult: ExternalSearchResult | null = null;
  if (searchNeeded) {
    try { externalSearchResult = await searchExternalWeb(searchQuery, request.signal); }
    catch { externalSearchResult = {query:searchQuery,sources:[],configuredProviders:[],usedProviders:[]}; }
  }
  const hasExternalSources = (externalSearchResult?.sources.length ?? 0) > 0;
  let searchMetaCapture: SearchMetaCapture | undefined;
  let searchStatus: SearchStatus = "off";
  let externalSearchUsed = false;
  let streamInterrupted = false;
  let streamHadText = false;
  const baseStreamOptions = {
    apiKey: key,
    contents,
    temperature: safeTemperature,
    maxOutputTokens: tokenCap,
    signal: request.signal,
    retryDelaysMs: selectedMode === "fast" ? [500] : undefined,
    onStreamInterrupted: (emittedText: boolean) => {
      streamInterrupted = true;
      streamHadText = emittedText;
    },
  };
  let result;
  const isTerminalProviderError = (candidate: {error:{code:string;status:number}}) =>
    candidate.error.code === "invalid_key" || candidate.error.code === "bad_format" ||
    candidate.error.status === 400 || candidate.error.status === 401 || candidate.error.status === 403;
  const returnTerminalError = (candidate: {error:{message:string;code:string;status:number}}) => {
    void settleSession("failure");
    return Response.json({error:candidate.error.message,detail:candidate.error.message,code:candidate.error.code},{status:candidate.error.status});
  };
  if (searchNeeded && hasExternalSources && externalSearchResult) {
    const evidenceInstruction = [systemInstruction,buildExternalSearchContext(externalSearchResult.sources)].join("\n\n");
    result = await openGeminiStreamWithFallback({...baseStreamOptions,systemInstruction:evidenceInstruction});
    if (result.ok) { searchStatus="on"; externalSearchUsed=true; }
    else {
      if (isTerminalProviderError(result)) return returnTerminalError(result);
      searchMetaCapture={queries:[],sources:[],sawGrounding:false};
      const grounded=await openGeminiStreamWithFallback({...baseStreamOptions,systemInstruction,
        googleSearch:true,searchMetaCapture});
      if (grounded.ok) { result=grounded; searchStatus="on"; }
      else {
        if (isTerminalProviderError(grounded)) return returnTerminalError(grounded);
        result=await openGeminiStreamWithFallback({...baseStreamOptions,systemInstruction});
        searchStatus="unavailable";
      }
    }
  } else if (searchNeeded) {
    searchMetaCapture={queries:[],sources:[],sawGrounding:false};
    const grounded=await openGeminiStreamWithFallback({...baseStreamOptions,systemInstruction,
      googleSearch:true,searchMetaCapture});
    if (grounded.ok) { result=grounded; searchStatus="on"; }
    else {
      if (isTerminalProviderError(grounded)) return returnTerminalError(grounded);
      result=await openGeminiStreamWithFallback({...baseStreamOptions,systemInstruction});
      searchStatus="unavailable";
    }
  } else {
    result=await openGeminiStreamWithFallback({...baseStreamOptions,systemInstruction});
    searchStatus="off";
  }

  try {
    if (!result.ok) {
      await settleSession("failure");
      logRouteEvent({
        route: "chat",
        outcome: "error",
        status: result.error.status,
        latencyMs: Date.now() - startedAt,
        errorCode: result.error.code,
      });
      return Response.json(
        { error: result.error.message, detail: result.error.message, code: result.error.code },
        { status: result.error.status },
      );
    }

    const model = result.model;
    logRouteEvent({ route: "chat", outcome: "success", status: 200, latencyMs: Date.now() - startedAt, model });
    const upstreamReader = result.stream.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let answer = "";
        let completed = false;
        try {
          if (wantSSE) {
            // First frame is the meta frame, so SSE clients can identify the
            // model from the very first packet on the wire.
            controller.enqueue(
              encoder.encode(sseFrame({ t: "meta", model, source: "gemini", search: searchStatus })),
            );
          }
          for (;;) {
            const { done, value } = await upstreamReader.read();
            if (done) break;
            if (wantSSE) {
              const text = decoder.decode(value, { stream: true });
              if (text) {
                answer += text;
                controller.enqueue(
                  encoder.encode(sseFrame({ t: "tok", s: text })),
                );
              }
            } else {
              answer += decoder.decode(value, { stream: true });
              controller.enqueue(value);
            }
          }
          // Flush any trailing multi-byte sequences.
          const rest = decoder.decode();
          if (rest) {
            answer += rest;
            if (wantSSE) {
              controller.enqueue(encoder.encode(sseFrame({ t: "tok", s: rest })));
            } else {
              controller.enqueue(encoder.encode(rest));
            }
          }

          // The upstream body can fail after headers were accepted. Refund the
          // reservation and give SSE clients one friendly terminal frame —
          // never a raw reader error or a silent truncation.
          if (streamInterrupted) {
            await settleSession("failure", { model });
            if (wantSSE) {
              try {
                controller.enqueue(
                  encoder.encode(sseFrame({ t: "err", message: STREAM_ERROR_MESSAGE })),
                );
              } catch {
                /* client already disconnected */
              }
            } else if (streamHadText && answer.trim()) {
              try {
                controller.enqueue(encoder.encode(`\n\n_${STREAM_ERROR_MESSAGE}_`));
              } catch {
                /* client already disconnected */
              }
            }
            completed = false;
            controller.close();
            return;
          }

          if (wantSSE) {
            // Done frame carries the honest search result: the queries the
            // model ran and the sources it cited — only what Gemini actually
            // returned, never fabricated.
            //
            // Honesty check: a grounded request that produced no
            // groundingMetadata at all means the model did not use the web —
            // report it as unavailable rather than pretend the answer was
            // verified through search.
            const groundedMetaSeen = searchMetaCapture?.sawGrounding ?? false;
            const externalSearchSucceeded = externalSearchUsed && !!externalSearchResult;
            const finalSearchStatus: SearchStatus = !searchNeeded ? "off"
              : externalSearchSucceeded || (searchStatus === "on" && groundedMetaSeen) ? "on" : "unavailable";
            const sources = externalSearchSucceeded ? (externalSearchResult?.sources ?? [])
              : searchMetaCapture && groundedMetaSeen ? normalizeSources(searchMetaCapture.sources) : [];
            const queries = externalSearchSucceeded ? normalizeQueries([externalSearchResult?.query ?? searchQuery])
              : searchMetaCapture && groundedMetaSeen ? normalizeQueries(searchMetaCapture.queries) : [];
            controller.enqueue(
              encoder.encode(
                sseFrame({ t: "done", model, search: finalSearchStatus, sources, queries }),
              ),
            );
          }
          completed = true;

          // 8. Settle only after a full, successful stream: one atomic
          //    confirm-or-refund, so an interrupted answer never eats a credit.
          await settleSession("success", { model });

          // Persist every exchange (user message + answer + model). Best-effort:
          // a Supabase outage must never break the answer, so failures are
          // swallowed; the write is still awaited so it completes before the
          // response closes.
          const finalUser = redactedMessages[redactedMessages.length - 1];
          // Guests keep their conversation in the browser only; only a signed-in
          // owner has a row to write.
          if (completed && answer.trim() && finalUser && userId) {
            try {
              await recordChatExchange({
                // ownership: always the VERIFIED account id.
                //
                // This used to write either the verified user id OR the
                // client-supplied x-anvik-device value into chats.user_id. The
                // RLS read policy is `user_id = auth.uid()::text`, so rows
                // written with a device id were invisible to their own owner —
                // and a caller could forge the device header to plant rows in
                // someone else's history. Ownership is only ever the verified
                // account id, and a guest (userId null) is not persisted at all
                // — there is no owner to file the row under.
                userId: userId as string,
                userMessage: finalUser.content,
                answer,
                model,
              });
            } catch {
              /* best-effort persistence */
            }
          }
          controller.close();
        } catch (error) {
          await settleSession("failure", { model });
          if (wantSSE && !(error instanceof Error && error.name === "AbortError")) {
            // Give the client a terminal frame it can render as a friendly
            // message. If the client is already gone, fall back to erroring
            // the controller so the stream is not left open.
            try {
              controller.enqueue(
                encoder.encode(sseFrame({ t: "err", message: STREAM_ERROR_MESSAGE })),
              );
              controller.close();
            } catch {
              try {
                controller.error(error);
              } catch {
                /* already closed */
              }
            }
          } else {
            controller.error(error);
          }
        } finally {
          upstreamReader.releaseLock();
        }
      },
      async cancel(reason) {
        void upstreamReader.cancel(reason);
        // Client hung up → the user should not pay for a partial answer.
        await settleSession("aborted", { model });
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": wantSSE ? "text/event-stream; charset=utf-8" : "text/plain; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Content-Type-Options": "nosniff",
        "X-ANVIK-SOURCE": "gemini",
        "X-ANVIK-MODEL": model,
        "X-ANVIK-LABEL": "ANVIK",
        "X-ANVIK-SEARCH-STATUS": searchStatus,
      },
    });
  } catch (err) {
    await settleSession(err instanceof Error && err.name === "AbortError" ? "aborted" : "failure");
    if (err instanceof Error && err.name === "AbortError") {
      return new Response(null, { status: 499 });
    }
    return Response.json(
      {
        error: "ANVIK couldn't start that answer. Please try again.",
        detail: "ANVIK couldn't start that answer. Please try again.",
        code: "network",
      },
      { status: 503 },
    );
  }
}
