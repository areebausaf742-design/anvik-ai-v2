/**
 * Gemini API client — live-only, explicit model fallback, honest errors.
 *
 * The model chain (gemini-2.5-flash → gemini-2.0-flash → gemini-2.0-flash-lite)
 * is deliberately short and current: retired models (pro, 1.5-*) are never
 * called. Fallback and retry policy:
 *
 *   404            → next model immediately (bad model for this key/tier)
 *   429 / 500 / 502 / 503 / network error
 *                   → retry the SAME model with backoff (1s, 2s), then the next
 *                     model, then give up with an honest classified error
 *   401 / 403 / 400 → terminal: bad key or bad request, never "server key invalid"
 *
 * A fresh connection waits the request's own signal; the whole call — first
 * byte and the stream — is capped at 60 seconds so a slow upstream can never
 * hang a request forever. Callers pass `retryDelaysMs`/`timeoutMs` in tests
 * to keep suite time flat; production defaults are 1s/2s and 60s.
 *
 * The AQ prefix is a first-class Google key format — accepted everywhere
 * below alongside AIza.
 */

export const MODEL_FALLBACK_CHAIN = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
] as const;

export const DEFAULT_RETRY_DELAYS_MS = [1000, 2000];
export const DEFAULT_TIMEOUT_MS = 60_000;

export async function validateGeminiServerKey(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ googleStatus: number | null; invalid: boolean }> {
  try {
    const response = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey.trim())}`,
      { method: "GET", signal: AbortSignal.timeout(8000) },
    );
    if (response.status !== 400) {
      return { googleStatus: response.status, invalid: false };
    }
    const body = await response.text().catch(() => "");
    const lower = body.toLowerCase();
    return {
      googleStatus: response.status,
      invalid:
        lower.includes("api key not valid") ||
        lower.includes("api_key_invalid") ||
        lower.includes("api-key-invalid"),
    };
  } catch {
    return { googleStatus: null, invalid: false };
  }
}

export const IMAGE_MODEL_FALLBACK_CHAIN = [
  "gemini-2.0-flash-preview-image-generation",
  "gemini-2.5-flash-image",
  "gemini-2.0-flash-exp-image-generation",
] as const;

export const KEY_FORMAT_ERROR = "Key looks wrong. Paste a new key from aistudio.google.com";
export const KEY_INVALID_ERROR = "That API key is invalid or expired. Update your key in ANVIK Settings.";
export const QUOTA_ERROR = "Free quota finished. Wait 1 hour or use another Google account key";
export const NETWORK_ERROR = "No internet. Try again";
export const MAX_BODY_BYTES = 4 * 1024 * 1024;

export type GeminiErrorCode =
  | "bad_format"
  | "invalid_key"
  | "quota_exceeded"
  | "network"
  | "not_found"
  | "upstream";

export type ClassifiedError = {
  status: number;
  message: string;
  code: GeminiErrorCode;
};

export function getGeminiBaseUrl(): string {
  return process.env.GEMINI_BASE_URL?.trim() || "https://generativelanguage.googleapis.com/v1beta";
}

export function isValidGeminiKeyFormat(key: string | undefined | null): boolean {
  if (!key) return false;
  const trimmed = key.trim();
  // Both legacy AIza keys (legacy) and the newer AQ keys are valid Google keys.
  return trimmed.length <= 512 && (trimmed.startsWith("AIza") || trimmed.startsWith("AQ"));
}

export function classifyGeminiError(status: number, rawBody = ""): ClassifiedError {
  const lower = rawBody.toLowerCase();

  if (lower.includes("api_key_invalid") || lower.includes("api key not valid") || lower.includes("api-key-invalid")) {
    return {
      status: status === 403 ? 403 : 401,
      message: KEY_INVALID_ERROR,
      code: "invalid_key",
    };
  }

  if (status === 429 || lower.includes("resource_exhausted") || lower.includes("quota")) {
    return {
      status: 429,
      message: QUOTA_ERROR,
      code: "quota_exceeded",
    };
  }

  if (status === 404) {
    return {
      status: 404,
      message: "The selected ANVIK model is not available for this key.",
      code: "not_found",
    };
  }

  return {
    status: status >= 400 ? status : 502,
    message: "ANVIK could not complete this request right now. Please try again.",
    code: "upstream",
  };
}

export type GeminiTurn = {
  role: "user" | "model";
  parts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  >;
};

export type GeminiStreamOptions = {
  apiKey: string;
  systemInstruction: string;
  contents: GeminiTurn[];
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  /** Test-only: delay before the 1st/2nd retry (defaults 1000/2000ms). */
  retryDelaysMs?: number[];
  /** Test-only: per-call timeout in ms (default 60s). */
  timeoutMs?: number;
};

export type GeminiStreamResult =
  | {
      ok: true;
      model: string;
      stream: ReadableStream<Uint8Array>;
    }
  | {
      ok: false;
      error: ClassifiedError;
    };

function buildGenerationConfig(
  model: string,
  temperature: number,
  maxOutputTokens: number,
): Record<string, unknown> {
  const config: Record<string, unknown> = {
    temperature,
    maxOutputTokens,
  };
  // Disable thinking wait on 2.5 Flash so the first token arrives < 1 second.
  if (model === "gemini-2.5-flash") {
    config.thinkingConfig = { thinkingBudget: 0 };
  }
  return config;
}

/* ------------------------------------------------------------------ */
/* retry / timeout helpers                                             */
/* ------------------------------------------------------------------ */

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("The operation was aborted.", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Combine the caller's signal with a 60s cap. */
function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!signal) return timeout;
  if (typeof AbortSignal.any === "function") return AbortSignal.any([signal, timeout]);
  return signal.aborted ? signal : timeout;
}

/** True when the failure is worth retrying the same model for. */
function isRetryable(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503;
}

/* ------------------------------------------------------------------ */
/* streaming call — SSE upstream → plain UTF-8 text                    */
/* ------------------------------------------------------------------ */

export async function openGeminiStreamWithFallback(
  options: GeminiStreamOptions,
): Promise<GeminiStreamResult> {
  if (!isValidGeminiKeyFormat(options.apiKey)) {
    return {
      ok: false,
      error: { status: 400, message: KEY_FORMAT_ERROR, code: "bad_format" },
    };
  }

  const doFetch = options.fetchImpl ?? fetch;
  const baseUrl = getGeminiBaseUrl();
  const temperature = options.temperature ?? 0.65;
  const maxOutputTokens = options.maxOutputTokens ?? 1024;
  const delays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let lastError: ClassifiedError | null = null;

  for (const model of MODEL_FALLBACK_CHAIN) {
    for (let attempt = 0; attempt < delays.length + 1; attempt++) {
      if (attempt > 0) {
        try {
          await sleep(delays[attempt - 1], options.signal);
        } catch {
          throw new DOMException("The operation was aborted.", "AbortError");
        }
      }

      let response: Response;
      try {
        response = await doFetch(
          `${baseUrl}/models/${model}:streamGenerateContent?alt=sse`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": options.apiKey.trim(),
            },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: options.systemInstruction }] },
              contents: options.contents,
              generationConfig: buildGenerationConfig(model, temperature, maxOutputTokens),
            }),
            signal: withTimeout(options.signal, timeoutMs),
          },
        );
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") throw err;
        // Network layer down — retry with backoff, then the next model.
        lastError = { status: 503, message: NETWORK_ERROR, code: "network" };
        continue;
      }

      if (response.status === 404) {
        // Model unavailable for this key: move to the next model immediately.
        lastError = classifyGeminiError(404, await response.text().catch(() => ""));
        break;
      }

      if (!response.ok || !response.body) {
        const raw = await response.text().catch(() => "");
        const classified = classifyGeminiError(response.status, raw);
        if (isRetryable(response.status)) {
          lastError = classified;
          if (attempt < delays.length) continue; // same model, next attempt
          break; // retries exhausted — move to the next model
        }
        return { ok: false, error: classified };
      }

      return { ok: true, model, stream: toTextStream(response.body) };
    }
  }

  return {
    ok: false,
    error: lastError ?? {
      status: 404,
      message: "No ANVIK model responded for this key.",
      code: "not_found",
    },
  };
}

/* ------------------------------------------------------------------ */
/* SSE upstream → plain UTF-8 text (retry-safe: only used on 200s)     */
/* ------------------------------------------------------------------ */

function toTextStream(upstreamBody: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstreamBody.getReader();
      let buffer = "";
      let emittedAny = false;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            emitFrame(line, (text) => {
              emittedAny = true;
              controller.enqueue(encoder.encode(text));
            });
          }
        }
        const tail = buffer.trim();
        if (tail.startsWith("data:")) {
          emitFrame(buffer, (text) => {
            emittedAny = true;
            controller.enqueue(encoder.encode(text));
          });
        }
        if (!emittedAny) {
          controller.enqueue(
            encoder.encode("ANVIK returned an empty response for that prompt. Please try rephrasing."),
          );
        }
      } catch (err) {
        if (!(err instanceof Error && err.name === "AbortError")) {
          controller.enqueue(encoder.encode("\n\n_Stream interrupted. Please try again._"));
        }
      } finally {
        reader.releaseLock();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      void upstreamBody.cancel();
    },
  });
}

function emitFrame(line: string, emit: (text: string) => void): void {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return;
  const payload = trimmed.slice(5).trim();
  if (!payload || payload === "[DONE]") return;
  try {
    const frame = JSON.parse(payload) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }>;
    };
    const parts = frame.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) {
      const text = parts.map((p) => p.text ?? "").join("");
      if (text) emit(text);
    }
  } catch {
    // Skip partial/malformed SSE frames
  }
}

/* ------------------------------------------------------------------ */
/* one-shot call — used by test-key and the image / code paths         */
/* ------------------------------------------------------------------ */

export type GeminiTextResult =
  | { ok: true; model: string; text: string }
  | { ok: false; error: ClassifiedError };

export async function generateGeminiTextWithFallback(options: {
  apiKey: string;
  prompt: string;
  systemInstruction?: string;
  maxOutputTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  retryDelaysMs?: number[];
  timeoutMs?: number;
}): Promise<GeminiTextResult> {
  if (!isValidGeminiKeyFormat(options.apiKey)) {
    return {
      ok: false,
      error: { status: 400, message: KEY_FORMAT_ERROR, code: "bad_format" },
    };
  }

  const doFetch = options.fetchImpl ?? fetch;
  const baseUrl = getGeminiBaseUrl();
  const delays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let lastError: ClassifiedError | null = null;

  for (const model of MODEL_FALLBACK_CHAIN) {
    for (let attempt = 0; attempt < delays.length + 1; attempt++) {
      if (attempt > 0) {
        try {
          await sleep(delays[attempt - 1], options.signal);
        } catch {
          throw new DOMException("The operation was aborted.", "AbortError");
        }
      }

      let response: Response;
      try {
        response = await doFetch(`${baseUrl}/models/${model}:generateContent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": options.apiKey.trim(),
          },
          body: JSON.stringify({
            ...(options.systemInstruction
              ? { systemInstruction: { parts: [{ text: options.systemInstruction }] } }
              : {}),
            contents: [{ role: "user", parts: [{ text: options.prompt }] }],
            generationConfig: buildGenerationConfig(
              model,
              options.temperature ?? 0.4,
              options.maxOutputTokens ?? 256,
            ),
          }),
          signal: withTimeout(options.signal, timeoutMs),
        });
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") throw err;
        lastError = { status: 503, message: NETWORK_ERROR, code: "network" };
        continue;
      }

      if (response.status === 404) {
        lastError = classifyGeminiError(404, await response.text().catch(() => ""));
        break;
      }

      if (!response.ok) {
        const raw = await response.text().catch(() => "");
        const classified = classifyGeminiError(response.status, raw);
        if (isRetryable(response.status)) {
          lastError = classified;
          if (attempt < delays.length) continue; // same model, next attempt
          break; // retries exhausted — move to the next model
        }
        return { ok: false, error: classified };
      }

      const json = (await response.json().catch(() => null)) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      } | null;
      const text =
        json?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";
      return { ok: true, model, text };
    }
  }

  return {
    ok: false,
    error: lastError ?? { status: 404, message: KEY_INVALID_ERROR, code: "not_found" },
  };
}
