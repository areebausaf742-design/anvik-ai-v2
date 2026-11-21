import { serverKey } from "@/lib/provider";
import { allow, clientIdentity, LIMIT_MESSAGE } from "@/lib/rate-limit";
import { CHAT_MAX_TOKENS } from "@/lib/credit";
import {
  KEY_FORMAT_ERROR,
  isValidGeminiKeyFormat,
  openGeminiStreamWithFallback,
} from "@/lib/gemini";

const supportedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_BASE64 = 5_600_000;

function normaliseBase64(value: string): string {
  const comma = value.startsWith("data:") ? value.indexOf(",") : -1;
  return comma >= 0 ? value.slice(comma + 1) : value;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send a valid JSON body with an image." }, { status: 400 });
  }

  if (!body || typeof body !== "object" || !("image" in body)) {
    return Response.json({ error: "Choose an image and tell ANVIK what to look for." }, { status: 400 });
  }

  const { image, prompt, mediaType } = body as { image: unknown; prompt: unknown; mediaType: unknown };
  if (typeof image !== "string" || image.length === 0) {
    return Response.json({ error: "Choose an image and tell ANVIK what to look for." }, { status: 400 });
  }
  if (typeof mediaType !== "string" || !supportedTypes.has(mediaType)) {
    return Response.json({ error: "Use a JPG, PNG, WebP, or GIF image." }, { status: 400 });
  }

  const data = normaliseBase64(image);
  if (data.length > MAX_BASE64) {
    return Response.json({ error: "Use an image under 4 MB." }, { status: 413 });
  }
  const question = typeof prompt === "string" ? prompt.slice(0, 1200).trim() : "";

  const supplied = request.headers.get("x-google-generative-ai-api-key")?.trim();
  if (supplied && !isValidGeminiKeyFormat(supplied)) {
    return Response.json({ error: KEY_FORMAT_ERROR, code: "bad_format" }, { status: 400 });
  }

  const key = supplied || serverKey();
  if (!key || !isValidGeminiKeyFormat(key)) {
    return Response.json({ error: KEY_FORMAT_ERROR, code: "bad_format" }, { status: 401 });
  }

  if (!allow(clientIdentity(request, request.headers.get("x-anvik-device")), 10, 80)) {
    return Response.json({ error: LIMIT_MESSAGE }, { status: 429 });
  }

  try {
    const result = await openGeminiStreamWithFallback({
      apiKey: key,
      systemInstruction:
        "You are ANVIK Vision. Analyze the uploaded image accurately, describe what is clearly visible, answer the user's question directly, and never guess hidden text.",
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: mediaType, data } },
            { text: question || "Describe this image clearly and highlight the key details." },
          ],
        },
      ],
      temperature: 0.4,
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
