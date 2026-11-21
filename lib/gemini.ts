/**
 * Gemini API client — live-only, with explicit model fallback and honest errors.
 *
 * Model fallback order:
 *   1. gemini-2.0-flash
 *   2. gemini-2.5-flash
 *   3. gemini-1.5-flash
 *
 * Only HTTP 404 (model unavailable/not found) triggers fallback to the next model.
 * Auth errors (401/403), quota errors (429), and network errors stop immediately
 * and surface an honest, actionable message.
 */

export const MODEL_FALLBACK_CHAIN = [
  "gemini-2.0-flash",
  "gemini-2.5-flash",
  "gemini-1.5-flash",
] as const;

export const IMAGE_MODEL_FALLBACK_CHAIN = [
  "gemini-2.0-flash-preview-image-generation",
  "gemini-2.5-flash-image",
  "gemini-2.0-flash-exp-image-generation",
] as const;

export const KEY_FORMAT_ERROR = "Key looks wrong. Paste a new key from aistudio.google.com";
export const KEY_INVALID_ERROR = "Key invalid or expired. Create new key in Google AI Studio";
export const QUOTA_ERROR = "Free quota finished. Wait 1 hour or use another Google account key";
export const NETWORK_ERROR = "No internet. Try again";

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
  return trimmed.startsWith("AIza") && trimmed.length >= 35;
}

export function classifyGeminiError(status: number, rawBody = ""): ClassifiedError {
  const lower = rawBody.toLowerCase();

  if (
    status === 401 ||
    status === 403 ||
    lower.includes("api_key_invalid") ||
    lower.includes("api key not valid") ||
    lower.includes("permission_denied") ||
    lower.includes("unauthenticated")
  ) {
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
      message: "Requested Gemini model was not found for this key.",
      code: "not_found",
    };
  }

  return {
    status: status >= 400 ? status : 502,
    message: "Gemini could not complete this request right now. Please try again.",
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
  // Disable thinking wait on 2.5 Flash so first token arrives in < 1 second
  if (model === "gemini-2.5-flash") {
    config.thinkingConfig = { thinkingBudget: 0 };
  }
  return config;
}

/**
 * Opens a streaming SSE connection to Gemini, falling back across
 * gemini-2.0-flash -> gemini-2.5-flash -> gemini-1.5-flash ONLY on HTTP 404.
 * Converts Gemini's SSE frames into immediate UTF-8 text chunks.
 */
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
  let lastError: ClassifiedError | null = null;

  for (const model of MODEL_FALLBACK_CHAIN) {
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
          signal: options.signal,
        },
      );
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw err;
      }
      return {
        ok: false,
        error: { status: 503, message: NETWORK_ERROR, code: "network" },
      };
    }

    if (response.status === 404) {
      lastError = classifyGeminiError(404, await response.text().catch(() => ""));
      continue;
    }

    if (!response.ok || !response.body) {
      const raw = await response.text().catch(() => "");
      return {
        ok: false,
        error: classifyGeminiError(response.status, raw),
      };
    }

    const upstreamBody = response.body;
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const textStream = new ReadableStream<Uint8Array>({
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
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              const payload = trimmed.slice(5).trim();
              if (!payload || payload === "[DONE]") continue;
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
                  if (text) {
                    emittedAny = true;
                    controller.enqueue(encoder.encode(text));
                  }
                }
              } catch {
                // Skip partial/malformed SSE frames
              }
            }
          }
          if (buffer.trim().startsWith("data:")) {
            const payload = buffer.trim().slice(5).trim();
            if (payload && payload !== "[DONE]") {
              try {
                const frame = JSON.parse(payload) as {
                  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
                };
                const text =
                  frame.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
                if (text) {
                  emittedAny = true;
                  controller.enqueue(encoder.encode(text));
                }
              } catch {
                // Ignore trailing partial frame
              }
            }
          }
          if (!emittedAny) {
            controller.enqueue(
              encoder.encode("Gemini returned an empty response for that prompt. Please try rephrasing."),
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

    return { ok: true, model, stream: textStream };
  }

  return {
    ok: false,
    error: lastError ?? {
      status: 404,
      message: "No Gemini Flash model responded for this key.",
      code: "not_found",
    },
  };
}

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
}): Promise<GeminiTextResult> {
  if (!isValidGeminiKeyFormat(options.apiKey)) {
    return {
      ok: false,
      error: { status: 400, message: KEY_FORMAT_ERROR, code: "bad_format" },
    };
  }

  const doFetch = options.fetchImpl ?? fetch;
  const baseUrl = getGeminiBaseUrl();
  let lastError: ClassifiedError | null = null;

  for (const model of MODEL_FALLBACK_CHAIN) {
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
        signal: options.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw err;
      return {
        ok: false,
        error: { status: 503, message: NETWORK_ERROR, code: "network" },
      };
    }

    if (response.status === 404) {
      lastError = classifyGeminiError(404, await response.text().catch(() => ""));
      continue;
    }

    if (!response.ok) {
      const raw = await response.text().catch(() => "");
      return { ok: false, error: classifyGeminiError(response.status, raw) };
    }

    const json = (await response.json().catch(() => null)) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    } | null;
    const text =
      json?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";
    return { ok: true, model, text };
  }

  return {
    ok: false,
    error: lastError ?? { status: 404, message: KEY_INVALID_ERROR, code: "not_found" },
  };
}
