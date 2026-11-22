import { cookies } from "next/headers";
import { modes, type ModeId } from "@/lib/prompts";
import { serverKey } from "@/lib/provider";
import { store } from "@/lib/store";
import { allow, clientIdentity, LIMIT_MESSAGE } from "@/lib/rate-limit";
import { CHAT_MAX_TOKENS, CODE_MAX_TOKENS, MAX_TEMPERATURE } from "@/lib/credit";
import { memoryInstruction, type Memory } from "@/lib/learning";
import {
  isValidGeminiKeyFormat,
  openGeminiStreamWithFallback,
  type GeminiTurn,
} from "@/lib/gemini";

export const maxDuration = 60;
const validModes = new Set<string>(modes.map(({ id }) => id));

const modeInstructions: Record<ModeId, string> = {
  fast: "Keep answers concise and prioritize the quickest useful response.",
  smart: "Think carefully and provide a clear, accurate, well-reasoned answer.",
  creative: "Explore fresh angles and expressive ideas while staying relevant to the question.",
  coder: "Be precise about code, include clean runnable examples, and explain key decisions clearly.",
};

const SYSTEM = [
  "You are ANVIK, a sharp, warm, and deeply knowledgeable personal AI assistant.",
  "Always answer the user's exact question directly on its own topic. Never switch topics.",
  "Use clean Markdown when it improves readability (headings, bullet lists, fenced code blocks).",
  "Answer in the same language the user wrote in (English, Devanagari Hindi, or Roman Hinglish).",
  "Never claim to have performed external actions or invent links, phone numbers, or statistics.",
].join(" ");

function readMemory(input: unknown): Memory | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Partial<Memory>;
  const lang = raw.lang === "hi" || raw.lang === "hi-Latn" ? raw.lang : "en";
  const style = raw.style === "detailed" || raw.style === "coder" ? raw.style : "short";
  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 40) : "";
  if (!name && lang === "en" && style === "short") return null;
  return { name, lang, style, updatedAt: Date.now() };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send a valid JSON body with a messages array." }, { status: 400 });
  }

  if (!body || typeof body !== "object" || !("messages" in body)) {
    return Response.json({ error: "A conversation is required." }, { status: 400 });
  }

  const { messages, mode, temperature, memory } = body as {
    messages: unknown;
    mode?: unknown;
    temperature?: unknown;
    memory?: unknown;
  };
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 40) {
    return Response.json({ error: "Send between 1 and 40 messages." }, { status: 400 });
  }

  const safeMessages = messages.filter(
    (message): message is { role: "user" | "assistant"; content: string } =>
      !!message &&
      typeof message === "object" &&
      "role" in message &&
      "content" in message &&
      ((message as { role: unknown }).role === "user" ||
        (message as { role: unknown }).role === "assistant") &&
      typeof (message as { content: unknown }).content === "string" &&
      (message as { content: string }).content.trim().length > 0 &&
      (message as { content: string }).content.length <= 12000,
  );
  if (
    safeMessages.length !== messages.length ||
    safeMessages[safeMessages.length - 1]?.role !== "user"
  ) {
    return Response.json(
      { error: "Prompt cannot be empty. Write a message and try again." },
      { status: 400 },
    );
  }

  const suppliedClientKey = request.headers.get("x-google-generative-ai-api-key")?.trim();
  const validClientKey = isValidGeminiKeyFormat(suppliedClientKey) ? suppliedClientKey : undefined;
  const configuredServerKey = serverKey();
  const key = validClientKey || configuredServerKey;
  if (!key) {
    return Response.json(
      { error: "ANVIK free key is not set. Connect your own key to continue.", code: "no_server_key" },
      { status: 401 },
    );
  }
  if (!isValidGeminiKeyFormat(key)) {
    return Response.json(
      { error: "ANVIK server key is not valid. Please try again later.", code: "invalid_server_key" },
      { status: 401 },
    );
  }

  if (!allow(clientIdentity(request, request.headers.get("x-anvik-device")), 16, 150)) {
    return Response.json({ error: LIMIT_MESSAGE, code: "rate_limit" }, { status: 429 });
  }

  if (!validClientKey) {
    const jar = await cookies();
    const deviceId = jar.get("anvik_dev")?.value ?? "nodev";
    const remaining = await store.decrementQuota(deviceId);
    if (remaining === null) {
      return Response.json(
        {
          error: "Free limit reached. Connect your own key to continue unlimited.",
          code: "free_limit_reached",
          remaining: 0,
        },
        { status: 429 },
      );
    }
  }

  const selectedMode = (validModes.has(String(mode)) ? mode : "smart") as ModeId;
  const remembered = readMemory(memory);
  const systemInstruction = [
    SYSTEM,
    modeInstructions[selectedMode],
    remembered ? memoryInstruction(remembered) : "",
  ]
    .filter(Boolean)
    .join(" ");

  const tokenCap = selectedMode === "coder" ? CODE_MAX_TOKENS : CHAT_MAX_TOKENS;
  const requested = typeof temperature === "number" ? temperature : 0.65;
  const safeTemperature = Math.max(0, Math.min(MAX_TEMPERATURE, requested));

  const contents: GeminiTurn[] = safeMessages.map((turn) => ({
    role: turn.role === "assistant" ? "model" : "user",
    parts: [{ text: turn.content }],
  }));

  try {
    const result = await openGeminiStreamWithFallback({
      apiKey: key,
      systemInstruction,
      contents,
      temperature: safeTemperature,
      maxOutputTokens: tokenCap,
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
        "X-Content-Type-Options": "nosniff",
        "X-ANVIK-SOURCE": "gemini",
        "X-ANVIK-MODEL": result.model,
        "X-ANVIK-LABEL": "ANVIK",
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return new Response(null, { status: 499 });
    }
    return Response.json(
      { error: "No internet. Try again", detail: "No internet. Try again", code: "network" },
      { status: 503 },
    );
  }
}
