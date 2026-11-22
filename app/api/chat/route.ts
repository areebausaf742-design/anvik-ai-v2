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
 *   6. free-tier quota (server key only): 20/day per IP, counted in Supabase
 *      only after a successful stream — never on a failed request
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
import { CHAT_MAX_TOKENS, CODE_MAX_TOKENS, MAX_TEMPERATURE } from "@/lib/credit";
import { memoryInstruction, type Memory } from "@/lib/learning";
import {
  isValidGeminiKeyFormat,
  openGeminiStreamWithFallback,
  type GeminiTurn,
} from "@/lib/gemini";
import { sanitizeTurns, buildGeminiContents } from "@/lib/history";
import { hashIp, safeKeyLog, scanHistory, stripSecrets } from "@/lib/security";
import { QuotaStore, supabaseQuotaHooks } from "@/lib/quota";
import { sbSelect, sbUpsert } from "@/lib/supabase";
import { recordChatExchange } from "@/lib/chat-record";
import { clientIp, allowPerIp } from "@/lib/rate-limit";

export const maxDuration = 60;

const validModes = new Set<string>(modes.map(({ id }) => id));
const MIN_SPACING_MS = 2_000;
const PER_MINUTE = 60;

const quota = new QuotaStore(supabaseQuotaHooks(sbSelect, sbUpsert));

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

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send a valid JSON body with a messages array." }, { status: 400 });
  }

  if (!body || typeof body !== "object" || !("messages" in body)) {
    return Response.json({ error: "A conversation is required." }, { status: 400 });
  }

  const { messages, mode, temperature, memory } = body as {
    messages: unknown;
    mode?: unknown;
    temperature?: unknown;
    memory?: unknown;
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

  // 5. Per-IP rate limit — max 1 request per 2 seconds, 60 per minute.
  const ip = clientIp(request);
  const pace = allowPerIp(ip, MIN_SPACING_MS, PER_MINUTE);
  if (!pace.allowed) {
    const retryAfter = Math.max(1, Math.ceil(pace.retryAfterMs / 1000));
    return Response.json(
      {
        error: "Too many requests. Please wait a few seconds and try again.",
        code: "rate_limit",
      },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  // 6. Free-tier quota — server key only. Own keys are unlimited by design.
  let reservationKey: string | undefined;
  if (!validClientKey) {
    const ipHash = hashIp(ip);
    const check = await quota.checkAndReserve(ipHash);
    if (!check.ok) {
      return Response.json(
        {
          error: "Free limit reached. Connect your own key to continue unlimited.",
          detail: "Free limit reached. Connect your own key to continue unlimited.",
          code: "free_limit_reached",
          remaining: 0,
        },
        { status: 429 },
      );
    }
    reservationKey = check.reservationKey;
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

  const tokenCap = selectedMode === "coder" ? CODE_MAX_TOKENS : CHAT_MAX_TOKENS;
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

  const deviceId = request.headers.get("x-anvik-device")?.trim().slice(0, 128) || "anonymous";
  const wantSSE = (request.headers.get("accept") ?? "").includes("text/event-stream");

  try {
    const result = await openGeminiStreamWithFallback({
      apiKey: key,
      systemInstruction,
      contents,
      temperature: safeTemperature,
      maxOutputTokens: tokenCap,
      signal: request.signal,
    });

    if (!result.ok) {
      if (reservationKey) quota.cancel(reservationKey);
      return Response.json(
        { error: result.error.message, detail: result.error.message, code: result.error.code },
        { status: result.error.status },
      );
    }

    const model = result.model;
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
              encoder.encode(sseFrame({ t: "meta", model, source: "gemini" })),
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
            controller.enqueue(
              encoder.encode(sseFrame({ t: "done", model })),
            );
          } else {
            answer += rest;
          }
          completed = true;

          // 8. Count quota only after a full, successful stream.
          if (reservationKey) {
            try {
              await quota.confirm(reservationKey);
            } catch {
              // Keep the completed answer available even if persistence fails.
            }
          }

          // Persist every exchange (user message + answer + model). Best-effort:
          // a Supabase outage must never break the answer, so failures are
          // swallowed; the write is still awaited so it completes before the
          // response closes.
          const finalUser = redactedMessages[redactedMessages.length - 1];
          if (completed && answer.trim() && finalUser) {
            try {
              await recordChatExchange({
                userId: deviceId,
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
          if (reservationKey) quota.cancel(reservationKey);
          controller.error(error);
        } finally {
          upstreamReader.releaseLock();
        }
      },
      cancel(reason) {
        void upstreamReader.cancel(reason);
        if (reservationKey) quota.cancel(reservationKey);
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
      },
    });
  } catch (err) {
    if (reservationKey) quota.cancel(reservationKey);
    if (err instanceof Error && err.name === "AbortError") {
      return new Response(null, { status: 499 });
    }
    return Response.json(
      { error: "No internet. Try again", detail: "No internet. Try again", code: "network" },
      { status: 503 },
    );
  }
}
