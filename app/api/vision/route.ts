import { CHAT_MAX_TOKENS } from "@/lib/credit";
import { openGeminiStreamWithFallback } from "@/lib/gemini";
import { requireUser } from "@/lib/session";
import { beginMeteredRequest, meteredStream } from "@/lib/ai-gateway";

const supportedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_BASE64 = 4_200_000; // ~3 MB of binary (base64 inflates binary by ~4/3)

function normaliseBase64(value: string): string {
  const comma = value.startsWith("data:") ? value.indexOf(",") : -1;
  return comma >= 0 ? value.slice(comma + 1) : value;
}

export async function POST(request: Request) {
  // Identity first: a guest must be refused before anything else happens.
  const auth = await requireUser(request, "Image analysis");
  if ("response" in auth) return auth.response;
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
    return Response.json({ error: "Use an image under 3 MB." }, { status: 413 });
  }
  const question = typeof prompt === "string" ? prompt.slice(0, 1200).trim() : "";

  // Identity → key → rate limit → one reserved credit, shared with every
  // other AI surface. Unmetered provider calls no longer exist.
  const gateway = await beginMeteredRequest(request, "vision", auth.user);
  if (!gateway.ok) return gateway.response;
  const { session } = gateway;
  const key = session.key;

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
      await session.settle("failure", { model: null });
      return Response.json(
        { error: result.error.message, detail: result.error.message, code: result.error.code },
        { status: result.error.status },
      );
    }

    return new Response(meteredStream(result.stream, session.settle, { model: result.model }), {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-ANVIK-MODEL": result.model,
        "X-ANVIK-LABEL": "ANVIK",
        ...(Number.isFinite(session.remaining) ? { "X-ANVIK-REMAINING": String(session.remaining) } : {}),
      },
    });
  } catch (err) {
    await session.settle(err instanceof Error && err.name === "AbortError" ? "aborted" : "failure");
    if (err instanceof Error && err.name === "AbortError") {
      return new Response(null, { status: 499 });
    }
    return Response.json({ error: "No internet. Try again", code: "network" }, { status: 503 });
  }
}
