import { serverKey } from "@/lib/provider";
import { allowDistributed, LIMIT_MESSAGE } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import {
  IMAGE_MODEL_FALLBACK_CHAIN,
  KEY_FORMAT_ERROR,
  NETWORK_ERROR,
  classifyGeminiError,
  generateGeminiTextWithFallback,
  getGeminiBaseUrl,
  isValidGeminiKeyFormat,
  type ClassifiedError,
} from "@/lib/gemini";

const styles = new Set(["Cinematic", "Anime", "3D", "Photoreal", "Cyberpunk"]);

export const maxDuration = 120;

type Generated = {
  url: string;
  provider: "gemini" | "gemini-flux";
  model: string;
  enhancedPrompt?: string;
};

async function tryGeminiNativeImage(
  prompt: string,
  apiKey: string,
): Promise<{ ok: true; data: Generated } | { ok: false; error: ClassifiedError }> {
  const baseUrl = getGeminiBaseUrl();
  let lastError: ClassifiedError | null = null;

  for (const model of IMAGE_MODEL_FALLBACK_CHAIN) {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
        }),
        signal: AbortSignal.timeout(45_000),
      });
    } catch {
      return { ok: false, error: { status: 503, message: NETWORK_ERROR, code: "network" } };
    }

    if (response.status === 404 || response.status === 400) {
      const raw = await response.text().catch(() => "");
      const classified = classifyGeminiError(response.status, raw);
      if (classified.code === "invalid_key") {
        return { ok: false, error: classified };
      }
      lastError = classified;
      continue;
    }

    if (!response.ok) {
      const raw = await response.text().catch(() => "");
      return { ok: false, error: classifyGeminiError(response.status, raw) };
    }

    const result = (await response.json().catch(() => null)) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }>;
        };
      }>;
    } | null;

    const parts = result?.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (part?.inlineData?.data) {
        const mime = part.inlineData.mimeType || "image/png";
        return {
          ok: true,
          data: {
            url: `data:${mime};base64,${part.inlineData.data}`,
            provider: "gemini",
            model,
          },
        };
      }
    }
    lastError = { status: 404, message: "No image was returned. Try a different prompt.", code: "not_found" };
  }

  return {
    ok: false,
    error: lastError ?? { status: 404, message: "Image generation is temporarily unavailable.", code: "not_found" },
  };
}

async function renderWithFluxPrompt(prompt: string, model: string): Promise<Generated> {
  const url = new URL(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`);
  url.searchParams.set("width", "1024");
  url.searchParams.set("height", "1024");
  url.searchParams.set("seed", String(Math.floor(Math.random() * 2_147_483_647)));
  url.searchParams.set("model", "flux");
  url.searchParams.set("nologo", "true");

  const response = await fetch(url, { signal: AbortSignal.timeout(60_000), redirect: "follow" });
  if (!response.ok) throw new Error(`Image render failed (${response.status}).`);
  const contentType = response.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
  if (!contentType.startsWith("image/")) throw new Error("Image renderer returned an invalid response.");
  await response.arrayBuffer().catch(() => undefined);
  return { url: url.toString(), provider: "gemini-flux", model, enhancedPrompt: prompt };
}

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send a valid image prompt." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || !("prompt" in body)) {
    return Response.json({ error: "Describe the image you want to create." }, { status: 400 });
  }

  const { prompt, style } = body as { prompt: unknown; style?: unknown };
  if (typeof prompt !== "string" || prompt.trim().length < 3) {
    return Response.json({ error: "Prompt cannot be empty." }, { status: 400 });
  }
  if (prompt.length > 1600) {
    return Response.json({ error: "Write a prompt between 3 and 1,600 characters." }, { status: 400 });
  }

  const supplied = request.headers.get("x-google-generative-ai-api-key")?.trim();
  if (supplied && !isValidGeminiKeyFormat(supplied)) {
    return Response.json({ error: KEY_FORMAT_ERROR, code: "bad_format" }, { status: 400 });
  }

  const key = supplied || serverKey();
  if (!key || !isValidGeminiKeyFormat(key)) {
    return Response.json({ error: KEY_FORMAT_ERROR, code: "bad_format" }, { status: 401 });
  }

  const verified = auth.user;
  const rate = await allowDistributed(request, "image", 6, 40, { verifiedUserId: verified?.id ?? null });
  if (!rate.allowed) {
    const retryAfter = Math.max(1, Math.ceil(rate.retryAfterMs / 1000));
    return Response.json(
      { error: LIMIT_MESSAGE, code: "rate" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const selectedStyle = typeof style === "string" && styles.has(style) ? style : "Cinematic";
  const userPrompt = prompt.trim();
  const styledPrompt = `${userPrompt}, ${selectedStyle} visual style, rich lighting and fine detail`;

  // 1. Validate key + craft an enhanced visual prompt via Gemini Flash fallback chain
  const promptResult = await generateGeminiTextWithFallback({
    apiKey: key,
    systemInstruction:
      "You are an expert visual prompt engineer. Rewrite the user's image idea into one concise, vivid single-paragraph image prompt under 45 words in the requested style. Output only the prompt text, no quotes or preamble.",
    prompt: `Idea: ${userPrompt}\nStyle: ${selectedStyle}`,
    maxOutputTokens: 120,
    temperature: 0.7,
  });

  if (!promptResult.ok) {
    return Response.json(
      { error: promptResult.error.message, code: promptResult.error.code },
      { status: promptResult.error.status },
    );
  }

  const enhancedPrompt = promptResult.text || styledPrompt;

  // 2. Try native Gemini image generation first
  const native = await tryGeminiNativeImage(enhancedPrompt, key);
  if (native.ok) {
    return Response.json(
      {
        image: native.data.url,
        url: native.data.url,
        prompt: userPrompt,
        enhancedPrompt,
        style: selectedStyle,
        provider: native.data.provider,
        model: native.data.model,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // Never hide an auth, quota, or network error!
  if (
    native.error.code === "invalid_key" ||
    native.error.code === "quota_exceeded" ||
    native.error.code === "network"
  ) {
    return Response.json(
      { error: native.error.message, code: native.error.code },
      { status: native.error.status },
    );
  }

  // 3. When native image models are unavailable on a free-tier key (404),
  // render the Gemini-crafted prompt via Flux.
  try {
    const rendered = await renderWithFluxPrompt(enhancedPrompt, promptResult.model);
    return Response.json(
      {
        image: rendered.url,
        url: rendered.url,
        prompt: userPrompt,
        enhancedPrompt,
        style: selectedStyle,
        provider: rendered.provider,
        model: rendered.model,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Image rendering failed right now. Please try again shortly." },
      { status: 502 },
    );
  }
}
