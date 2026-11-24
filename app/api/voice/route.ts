import { CHAT_MAX_TOKENS } from "@/lib/credit";
import { openGeminiStreamWithFallback } from "@/lib/gemini";
import { requireUser } from "@/lib/session";
import { beginMeteredRequest, meteredStream } from "@/lib/ai-gateway";

export const maxDuration = 60;

export async function POST(request: Request) {
  // Identity first: a guest must be refused before anything else happens.
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;
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

  // Identity → key → rate limit → one reserved credit, shared with every
  // other AI surface. Unmetered provider calls no longer exist.
  const gateway = await beginMeteredRequest(request, "voice", auth.user);
  if (!gateway.ok) return gateway.response;
  const { session } = gateway;
  const key = session.key;

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
