import test from "node:test";
import assert from "node:assert/strict";
import {
  PROVIDERS,
  monogram,
  isLocalProvider,
  getProviderBadge,
  getActiveProviderId,
  setActiveProviderId,
  getProviderConfig,
  saveProviderConfig,
} from "../lib/providers";

test("provider registry includes built-in default", () => {
  assert.ok(PROVIDERS.find((p) => p.id === "anvik"));
});

test("provider registry includes 18+ cloud providers", () => {
  const cloud = PROVIDERS.filter((p) => p.category === "cloud");
  assert.ok(cloud.length >= 18);
});

test("provider registry includes local providers", () => {
  for (const id of ["ollama", "lmstudio", "localopenai"]) {
    assert.ok(PROVIDERS.find((p) => p.id === id), id);
  }
});

test("provider registry includes custom", () => {
  assert.ok(PROVIDERS.find((p) => p.id === "custom"));
});

test("monogram generates 3 letters", () => {
  assert.equal(monogram("DeepSeek"), "DEE");
  assert.equal(monogram("Ollama"), "OLL");
  assert.equal(monogram("LM Studio"), "LMS");
});

test("getProviderBadge returns official icon keys", () => {
  assert.equal(getProviderBadge("gemini").icon, "google-gemini");
  assert.equal(getProviderBadge("openai").icon, "openai");
  assert.equal(getProviderBadge("anthropic").icon, "anthropic");
});

test("getProviderBadge returns 3-letter monograms", () => {
  assert.equal(getProviderBadge("deepseek").monogram, "DEE");
  assert.equal(getProviderBadge("ollama").monogram, "OLL");
  assert.equal(getProviderBadge("lmstudio").monogram, "LMS");
  assert.equal(getProviderBadge("custom").monogram.length, 3);
});

test("local providers flagged", () => {
  assert.equal(isLocalProvider("ollama"), true);
  assert.equal(isLocalProvider("openai"), false);
});

test("localStorage persistence", () => {
  // jsdom not available; use global localStorage shim
  const store: Record<string, string> = {};
  const ls = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
  (globalThis as any).localStorage = ls;
  setActiveProviderId("openai");
  assert.equal(getActiveProviderId(), "openai");
  saveProviderConfig("openai", { apiKey: "sk-test", baseUrl: "https://x", modelId: "gpt-4o" });
  const cfg = getProviderConfig("openai");
  assert.equal(cfg.apiKey, "sk-test");
  assert.equal(cfg.modelId, "gpt-4o");
});

test("cloud vs local routing", () => {
  const { isLocalProvider } = require("../lib/providers");
  assert.equal(isLocalProvider("ollama"), true);
  assert.equal(isLocalProvider("openai"), false);
});

test("secret redaction", () => {
  const { redactSecret } = require("../lib/providers");
  const r = redactSecret("sk-secret123456");
  assert.ok(!r.includes("secret123456"));
});
