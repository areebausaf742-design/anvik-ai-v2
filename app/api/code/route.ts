import { CODE_MAX_TOKENS } from "@/lib/credit";
import { CODE_LAB_LANGUAGES, getCodeFenceLanguage } from "@/lib/code-lab";
import { openGeminiStreamWithFallback } from "@/lib/gemini";
import { requireUser } from "@/lib/session";
import { beginMeteredRequest, meteredStream } from "@/lib/ai-gateway";

export const maxDuration = 60;

const LANGUAGES: ReadonlySet<string> = new Set(CODE_LAB_LANGUAGES);

export async function POST(request: Request) {
  // Identity first: a guest must be refused before anything else happens.
  const auth = await requireUser(request, "The code lab");
  if ("response" in auth) return auth.response;
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

  // Identity → key → rate limit → one reserved credit. Nothing above this
  // line touches the provider; nothing below it runs unmetered.
  const gateway = await beginMeteredRequest(request, "code", auth.user);
  if (!gateway.ok) return gateway.response;
  const { session } = gateway;
  const key = session.key;

  try {
    const result = await openGeminiStreamWithFallback({
      apiKey: key,
      systemInstruction: `You are ANVIK Code Lab, a language-strict code generator.
The selected language is exactly: ${language}.
Return one complete, runnable implementation in the FIRST fenced code block.
Use this exact code-fence language tag: ${getCodeFenceLanguage(language)}.
Do not include examples, snippets, or fenced blocks in any other language.
Do not switch to HTML, JSX, or JavaScript unless that is the selected language.
For Java, return valid Java source code with required imports and a complete class; never return HTML or JavaScript.
For HTML/CSS, return a self-contained HTML document with <style> and optional <script> so it renders cleanly in a live preview.
Keep the code block complete and preserve indentation. After the single code block, add a short explanation in plain text.`,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      temperature: 0.35,
      maxOutputTokens: CODE_MAX_TOKENS,
      signal: request.signal,
    });

    if (!result.ok) {
      // The model was never successfully called — give the credit back now.
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
    // No stream was produced; never leave the reservation hanging.
    await session.settle(err instanceof Error && err.name === "AbortError" ? "aborted" : "failure");
    if (err instanceof Error && err.name === "AbortError") {
      return new Response(null, { status: 499 });
    }
    return Response.json({ error: "No internet. Try again", code: "network" }, { status: 503 });
  }
}
