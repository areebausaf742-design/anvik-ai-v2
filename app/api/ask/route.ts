import { detectLanguage, langLabel } from "@/lib/detect";
import { allowDistributed, LIMIT_MESSAGE } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import { serverKey } from "@/lib/provider";
import {
  KEY_FORMAT_ERROR,
  isValidGeminiKeyFormat,
  openGeminiStreamWithFallback,
} from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

export async function POST(req: Request) {
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

  const supplied = req.headers.get("x-google-generative-ai-api-key")?.trim();
  if (supplied && !isValidGeminiKeyFormat(supplied)) {
    return json({ message: KEY_FORMAT_ERROR, code: "bad_format" }, 400);
  }

  const key = supplied || serverKey();
  if (!key || !isValidGeminiKeyFormat(key)) {
    return json({ message: KEY_FORMAT_ERROR, code: "bad_format" }, 401);
  }

  const verified = auth.user;
  const rate = await allowDistributed(req, "ask", 12, 100, { verifiedUserId: verified?.id ?? null });
  if (!rate.allowed) {
    const retryAfter = Math.max(1, Math.ceil(rate.retryAfterMs / 1000));
    return new Response(JSON.stringify({ message: LIMIT_MESSAGE, code: "rate" }), {
      status: 429,
      headers: { "content-type": "application/json; charset=utf-8", "Retry-After": String(retryAfter) },
    });
  }

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
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            const piece = decoder.decode(value, { stream: true });
            if (piece) {
              controller.enqueue(enc.encode(`data: ${JSON.stringify({ t: "tok", s: piece })}\n\n`));
            }
          }
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
          controller.close();
        }
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
    return json({ message: "No internet. Try again", code: "network" }, 503);
  }
}
