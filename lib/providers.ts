export type ProviderCategory = "builtin" | "cloud" | "local" | "custom";

export type Provider = {
  id: string;
  name: string;
  category: ProviderCategory;
  badge: string;
  logo?: string;
  defaultBaseUrl?: string;
  isLocal?: boolean;
};

export const PROVIDERS: Provider[] = [
  { id: "anvik", name: "ANVIK Built-in", category: "builtin", badge: "ANV" },
  { id: "gemini", name: "Google Gemini", category: "cloud", badge: "GEM" },
  { id: "openai", name: "OpenAI", category: "cloud", badge: "OPE" },
  { id: "anthropic", name: "Anthropic Claude", category: "cloud", badge: "ANT" },
  { id: "deepseek", name: "DeepSeek", category: "cloud", badge: "DEE" },
  { id: "grok", name: "xAI Grok", category: "cloud", badge: "XAI" },
  { id: "openrouter", name: "OpenRouter", category: "cloud", badge: "OPE" },
  { id: "groq", name: "Groq", category: "cloud", badge: "GRO" },
  { id: "mistral", name: "Mistral AI", category: "cloud", badge: "MIS" },
  { id: "perplexity", name: "Perplexity", category: "cloud", badge: "PER" },
  { id: "together", name: "Together AI", category: "cloud", badge: "TOG" },
  { id: "fireworks", name: "Fireworks AI", category: "cloud", badge: "FIR" },
  { id: "nvidia", name: "NVIDIA NIM", category: "cloud", badge: "NVI" },
  { id: "cerebras", name: "Cerebras", category: "cloud", badge: "CER" },
  { id: "cohere", name: "Cohere", category: "cloud", badge: "COH" },
  { id: "huggingface", name: "Hugging Face", category: "cloud", badge: "HUG" },
  { id: "qwen", name: "Alibaba Qwen", category: "cloud", badge: "QWE" },
  { id: "kimi", name: "Moonshot Kimi", category: "cloud", badge: "KIM" },
  { id: "glm", name: "Zhipu GLM", category: "cloud", badge: "ZHI" },
  { id: "deepinfra", name: "DeepInfra", category: "cloud", badge: "DEE" },
  { id: "ollama", name: "Ollama", category: "local", badge: "OLL", defaultBaseUrl: "http://localhost:11434/v1", isLocal: true },
  { id: "lmstudio", name: "LM Studio", category: "local", badge: "LMS", defaultBaseUrl: "http://localhost:1234/v1", isLocal: true },
  { id: "localopenai", name: "Local OpenAI-Compatible", category: "local", badge: "LOC", isLocal: true },
  { id: "custom", name: "Custom Provider", category: "custom", badge: "CUS" },
];

export function monogram(name: string): string {
  return name.trim().slice(0, 3).toUpperCase();
}

export function isLocalProvider(id: string): boolean {
  return PROVIDERS.find((p) => p.id === id)?.isLocal === true;
}
