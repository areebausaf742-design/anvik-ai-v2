import {
  KEY_FORMAT_ERROR,
  generateGeminiTextWithFallback,
  isValidGeminiKeyFormat,
} from "@/lib/gemini";
import { allowDistributed } from "@/lib/rate-limit";
import { getVerifiedUserIfPresent } from "@/lib/session";

export const maxDuration = 30;

export async function POST(request: Request) {
  let body: { apiKey?: unknown } = {};
  try {
    body = (await request.json()) as { apiKey?: unknown };
  } catch {
    body = {};
  }

  // Test-key proves the caller's OWN key — the server key is never used here,
  // so an anonymous caller cannot probe or burn it. The client always sends
  // its key (header + body); a missing/invalid key is a plain 400.
  const headerKey = request.headers.get("x-google-generative-ai-api-key")?.trim();
  const bodyKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const key = bodyKey || headerKey || "";

  if (!key) {
    return Response.json(
      { ok: false, error: "No key supplied. Paste a key from aistudio.google.com to test it.", code: "no_key" },
      { status: 400 },
    );
  }

  if (!isValidGeminiKeyFormat(key)) {
    return Response.json(
      { ok: false, error: KEY_FORMAT_ERROR, code: "bad_format" },
      { status: 400 },
    );
  }

  // Test-key performs AI-backed work — protect it with the distributed limiter.
  const verified = await getVerifiedUserIfPresent(request);
  const rate = await allowDistributed(request, "test-key", 6, 40, { verifiedUserId: verified?.id ?? null });
  if (!rate.allowed) {
    const retryAfter = Math.max(1, Math.ceil(rate.retryAfterMs / 1000));
    return Response.json(
      { ok: false, error: "Too many requests. Please wait a minute and try again.", code: "rate" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  try {
    const result = await generateGeminiTextWithFallback({
      apiKey: key,
      prompt: "Reply with the single word: OK",
      maxOutputTokens: 16,
      temperature: 0,
      signal: request.signal,
    });

    if (!result.ok) {
      return Response.json(
        { ok: false, error: result.error.message, code: result.error.code },
        { status: result.error.status },
      );
    }

    return Response.json({
      ok: true,
      model: result.model,
      message: "ANVIK is ready."
    });
  } catch {
    return Response.json(
      { ok: false, error: "No internet. Try again", code: "network" },
      { status: 503 },
    );
  }
}
