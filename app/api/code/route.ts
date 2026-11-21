import { serverKey } from "@/lib/provider";
import { allow, clientIdentity, LIMIT_MESSAGE } from "@/lib/rate-limit";
import { CODE_MAX_TOKENS } from "@/lib/credit";
import {
  KEY_FORMAT_ERROR,
  isValidGeminiKeyFormat,
  openGeminiStreamWithFallback,
} from "@/lib/gemini";

export const maxDuration = 60;

const LANGUAGES = new Set(["TypeScript", "JavaScript", "Python", "HTML/CSS", "CSS", "SQL"]);

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send a valid JSON body with a prompt." }, { status: 400 });
  }

  if (!body || typeof body !== "object" || !("prompt" in body) || typeof body.prompt !== "string") {
    return Response.json({ error: "Describe the code you want to create." }, { status: 400 });
  }
  const prompt = body.prompt.trim();
  if (prompt.length < 3) {
    return Response.json({ error: "Prompt cannot be empty." }, { status: 400 });
  }
  if (body.prompt.length > 6000) {
    return Response.json({ error: "Keep the brief under 6,000 characters." }, { status: 400 });
  }

  const requestedLanguage = (body as { language?: unknown }).language;
  const language =
    typeof requestedLanguage === "string" && LANGUAGES.has(requestedLanguage)
      ? requestedLanguage
      : "TypeScript";

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
      systemInstruction: `You are ANVIK Code Lab. The user wants ${language}. Return complete, clean, runnable ${language} code first inside a single fenced code block (with language tag), followed by a brief explanation of the key decisions. If HTML/CSS is chosen, provide a self-contained HTML document with <style> and optional <script> so it renders cleanly in a live preview.`,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      temperature: 0.35,
      maxOutputTokens: CODE_MAX_TOKENS,
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
