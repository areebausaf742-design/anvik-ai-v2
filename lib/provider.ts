import { isValidGeminiKeyFormat } from "@/lib/gemini";

export const GEMINI_BASE_URL =
  process.env.GEMINI_BASE_URL?.trim() || "https://generativelanguage.googleapis.com/v1beta";

export const AI_MODEL = process.env.ANVIK_MODEL ?? "gemini-2.0-flash";
export const LIVE_MODEL = AI_MODEL;

export function serverKey(): string | undefined {
  const key =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim();
  return key || undefined;
}

export const liveKey = serverKey;

export function clientKey(request: Request): string | undefined {
  const key = request.headers.get("x-google-generative-ai-api-key")?.trim();
  if (!isValidGeminiKeyFormat(key)) return undefined;
  return key;
}

export function resolveKey(request: Request): string | undefined {
  return clientKey(request) ?? serverKey();
}

export type Usage = {
  promptTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
};

const MAX_OUTPUT_TOKENS = 600;

const SYSTEM = `You are ANVIK, a plain-spoken, helpful personal AI.
Answer the user's actual question accurately and directly in the language they wrote in (English, Devanagari Hindi, or Roman Hinglish).`;

export async function openLive(question: string, signal?: AbortSignal): Promise<Response> {
  const key = serverKey();
  if (!key) throw new Error("no key");
  return fetch(
    `${GEMINI_BASE_URL}/models/${LIVE_MODEL}:streamGenerateContent?alt=sse`,
    {
      method: "POST",
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: question }] }],
        generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS, temperature: 0.4 },
      }),
      signal,
    },
  );
}

export async function* parseLive(
  body: ReadableStream<Uint8Array>,
  usage: Usage,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (!raw || raw === "[DONE]") continue;
        let frame: {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
          usageMetadata?: {
            promptTokenCount?: number;
            candidatesTokenCount?: number;
            cachedContentTokenCount?: number;
          };
        };
        try {
          frame = JSON.parse(raw);
        } catch {
          continue;
        }
        const text = frame.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
        if (text) yield text;
        if (frame.usageMetadata) {
          usage.promptTokens = frame.usageMetadata.promptTokenCount;
          usage.outputTokens = frame.usageMetadata.candidatesTokenCount;
          usage.cachedTokens = frame.usageMetadata.cachedContentTokenCount;
        }
      }
    }
  } finally {
    reader.releaseLock();
    void signal;
  }
}
