import { detectLanguage, langLabel } from "@/lib/detect";
import { openGeminiStreamWithFallback } from "@/lib/gemini";
import { requireUser } from "@/lib/session";
import { beginMeteredRequest } from "@/lib/ai-gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

export async function POST(req: Request) {
  // Identity first: a guest must be refused before anything else happens.
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  let body: { question?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ message: "Could not read that request." }, 400);
  }

  const question = String(body?.question ?? "").trim();
  if (question.length < 2) return json({ message: "Write a question first.", code: "empty" }, 400);
  if (question.length > 1600)
    return json({ message: "Keep the question under 1,600 characters.", code: "long" }, 413);

  // Identity → key → rate limit → one reserved credit, shared with every
  // other AI surface. Unmetered provider calls no longer exist.
  const gateway = await beginMeteredRequest(req, "ask", auth.user);
  if (!gateway.ok) return gateway.response;
  const { session } = gateway;
  const key = session.key;

  const lang = detectLanguage(question);

  try {
    const result = await openGeminiStreamWithFallback({
      apiKey: key,
      systemInstruction:
        "You are ANVIK, a clear, accurate personal AI. Answer the user's exact question in the language they wrote in.",
      contents: [{ role: "user", parts: [{ text: question }] }],
      temperature: 0.5,
      maxOutputTokens: 1000,
      signal: req.signal,
    });

    if (!result.ok) {
      // Provider refused the call — the reserved credit goes straight back.
      await session.settle("failure", { model: null });
      return json(
        { message: result.error.message, code: result.error.code },
        result.error.status,
      );
    }

    const enc = new TextEncoder();
    const decoder = new TextDecoder();
    const reader = result.stream.getReader();

    const sseBody = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(
          enc.encode(
            `data: ${JSON.stringify({ t: "meta", lang, langLabel: langLabel(lang), model: result.model })}\n\n`,
          ),
        );
        let outcome: "success" | "failure" | "aborted" = "failure";
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            const piece = decoder.decode(value, { stream: true });
            if (piece) {
              controller.enqueue(enc.encode(`data: ${JSON.stringify({ t: "tok", s: piece })}\n\n`));
            }
          }
          outcome = "success";
          controller.enqueue(
            enc.encode(`data: ${JSON.stringify({ t: "done", model: result.model })}\n\n`),
          );
        } catch {
          controller.enqueue(
            enc.encode(
              `data: ${JSON.stringify({ t: "err", message: "No internet. Try again" })}\n\n`,
            ),
          );
        } finally {
          reader.releaseLock();
          // Settle inside the stream so the credit is finalised after the last
          // byte, not before the first one.
          await session.settle(outcome, { model: result.model });
          controller.close();
        }
      },
      async cancel() {
        // Client hung up mid-answer → refund, never charge for a partial reply.
        await session.settle("aborted", { model: result.model });
      },
    });

    return new Response(sseBody, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
        "x-anvik-model": result.model,
        "x-anvik-label": "ANVIK",
      },
    });
  } catch {
    await session.settle("failure");
    return json({ message: "No internet. Try again", code: "network" }, 503);
  }
}
