/**
 * The one place that decides which model ANVIK asks.
 *
 * This module used to be a second, half-finished provider client: it exported
 * `openLive`/`parseLive`, hardcoded `gemini-2.0-flash` at 600 output tokens,
 * and had no fallback chain. Nothing imported it except itself — every real
 * route uses `lib/gemini.ts`. Dead code that *looks* like the provider layer is
 * a trap: the next person to add a route would have copied the stale client
 * and silently shipped a model with no fallback and a 600-token cap.
 *
 * What remains is the part that is actually shared: the key resolution rules
 * and the ordered model chain. The chain lives here so the fallback order is
 * defined once and read by `lib/gemini.ts`.
 */

import { isValidGeminiKeyFormat } from "@/lib/gemini";

export const GEMINI_BASE_URL =
  process.env.GEMINI_BASE_URL?.trim() || "https://generativelanguage.googleapis.com/v1beta";

/**
 * The ordered fallback chain is owned by `lib/gemini.ts`
 * (`MODEL_FALLBACK_CHAIN`) because that module is the only one that calls the
 * API. It is re-exported here so anything that already imports the "provider
 * layer" gets the live chain instead of a hardcoded copy that can drift.
 */
export { MODEL_FALLBACK_CHAIN, MODEL_FALLBACK_CHAIN as MODEL_CHAIN } from "@/lib/gemini";

/** The model used when a caller does not care (single-shot helpers). */
export const DEFAULT_MODEL = "gemini-2.5-flash";

/**
 * Server key resolution. Order matters: the dedicated Gemini variable wins over
 * the Google-SDK variable, so an operator can rotate one without touching the
 * other.
 */
export function serverKey(): string | undefined {
  const key =
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  return key || undefined;
}

export const liveKey = serverKey;

export function clientKey(request: Request): string | undefined {
  const key = request.headers.get("x-google-generative-ai-api-key")?.trim();
  if (!isValidGeminiKeyFormat(key)) return undefined;
  return key;
}

/** The caller's own key wins unconditionally — the user is paying Google. */
export function resolveKey(request: Request): string | undefined {
  return clientKey(request) ?? serverKey();
}

export type Usage = {
  promptTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
};
