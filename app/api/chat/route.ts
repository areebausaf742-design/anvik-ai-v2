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
  isValidGeminiKeyFormat,
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
import { buildExternalSearchContext, searchExternalWeb, type ExternalSearchResult } from "@/lib/search-providers";
import { sanitizeTurns, buildGeminiContents } from "@/lib/history";
import { hashIp, safeKeyLog, scanHistory, stripSecrets } from "@/lib/security";
import { QuotaStore, supabaseQuotaHooks } from "@/lib/quota";
import { EntitlementsStore, supabaseEntitlementHooks } from "@/lib/entitlements";
import type { PlanId } from "@/lib/plans";
import { sbRpc, sbSelect, sbUpsert } from "@/lib/supabase";
import { recordChatExchange } from "@/lib/chat-record";
import { clientIp, allowDistributed } from "@/lib/rate-limit";
import { requireUser, type VerifiedUser } from "@/lib/session";
import {
  ensureEntitlement,
  effectivePlan,
  reserveCredit,
  settleCredit,
} from "@/lib/credits";
import { planById } from "@/lib/plans";
import { logRouteEvent } from "@/lib/observability";
import { accountBlockedResponse, readAccountStanding } from "@/lib/account-status";

export const maxDuration = 60;

const validModes = new Set<string>(modes.map(({ id }) => id));
const MIN_SPACING_MS = 2_000;
const PER_MINUTE = 60;

/**
 * The free-tier counter is incremented by the `consume_quota` Postgres function,
 * not by a read-then-write. The old upsert had no conflict target, so PostgREST
 * arbitrated on the primary key and every second write raised 23505 — the
 * counter was frozen at 1 for every visitor, every day.
 */
const quota = new QuotaStore(
  supabaseQuotaHooks(
    sbSelect,
    (table, rows, conflict) => sbUpsert(table, rows, conflict),
    async (ipHash, day) => {
      const next = await sbRpc<number | null>("consume_quota", {
        p_ip_hash: ipHash,
        p_day: day,
      });
      return typeof next === "number" && Number.isFinite(next) ? next : null;
    },
  ),
);
const entitlements = new EntitlementsStore(supabaseEntitlementHooks(sbSelect, (rows) => sbUpsert("entitlements", rows, "device_id")));

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

type Reservation =
  | { kind: "free"; key: string }
  | { kind: "entitlement"; deviceId: string }
  | { kind: "user"; userId: string; reference: string };

/**
 * Close a reservation exactly once, on every exit path.
 *
 * The previous code called `recordUsage` on success and `refundCredit` on
 * failure as two separate best-effort RPCs and swallowed both errors, so a
 * stream killed between them left the credit spent forever. `settle_credit`
 * confirms-or-refunds under a row lock and is idempotent per reference; the
 * every-10-minutes sweeper catches whatever still slips through.
 */
type ReservationOutcome = "success" | "failure" | "aborted";

async function settleReservation(
  reservation: Reservation | undefined,
  outcome: ReservationOutcome,
  model: string,
  feature: string,
): Promise<void> {
  if (!reservation) return;
  try {
    if (reservation.kind === "free") {
      if (outcome === "success") await quota.confirm(reservation.key);
      else quota.cancel(reservation.key);
      return;
    }
    if (reservation.kind === "entitlement") {
      if (outcome === "success") await entitlements.confirm(reservation.deviceId);
      else entitlements.cancel(reservation.deviceId);
      return;
    }
    await settleCredit({
      userId: reservation.userId,
      reference: reservation.reference,
      outcome,
      model,
      feature,
    });
  } catch {
    // Persistence is best-effort by contract — the answer already streamed.
    // A missing settlement is recovered by reclaim_stale_reservations().
  }
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

  // 4. Verify the Supabase user BEFORE resolving the server key. The old order
  //    answered a guest with `no_server_key` when the deployment had no key,
  //    which both leaked a configuration fact and made the client render the
  //    wrong error ("connect your own key") instead of "sign in".
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;

  // 5. Key resolution — the user's own key wins unconditionally.
  const suppliedClientKey = request.headers.get("x-google-generative-ai-api-key")?.trim();
  if (suppliedClientKey && !isValidGeminiKeyFormat(suppliedClientKey)) {
    return Response.json(
      {
        error: "Key looks wrong. Paste a new key from aistudio.google.com",
        code: "bad_format",
      },
      { status: 400 },
    );
  }
  const validClientKey = isValidGeminiKeyFormat(suppliedClientKey) ? suppliedClientKey : undefined;
  const configuredServerKey = serverKey();
  const key = validClientKey || configuredServerKey;
  if (!key) {
    return Response.json(
      { error: "ANVIK free key is not set. Connect your own key to continue.", code: "no_server_key" },
      { status: 401 },
    );
  }
  if (!validClientKey) {
    console.warn(`chat using ${safeKeyLog(key)}`);
  }

  // 6. Account standing — a suspended or closed account is refused before it
  //    can spend a credit (the status column used to be decorative).
  const standing = await readAccountStanding(auth.user.id);
  if (!standing.allowed) return accountBlockedResponse(standing);

  // 7. Distributed rate limit — keyed only by this verified user id.
  // Never trusts client-supplied identity headers (audit: H-1/H-8).
  const ip = clientIp(request);
  const verifiedUserForLimit = auth.user;
  const pace = await allowDistributed(request, "chat", PER_MINUTE, 0, {
    verifiedUserId: verifiedUserForLimit?.id ?? null,
    spacingMs: MIN_SPACING_MS,
  });
  if (!pace.allowed) {
    const retryAfter = Math.max(1, Math.ceil(pace.retryAfterMs / 1000));
    logRouteEvent({
      route: "chat",
      outcome: "rate_limited",
      status: 429,
      latencyMs: Date.now() - startedAt,
      rateLimitSource: pace.source,
      errorCode: "rate_limit",
    });
    return Response.json(
      {
        error: "Too many requests. Please wait a few seconds and try again.",
        code: "rate_limit",
      },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  // 7. Plan entitlement — server key only. Own keys are unlimited by design.
  // Verified accounts using the server key are governed by the existing
  // per-user credit system (atomic RPC, IST-day reset, pack fallback, and
  // idempotency by request reference).
  const rawDeviceId = (request.headers.get("x-anvik-device") ?? "").trim().slice(0, 128);
  const deviceId = rawDeviceId || "anonymous";
  let reservation: Reservation | undefined;
  let paidPlan: PlanId | null = null;
  let verifiedUser: VerifiedUser | null = null;

  if (!validClientKey) {
    // Reuse the verified identity resolved for the rate limiter — one
    // Supabase round-trip per request, never a second one.
    verifiedUser = verifiedUserForLimit;
    if (verifiedUser) {
      // --- per-user credit path (the multi-user system) ---
      const reference = (request.headers.get("x-anvik-request-id") ?? "").trim().slice(0, 160) || crypto.randomUUID();
      const entitlement = await ensureEntitlement(verifiedUser.id).catch(() => null);
      const effective = effectivePlan(entitlement);
      const dailyLimit = effective.limit;
      const result = await reserveCredit(verifiedUser.id, dailyLimit, reference);
      if (!result.ok) {
        const isDuplicate = result.reason === "duplicate_request";
        return Response.json(
          {
            error: isDuplicate
              ? "This request was already answered. Ask again to continue."
              : "You've reached your allowance. Connect your own key for unlimited, or upgrade at ANVIK pricing.",
            detail: isDuplicate
              ? "This request was already answered."
              : "You've reached your allowance. Connect your own key for unlimited, or upgrade at ANVIK pricing.",
            code: isDuplicate ? "duplicate_request" : (effective.plan === "free" ? "free_limit_reached" : "plan_limit_reached"),
            plan: effective.plan,
            remaining: 0,
          },
          { status: 429 },
        );
      }
      reservation = { kind: "user", userId: verifiedUser.id, reference };
      const spec = planById(effective.plan);
      paidPlan = effective.active && spec.priceInr > 0 ? spec.id : null;
    } else {
      // --- anonymous path (unchanged) ---
      const outcome = rawDeviceId ? await entitlements.reserve(rawDeviceId) : ({ kind: "free" } as const);
      if (outcome.kind === "reserved") {
        reservation = { kind: "entitlement", deviceId: rawDeviceId };
        paidPlan = outcome.plan;
      } else {
        // No usable entitlement — none, expired, or exhausted. Fall back to
        // the free per-IP quota so a paid user never ends below Free's
        // allowance: the paid plan is the top-up, Free is the floor.
        const ipHash = hashIp(ip);
        const check = await quota.checkAndReserve(ipHash);
        if (!check.ok) {
          const exhaustedPaid = outcome.kind === "blocked";
          return Response.json(
            {
              error: exhaustedPaid
                ? "You've reached your plan limit. Connect your own key to continue unlimited, or upgrade at ANVIK pricing."
                : "Free limit reached. Connect your own key to continue unlimited.",
              detail: exhaustedPaid
                ? "You've reached your plan limit. Connect your own key to continue unlimited, or upgrade at ANVIK pricing."
                : "Free limit reached. Connect your own key to continue unlimited.",
              code: exhaustedPaid ? "plan_limit_reached" : "free_limit_reached",
              ...(outcome.kind === "blocked" ? { plan: outcome.plan } : {}),
              remaining: 0,
            },
            { status: 429 },
          );
        }
        reservation = { kind: "free", key: check.reservationKey };
      }
    }
  }

  const selectedMode = (validModes.has(String(mode)) ? mode : "smart") as ModeId;
  const remembered = readMemory(memory);
  const systemInstruction = [
    SYSTEM,
    modeInstructions[selectedMode],
    remembered ? memoryInstruction(remembered) : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Paid plans get longer AI responses (both code and general answers); the
  // free tier stays at the default cap.
  const tokenCap = paidPlan ? PAID_MAX_TOKENS : selectedMode === "coder" ? CODE_MAX_TOKENS : CHAT_MAX_TOKENS;
  const requested = typeof temperature === "number" ? temperature : 0.65;
  const safeTemperature = Math.max(0, Math.min(MAX_TEMPERATURE, requested));

  // 7. History → Gemini contents.
  const contents: GeminiTurn[] = buildGeminiContents(redactedMessages);
  if (contents.length === 0) {
    return Response.json(
      { error: "Prompt cannot be empty. Write a message and try again." },
      { status: 400 },
    );
  }

  const wantSSE = (request.headers.get("accept") ?? "").includes("text/event-stream");

  // Exa and Tavily are optional server-side providers. Their content is
  // untrusted evidence only; Google Search grounding remains the fallback.
  const searchMode = typeof deepSearch === "boolean"
    ? (deepSearch ? "on" : "off")
    : normalizeSearchMode(rawSearch);
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
  let result;
  const isTerminalProviderError = (candidate: {error:{code:string;status:number}}) =>
    candidate.error.code === "invalid_key" || candidate.error.code === "bad_format" ||
    candidate.error.status === 400 || candidate.error.status === 401 || candidate.error.status === 403;
  const returnTerminalError = (candidate: {error:{message:string;code:string;status:number}}) => {
    void settleReservation(reservation, "failure", "", "chat");
    return Response.json({error:candidate.error.message,detail:candidate.error.message,code:candidate.error.code},{status:candidate.error.status});
  };
  if (searchNeeded && hasExternalSources && externalSearchResult) {
    const evidenceInstruction = [systemInstruction,buildExternalSearchContext(externalSearchResult.sources)].join("\n\n");
    result = await openGeminiStreamWithFallback({apiKey:key,systemInstruction:evidenceInstruction,contents,
      temperature:safeTemperature,maxOutputTokens:tokenCap,signal:request.signal});
    if (result.ok) { searchStatus="on"; externalSearchUsed=true; }
    else {
      if (isTerminalProviderError(result)) return returnTerminalError(result);
      searchMetaCapture={queries:[],sources:[],sawGrounding:false};
      const grounded=await openGeminiStreamWithFallback({apiKey:key,systemInstruction,contents,temperature:safeTemperature,
        maxOutputTokens:tokenCap,signal:request.signal,googleSearch:true,searchMetaCapture});
      if (grounded.ok) { result=grounded; searchStatus="on"; }
      else {
        if (isTerminalProviderError(grounded)) return returnTerminalError(grounded);
        result=await openGeminiStreamWithFallback({apiKey:key,systemInstruction,contents,temperature:safeTemperature,
          maxOutputTokens:tokenCap,signal:request.signal});
        searchStatus="unavailable";
      }
    }
  } else if (searchNeeded) {
    searchMetaCapture={queries:[],sources:[],sawGrounding:false};
    const grounded=await openGeminiStreamWithFallback({apiKey:key,systemInstruction,contents,temperature:safeTemperature,
      maxOutputTokens:tokenCap,signal:request.signal,googleSearch:true,searchMetaCapture});
    if (grounded.ok) { result=grounded; searchStatus="on"; }
    else {
      if (isTerminalProviderError(grounded)) return returnTerminalError(grounded);
      result=await openGeminiStreamWithFallback({apiKey:key,systemInstruction,contents,temperature:safeTemperature,
        maxOutputTokens:tokenCap,signal:request.signal});
      searchStatus="unavailable";
    }
  } else {
    result=await openGeminiStreamWithFallback({apiKey:key,systemInstruction,contents,temperature:safeTemperature,
      maxOutputTokens:tokenCap,signal:request.signal});
    searchStatus="off";
  }

  try {
    if (!result.ok) {
      await settleReservation(reservation, "failure", "", "chat");
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
          if (wantSSE) {
            if (rest) {
              answer += rest;
              controller.enqueue(encoder.encode(sseFrame({ t: "tok", s: rest })));
            }
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
          } else {
            answer += rest;
          }
          completed = true;

          // 8. Settle only after a full, successful stream: one atomic
          //    confirm-or-refund, so an interrupted answer never eats a credit.
          await settleReservation(reservation, "success", model, "chat");

          // Persist every exchange (user message + answer + model). Best-effort:
          // a Supabase outage must never break the answer, so failures are
          // swallowed; the write is still awaited so it completes before the
          // response closes.
          const finalUser = redactedMessages[redactedMessages.length - 1];
          if (completed && answer.trim() && finalUser) {
            try {
              await recordChatExchange({
                userId: verifiedUser ? verifiedUser.id : deviceId,
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
          await settleReservation(reservation, "failure", model, "chat");
          controller.error(error);
        } finally {
          upstreamReader.releaseLock();
        }
      },
      async cancel(reason) {
        void upstreamReader.cancel(reason);
        // Client hung up → the user should not pay for a partial answer.
        await settleReservation(reservation, "aborted", model, "chat");
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
    await settleReservation(reservation, err instanceof Error && err.name === "AbortError" ? "aborted" : "failure", "", "chat");
    if (err instanceof Error && err.name === "AbortError") {
      return new Response(null, { status: 499 });
    }
    return Response.json(
      { error: "No internet. Try again", detail: "No internet. Try again", code: "network" },
      { status: 503 },
    );
  }
}
