import {
  KEY_FORMAT_ERROR,
  generateGeminiTextWithFallback,
  isValidGeminiKeyFormat,
} from "@/lib/gemini";
import { serverKey } from "@/lib/provider";

export const maxDuration = 30;

export async function POST(request: Request) {
  let body: { apiKey?: unknown } = {};
  try {
    body = (await request.json()) as { apiKey?: unknown };
  } catch {
    body = {};
  }

  const headerKey = request.headers.get("x-google-generative-ai-api-key")?.trim();
  const bodyKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const key = bodyKey || headerKey || serverKey() || "";

  if (!isValidGeminiKeyFormat(key)) {
    return Response.json(
      { ok: false, error: KEY_FORMAT_ERROR, code: "bad_format" },
      { status: 400 },
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
      message: `Connected to Gemini (${result.model})`,
    });
  } catch {
    return Response.json(
      { ok: false, error: "No internet. Try again", code: "network" },
      { status: 503 },
    );
  }
}
