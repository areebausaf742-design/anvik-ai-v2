export type ProviderCategory = "builtin" | "cloud" | "local" | "custom";

export type ProviderBadge = {
  /** Official SVG icon key for Google Gemini, OpenAI, Anthropic; otherwise null. */
  icon: string | null;
  /** 3-letter uppercase monogram. */
  monogram: string;
};

export type Provider = {
  id: string;
  name: string;
  category: ProviderCategory;
  badge: string;
  logo?: string;
  icon?: string | null;
  defaultBaseUrl?: string;
  apiKeyUrl?: string;
  modelPresets?: string[];
  isLocal?: boolean;
};

const OFFICIAL_ICON_KEYS: Record<string, string> = {
  gemini: "google-gemini",
  openai: "openai",
  anthropic: "anthropic",
};

export const PROVIDERS: Provider[] = [
  { id: "anvik", name: "ANVIK Built-in", category: "builtin", badge: "ANV", icon: null },
  { id: "gemini", name: "Google Gemini", category: "cloud", badge: "GEM", icon: "google-gemini", apiKeyUrl: "https://aistudio.google.com/app/apikey", defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", modelPresets: ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-pro"] },
  { id: "openai", name: "OpenAI", category: "cloud", badge: "OPE", icon: "openai", apiKeyUrl: "https://platform.openai.com/api-keys", defaultBaseUrl: "https://api.openai.com/v1", modelPresets: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "o3-mini"] },
  { id: "anthropic", name: "Anthropic Claude", category: "cloud", badge: "ANT", icon: "anthropic", apiKeyUrl: "https://console.anthropic.com/settings/keys", defaultBaseUrl: "https://api.anthropic.com/v1", modelPresets: ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest", "claude-3-opus-latest"] },
  { id: "deepseek", name: "DeepSeek", category: "cloud", badge: "DEE", apiKeyUrl: "https://platform.deepseek.com/api_keys", defaultBaseUrl: "https://api.deepseek.com/v1", modelPresets: ["deepseek-chat", "deepseek-reasoner"] },
  { id: "grok", name: "xAI Grok", category: "cloud", badge: "XAI", apiKeyUrl: "https://console.x.ai", defaultBaseUrl: "https://api.x.ai/v1", modelPresets: ["grok-2-latest", "grok-3-mini"] },
  { id: "openrouter", name: "OpenRouter", category: "cloud", badge: "OPE", apiKeyUrl: "https://openrouter.ai/keys", defaultBaseUrl: "https://openrouter.ai/api/v1", modelPresets: ["openai/gpt-4o", "anthropic/claude-3.5-sonnet"] },
  { id: "groq", name: "Groq", category: "cloud", badge: "GRO", apiKeyUrl: "https://console.groq.com/keys", defaultBaseUrl: "https://api.groq.com/openai/v1", modelPresets: ["llama-3.3-70b-versatile", "mixtral-8x7b-32768"] },
  { id: "mistral", name: "Mistral AI", category: "cloud", badge: "MIS", apiKeyUrl: "https://console.mistral.ai/api-keys", defaultBaseUrl: "https://api.mistral.ai/v1", modelPresets: ["mistral-large-latest", "mistral-small-latest"] },
  { id: "perplexity", name: "Perplexity", category: "cloud", badge: "PER", apiKeyUrl: "https://www.perplexity.ai/settings/api", defaultBaseUrl: "https://api.perplexity.ai", modelPresets: ["sonar", "sonar-pro"] },
  { id: "together", name: "Together AI", category: "cloud", badge: "TOG", apiKeyUrl: "https://api.together.ai/settings/api-keys", defaultBaseUrl: "https://api.together.xyz/v1", modelPresets: ["meta-llama/Llama-3.3-70B-Instruct-Turbo"] },
  { id: "fireworks", name: "Fireworks AI", category: "cloud", badge: "FIR", apiKeyUrl: "https://fireworks.ai/account/api-keys", defaultBaseUrl: "https://api.fireworks.ai/inference/v1", modelPresets: ["accounts/fireworks/models/llama-v3p1-70b-instruct"] },
  { id: "nvidia", name: "NVIDIA NIM", category: "cloud", badge: "NVI", apiKeyUrl: "https://build.nvidia.com", defaultBaseUrl: "https://integrate.api.nvidia.com/v1", modelPresets: ["meta/llama-3.1-70b-instruct"] },
  { id: "cerebras", name: "Cerebras", category: "cloud", badge: "CER", apiKeyUrl: "https://cloud.cerebras.ai", defaultBaseUrl: "https://api.cerebras.ai/v1", modelPresets: ["llama3.1-70b"] },
  { id: "cohere", name: "Cohere", category: "cloud", badge: "COH", apiKeyUrl: "https://dashboard.cohere.com/api-keys", defaultBaseUrl: "https://api.cohere.ai/v1", modelPresets: ["command-r-plus", "command-r"] },
  { id: "huggingface", name: "Hugging Face", category: "cloud", badge: "HUG", apiKeyUrl: "https://huggingface.co/settings/tokens", defaultBaseUrl: "https://api-inference.huggingface.co/v1", modelPresets: ["meta-llama/Llama-3.3-70B-Instruct"] },
  { id: "qwen", name: "Alibaba Qwen", category: "cloud", badge: "QWE", apiKeyUrl: "https://bailian.console.aliyun.com", defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", modelPresets: ["qwen-plus", "qwen-turbo"] },
  { id: "kimi", name: "Moonshot Kimi", category: "cloud", badge: "KIM", apiKeyUrl: "https://platform.moonshot.cn", defaultBaseUrl: "https://api.moonshot.cn/v1", modelPresets: ["moonshot-v1-8k", "moonshot-v1-32k"] },
  { id: "glm", name: "Zhipu GLM", category: "cloud", badge: "ZHI", apiKeyUrl: "https://open.bigmodel.cn", defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4", modelPresets: ["glm-4", "glm-4-flash"] },
  { id: "deepinfra", name: "DeepInfra", category: "cloud", badge: "DEE", apiKeyUrl: "https://deepinfra.com/dash/api_keys", defaultBaseUrl: "https://api.deepinfra.com/v1/openai", modelPresets: ["meta-llama/Llama-3.3-70B-Instruct"] },
  { id: "ollama", name: "Ollama", category: "local", badge: "OLL", defaultBaseUrl: "http://localhost:11434/v1", isLocal: true, modelPresets: ["llama3.2", "qwen2.5"] },
  { id: "lmstudio", name: "LM Studio", category: "local", badge: "LMS", defaultBaseUrl: "http://localhost:1234/v1", isLocal: true, modelPresets: ["local-model"] },
  { id: "localopenai", name: "Local OpenAI-Compatible", category: "local", badge: "LOC", defaultBaseUrl: "http://localhost:8000/v1", isLocal: true },
  { id: "custom", name: "Custom Provider", category: "custom", badge: "CUS" },
];

export function monogram(name: string): string {
  const letters = name.replace(/[^A-Za-z0-9]/g, "");
  return (letters || name.trim()).slice(0, 3).toUpperCase();
}

export function isLocalProvider(idOrProvider: string | Provider): boolean {
  const id = typeof idOrProvider === "string" ? idOrProvider : idOrProvider.id;
  const p = PROVIDERS.find((x) => x.id === id);
  if (p) return p.isLocal === true || p.category === "local";
  return false;
}

export function getProvider(id: string): Provider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function getProviderBadge(provider: string | Provider): ProviderBadge {
  const p = typeof provider === "string" ? PROVIDERS.find((x) => x.id === provider) : provider;
  const id = p?.id ?? (typeof provider === "string" ? provider : "");
  const name = p?.name ?? (typeof provider === "string" ? provider : "");
  const icon = (p?.icon ?? OFFICIAL_ICON_KEYS[id] ?? null) || null;
  // monogram overrides
  let mg = monogram(name);
  if (id === "deepseek") mg = "DEE";
  if (id === "ollama") mg = "OLL";
  if (id === "lmstudio") mg = "LMS";
  if (p?.category === "custom" && name) mg = monogram(name);
  // first 3 of custom provider name already via monogram
  return { icon, monogram: mg };
}

// localStorage persistence helpers
const STORAGE_KEY_ACTIVE = "anvik.activeProvider";
const STORAGE_KEY_CONFIG = "anvik.providerConfig";

export type ProviderConfig = {
  apiKey?: string;
  baseUrl?: string;
  modelId?: string;
};

export function getActiveProviderId(): string {
  if (typeof localStorage === "undefined") return "anvik";
  return localStorage.getItem(STORAGE_KEY_ACTIVE) || "anvik";
}

export function setActiveProviderId(id: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY_ACTIVE, id);
}

export function getProviderConfig(id: string): ProviderConfig {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CONFIG);
    const all = raw ? JSON.parse(raw) : {};
    return (all && all[id]) || {};
  } catch {
    return {};
  }
}

export function saveProviderConfig(id: string, config: ProviderConfig): void {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CONFIG);
    const all = raw ? JSON.parse(raw) : {};
    all[id] = { ...(all[id] || {}), ...config };
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(all));
  } catch {
    // ignore
  }
}

export function redactSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "*".repeat(value.length);
  return value.slice(0, 4) + "..." + value.slice(-4);
}
