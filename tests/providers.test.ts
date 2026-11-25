import test from "node:test";
import assert from "node:assert/strict";
import { PROVIDERS, monogram, isLocalProvider } from "../lib/providers";

test("provider registry includes built-in default", () => {
  assert.ok(PROVIDERS.find((p) => p.id === "anvik"));
});

test("monogram generates 3 letters", () => {
  assert.equal(monogram("DeepSeek"), "DEE");
  assert.equal(monogram("Ollama"), "OLL");
});

test("local providers flagged", () => {
  assert.equal(isLocalProvider("ollama"), true);
  assert.equal(isLocalProvider("openai"), false);
});

test("secret redaction", () => {
  const key = "sk-secret123";
  const redacted = key.replace(/sk-[A-Za-z0-9]+/, "sk-[REDACTED]");
  assert.ok(!redacted.includes("secret123"));
});
