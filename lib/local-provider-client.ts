import { isLocalProvider, getProviderConfig, getActiveProviderId } from "@/lib/providers";

export type LocalChatMessage = { role: "user" | "assistant" | "system"; content: string };

export function isActiveProviderLocal(): boolean {
  return isLocalProvider(getActiveProviderId());
}

export async function* streamLocalChat(
  messages: LocalChatMessage[],
  signal?: AbortSignal,
): AsyncGenerator<string, void, unknown> {
  const id = getActiveProviderId();
  const cfg = getProviderConfig(id);
  const baseUrl = (cfg.baseUrl || "").replace(/\/$/, "");
  const model = cfg.modelId || "local-model";
  const apiKey = cfg.apiKey || "";
  if (!baseUrl) throw new Error("No base URL configured for local provider.");
  const endpoint = /\/v1$/.test(baseUrl) ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`Local server unreachable or CORS blocked (${res.status}). Ensure your local server (Ollama/LM Studio) is running and allows CORS.`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const json = JSON.parse(data);
        const delta = json?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) yield delta;
      } catch {
        // ignore
      }
    }
  }
}