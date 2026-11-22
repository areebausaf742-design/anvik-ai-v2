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
import { sanitizeTurns, buildGeminiContents } from "@/lib/history";
import { hashIp, safeKeyLog, scanHistory, stripSecrets } from "@/lib/security";
import { QuotaStore, supabaseQuotaHooks } from "@/lib/quota";
import { EntitlementsStore, supabaseEntitlementHooks } from "@/lib/entitlements";
import type { PlanId } from "@/lib/plans";
import { sbSelect, sbUpsert } from "@/lib/supabase";
import { recordChatExchange } from "@/lib/chat-record";
import { clientIp, allowDistributed } from "@/lib/rate-limit";
import { getVerifiedUserIfPresent, type VerifiedUser } from "@/lib/session";
import {
  ensureEntitlement,
  effectivePlan,
  reserveCredit,
  refundCredit,
  recordUsage,
} from "@/lib/credits";
import { planById } from "@/lib/plans";
import { logRouteEvent } from "@/lib/observability";

export const maxDuration = 60;

const validModes = new Set<string>(modes.map(({ id }) => id));
const MIN_SPACING_MS = 2_000;
const PER_MINUTE = 60;

const quota = new QuotaStore(supabaseQuotaHooks(sbSelect, sbUpsert));
const entitlements = new EntitlementsStore(supabaseEntitlementHooks(sbSelect, (rows) => sbUpsert("entitlements", rows)));

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
  | { kind: "user"; userId: string; source: "daily" | "pack"; reference: string };

function cancelReservation(reservation: Reservation | undefined): void {
  if (!reservation) return;
  if (reservation.kind === "free") quota.cancel(reservation.key);
  else if (reservation.kind === "entitlement") entitlements.cancel(reservation.deviceId);
  else void refundCredit(reservation.userId, reservation.source, reservation.reference).catch(() => undefined);
}

async function confirmReservation(
  reservation: Reservation | undefined,
  model: string,
  feature: string,
): Promise<void> {
  if (!reservation) return;
  if (reservation.kind === "free") {
    try {
      await quota.confirm(reservation.key);
    } catch {
      // keep going even if persistence fails
    }
    return;
  }
  if (reservation.kind === "entitlement") {
    try {
      await entitlements.confirm(reservation.deviceId);
    } catch {
      // keep going even if persistence fails
    }
    return;
  }
  try {
    await recordUsage(
      reservation.userId,
      reservation.source,
      reservation.reference,
      model,
      feature,
      null,
      null,
      "success",
    );
  } catch {
    // keep going even if persistence fails
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

  const { messages, mode, temperature, memory, search: rawSearch } = body as {
    messages: unknown;
    mode?: unknown;
    temperature?: unknown;
    memory?: unknown;
    search?: unknown;
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

  // 4. Key resolution — the user's own key wins unconditionally.
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

  // 5. Distributed rate limit — max 1 request per 2 seconds, 60 per minute,
  // keyed by the VERIFIED user id when signed in, else by effective IP.
  // Never trusts client-supplied identity headers (audit: H-1/H-8).
  const ip = clientIp(request);
  const verifiedUserForLimit = await getVerifiedUserIfPresent(request).catch(() => null);
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

  // 6. Plan entitlement — server key only. Own keys are unlimited by design.
  // Authenticated users are governed by the per-user credit system (atomic RPC,
  // IST-day reset, pack fallback, idempotency by request reference).
  // Anonymous users fall back to the device-keyed entitlements + per-IP free
  // quota (10/day) — exactly as before.
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
      reservation = {
        kind: "user",
        userId: verifiedUser.id,
        source: result.source === "pack" ? "pack" : "daily",
        reference,
      };
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

  // Web Search: honour the requested mode, with the Auto classifier deciding
  // for "auto". The decision is based on the last user turn only — the answer
  // always comes live from Gemini; grounding only lets the model consult the
  // web first.
  const searchMode = normalizeSearchMode(rawSearch);
  const lastUser = [...redactedMessages].reverse().find((turn) => turn.role === "user");
  const searchNeeded =
    searchMode === "on" ||
    (searchMode === "auto" && shouldAutoSearch(lastUser?.content ?? ""));
  const searchMetaCapture: SearchMetaCapture | undefined = searchNeeded
    ? { queries: [], sources: [], sawGrounding: false }
    : undefined;

  // Web Search: attempt the grounded stream first. When search is needed
  // and every model fails grounded, fall back to the ungrounded stream so the
  // user still gets a live, honest answer — the done frame and the
  // X-ANVIK-SEARCH-STATUS header tell what actually happened.
  let searchStatus: SearchStatus = "off";
  let result;

  if (searchNeeded) {
    const grounded = await openGeminiStreamWithFallback({
      apiKey: key,
      systemInstruction,
      contents,
      temperature: safeTemperature,
      maxOutputTokens: tokenCap,
      signal: request.signal,
      googleSearch: true,
      searchMetaCapture,
    });
    if (grounded.ok) {
      result = grounded;
      searchStatus = "on";
    } else {
      const terminal =
        grounded.error.code === "invalid_key" ||
        grounded.error.code === "bad_format" ||
        grounded.error.status === 400 ||
        grounded.error.status === 401 ||
        grounded.error.status === 403;
      if (terminal) {
        cancelReservation(reservation);
        return Response.json(
          { error: grounded.error.message, detail: grounded.error.message, code: grounded.error.code },
          { status: grounded.error.status },
        );
      }
      result = await openGeminiStreamWithFallback({
        apiKey: key,
        systemInstruction,
        contents,
        temperature: safeTemperature,
        maxOutputTokens: tokenCap,
        signal: request.signal,
      });
      searchStatus = "unavailable";
    }
  } else {
    result = await openGeminiStreamWithFallback({
      apiKey: key,
      systemInstruction,
      contents,
      temperature: safeTemperature,
      maxOutputTokens: tokenCap,
      signal: request.signal,
    });
    searchStatus = "off";
  }

  try {
    if (!result.ok) {
      cancelReservation(reservation);
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
            const groundedMetaSeen = searchMetaCapture ? searchMetaCapture.sawGrounding : false;
            const finalSearchStatus = !searchMetaCapture
              ? "off"
              : !groundedMetaSeen
                ? "unavailable"
                : searchStatus;
            const sources = searchMetaCapture && groundedMetaSeen ? normalizeSources(searchMetaCapture.sources) : [];
            const queries = searchMetaCapture && groundedMetaSeen ? normalizeQueries(searchMetaCapture.queries) : [];
            controller.enqueue(
              encoder.encode(
                sseFrame({ t: "done", model, search: finalSearchStatus, sources, queries }),
              ),
            );
          } else {
            answer += rest;
          }
          completed = true;

          // 8. Count quota only after a full, successful stream.
          await confirmReservation(reservation, model, "chat");

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
          cancelReservation(reservation);
          controller.error(error);
        } finally {
          upstreamReader.releaseLock();
        }
      },
      cancel(reason) {
        void upstreamReader.cancel(reason);
        cancelReservation(reservation);
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
    cancelReservation(reservation);
    if (err instanceof Error && err.name === "AbortError") {
      return new Response(null, { status: 499 });
    }
    return Response.json(
      { error: "No internet. Try again", detail: "No internet. Try again", code: "network" },
      { status: 503 },
    );
  }
}
