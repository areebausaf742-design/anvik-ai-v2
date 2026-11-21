import { serverKey } from "@/lib/provider";
import { allow, clientIdentity, LIMIT_MESSAGE } from "@/lib/rate-limit";
import { CHAT_MAX_TOKENS } from "@/lib/credit";
import {
  KEY_FORMAT_ERROR,
  isValidGeminiKeyFormat,
  openGeminiStreamWithFallback,
} from "@/lib/gemini";

export const maxDuration = 60;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send a valid JSON body with a transcript." }, { status: 400 });
  }

  if (!body || typeof body !== "object" || !("transcript" in body) || typeof body.transcript !== "string") {
    return Response.json({ error: "Share a voice transcript to get a response." }, { status: 400 });
  }
  const transcript = body.transcript.trim();
  if (transcript.length < 1) {
    return Response.json({ error: "Prompt cannot be empty." }, { status: 400 });
  }
  if (body.transcript.length > 6000) {
    return Response.json({ error: "Keep the transcript under 6,000 characters." }, { status: 400 });
  }

  const supplied = request.headers.get("x-google-generative-ai-api-key")?.trim();
  if (supplied && !isValidGeminiKeyFormat(supplied)) {
    return Response.json({ error: KEY_FORMAT_ERROR, code: "bad_format" }, { status: 400 });
  }

  const key = supplied || serverKey();
  if (!key || !isValidGeminiKeyFormat(key)) {
    return Response.json({ error: KEY_FORMAT_ERROR, code: "bad_format" }, { status: 401 });
  }

  if (!allow(clientIdentity(request, request.headers.get("x-anvik-device")), 12, 100)) {
    return Response.json({ error: LIMIT_MESSAGE }, { status: 429 });
  }

  try {
    const result = await openGeminiStreamWithFallback({
      apiKey: key,
      systemInstruction:
        "You are ANVIK Voice, a warm, concise conversational assistant. Respond naturally to the user's spoken question so it sounds great when read aloud.",
      contents: [{ role: "user", parts: [{ text: transcript }] }],
      temperature: 0.6,
      maxOutputTokens: CHAT_MAX_TOKENS,
      signal: request.signal,
    });

    if (!result.ok) {
      return Response.json(
        { error: result.error.message, detail: result.error.message, code: result.error.code },
        { status: result.error.status },
      );
    }

    return new Response(result.stream, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-ANVIK-MODEL": result.model,
        "X-ANVIK-LABEL": "From Gemini",
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return new Response(null, { status: 499 });
    }
    return Response.json({ error: "No internet. Try again", code: "network" }, { status: 503 });
  }
}
