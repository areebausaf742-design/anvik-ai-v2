import test from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_MODELS,
  CHAT_MAX_TOKENS,
  CODE_MAX_TOKENS,
  MAX_TEMPERATURE,
  PAID_MAX_TOKENS,
  isAllowedModel,
} from "../lib/credit";

test("only flash fallback chain models are callable, and Pro can never be configured in", () => {
  assert.deepEqual(ALLOWED_MODELS, [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
  ]);
  assert.equal(isAllowedModel("gemini-2.5-flash"), true);
  assert.equal(isAllowedModel("gemini-2.0-flash"), true);
  assert.equal(isAllowedModel("  GEMINI-2.0-FLASH-LITE "), true);
  assert.equal(isAllowedModel("gemini-2.5-pro"), false);
  assert.equal(isAllowedModel("gemini-3-pro"), false);
});

test("output and temperature ceilings are enforced as constants", () => {
  assert.equal(CHAT_MAX_TOKENS, 2048);
  assert.equal(CODE_MAX_TOKENS, 2048);
  assert.equal(PAID_MAX_TOKENS, 4096);
  assert.equal(PAID_MAX_TOKENS > CHAT_MAX_TOKENS, true);
  assert.ok(MAX_TEMPERATURE <= 0.9);
});

test("credit.ts exposes nothing that can produce an answer", async () => {
  const credit = (await import("../lib/credit")) as Record<string, unknown>;
  for (const name of [
    "localAnswer",
    "corpusAnswer",
    "cacheKey",
    "memoryGet",
    "memorySet",
    "prepareHistory",
    "creditLabel",
  ]) {
    assert.equal(credit[name], undefined, `${name} must not exist — it answered without the model`);
  }
});
