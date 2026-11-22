import test from "node:test";
import assert from "node:assert/strict";
import {
  KEY_FORMAT_ERROR,
  KEY_INVALID_ERROR,
  MODEL_FALLBACK_CHAIN,
  NETWORK_ERROR,
  QUOTA_ERROR,
  classifyGeminiError,
  isValidGeminiKeyFormat,
  openGeminiStreamWithFallback,
  validateGeminiServerKey,
} from "../lib/gemini";

const VALID_TEST_KEY = "AIzaSyTestKey1234567890123456789012345";

function sseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        const frame = JSON.stringify({
          candidates: [{ content: { parts: [{ text: chunk }] } }],
        });
        controller.enqueue(encoder.encode(`data: ${frame}\n\n`));
      }
      controller.close();
    },
  });
}

test("isValidGeminiKeyFormat validates AIza prefix and >=35 length", () => {
  assert.equal(isValidGeminiKeyFormat(VALID_TEST_KEY), true);
  assert.equal(isValidGeminiKeyFormat(`  ${VALID_TEST_KEY}  `), true);
  assert.equal(isValidGeminiKeyFormat(""), false);
  assert.equal(isValidGeminiKeyFormat("AIzaTooShort"), false);
  assert.equal(isValidGeminiKeyFormat("sk-123456789012345678901234567890123456"), false);
});

test("server key validation flags only Google's explicit invalid-key response", async () => {
  const valid = await validateGeminiServerKey(VALID_TEST_KEY, async () => new Response("{}", { status: 200 }));
  assert.deepEqual(valid, { googleStatus: 200, invalid: false });

  const invalid = await validateGeminiServerKey(
    VALID_TEST_KEY,
    async () => new Response('{"error":{"message":"API key not valid"}}', { status: 400 }),
  );
  assert.deepEqual(invalid, { googleStatus: 400, invalid: true });

  for (const status of [403, 404, 429, 500]) {
    const result = await validateGeminiServerKey(
      VALID_TEST_KEY,
      async () => new Response("Model access unavailable", { status }),
    );
    assert.equal(result.invalid, false);
    assert.equal(result.googleStatus, status);
  }
});

test("classifyGeminiError marks a key invalid only when Google explicitly says so", () => {
  const unauth = classifyGeminiError(401, '{"error":{"status":"UNAUTHENTICATED"}}');
  assert.notEqual(unauth.code, "invalid_key");

  const explicitInvalid = classifyGeminiError(400, '{"error":{"message":"API key not valid"}}');
  assert.equal(explicitInvalid.message, KEY_INVALID_ERROR);
  assert.equal(explicitInvalid.code, "invalid_key");

  const forbidden = classifyGeminiError(403, "API_KEY_INVALID");
  assert.equal(forbidden.message, KEY_INVALID_ERROR);
  assert.equal(forbidden.code, "invalid_key");

  const quota = classifyGeminiError(429, "RESOURCE_EXHAUSTED");
  assert.equal(quota.message, QUOTA_ERROR);
  assert.equal(quota.code, "quota_exceeded");
});

test("openGeminiStreamWithFallback rejects invalid key before calling fetch", async () => {
  let called = false;
  const result = await openGeminiStreamWithFallback({
    apiKey: "bad-key",
    systemInstruction: "test",
    contents: [{ role: "user", parts: [{ text: "what is car?" }] }],
    fetchImpl: async () => {
      called = true;
      throw new Error("should not run");
    },
  });
  assert.equal(called, false);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.message, KEY_FORMAT_ERROR);
    assert.equal(result.error.code, "bad_format");
  }
});

test("falls back 2.5-flash -> 2.0-flash -> 2.0-flash-lite on 404 and streams tokens immediately", async () => {
  const attempted: string[] = [];
  const result = await openGeminiStreamWithFallback({
    apiKey: VALID_TEST_KEY,
    systemInstruction: "Answer directly.",
    contents: [{ role: "user", parts: [{ text: "what is car?" }] }],
    fetchImpl: async (input) => {
      const url = String(input);
      attempted.push(url);
      if (!url.includes("gemini-2.0-flash-lite")) {
        return new Response("Not Found", { status: 404 });
      }
      return new Response(sseStream(["A car ", "is a wheeled vehicle."]), { status: 200 });
    },
  });

  assert.equal(attempted.length, 3);
  assert.ok(attempted[0].includes(MODEL_FALLBACK_CHAIN[0]));
  assert.ok(attempted[1].includes(MODEL_FALLBACK_CHAIN[1]));
  assert.ok(attempted[2].includes(MODEL_FALLBACK_CHAIN[2]));

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.model, "gemini-2.0-flash-lite");
    const text = await new Response(result.stream).text();
    assert.equal(text, "A car is a wheeled vehicle.");
  }
});

test("stops immediately on 401 or 429 without cascading 404 fallback", async () => {
  let calls = 0;
  const res401 = await openGeminiStreamWithFallback({
    apiKey: VALID_TEST_KEY,
    systemInstruction: "test",
    contents: [{ role: "user", parts: [{ text: "hii" }] }],
    fetchImpl: async () => {
      calls += 1;
      return new Response("API key not valid", { status: 401 });
    },
  });
  assert.equal(calls, 1);
  assert.equal(res401.ok, false);
  if (!res401.ok) assert.equal(res401.error.message, KEY_INVALID_ERROR);

  calls = 0;
  const res429 = await openGeminiStreamWithFallback({
    apiKey: VALID_TEST_KEY,
    systemInstruction: "test",
    contents: [{ role: "user", parts: [{ text: "hii" }] }],
    fetchImpl: async () => {
      calls += 1;
      return new Response("Quota exceeded", { status: 429 });
    },
  });
  assert.equal(calls, 1);
  assert.equal(res429.ok, false);
  if (!res429.ok) assert.equal(res429.error.message, QUOTA_ERROR);
});

test("network failure maps honestly to No internet. Try again", async () => {
  const result = await openGeminiStreamWithFallback({
    apiKey: VALID_TEST_KEY,
    systemInstruction: "test",
    contents: [{ role: "user", parts: [{ text: "what is AI?" }] }],
    fetchImpl: async () => {
      throw new TypeError("fetch failed");
    },
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.message, NETWORK_ERROR);
    assert.equal(result.error.code, "network");
  }
});
