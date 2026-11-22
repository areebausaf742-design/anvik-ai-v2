/**
 * /api/test-key — the one endpoint that proves a caller's OWN key.
 *
 * Deliberate security posture (audit priority 2):
 *  - never uses the server key — an anonymous caller cannot probe or burn it
 *  - a valid client key is required (no body/bodyless calls → 400)
 *  - bad format → 400 before any work
 *  - AI-backed work is protected by the distributed limiter (fallback: memory)
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

const VALID_KEY = "AIzaSyTestKey1234567890123456789012345678";

import { _resetRateLimits } from "../lib/rate-limit";

type RouteModule = typeof import("../app/api/test-key/route");
let POST: RouteModule["POST"];

function makeRequest(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/test-key", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-vercel-forwarded-for": "203.0.113.190", ...headers },
    body: JSON.stringify(body),
  });
}

test.before(async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  POST = (await import("../app/api/test-key/route")).POST;
});

test.afterEach(() => {
  mock.restoreAll();
  _resetRateLimits();
});

function fakeGeminiFetch(answer = "OK") {
  mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    assert.ok(url.includes("generativelanguage.googleapis.com"), `unexpected url ${url}`);
    const body = JSON.parse(String(init?.body ?? "{}")) as { contents?: unknown };
    assert.ok(body.contents, "expected contents to be sent");
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const frame = JSON.stringify({ candidates: [{ content: { parts: [{ text: answer }] } }] });
        controller.enqueue(encoder.encode(`data: ${frame}\n\n`));
        controller.close();
      },
    });
    return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
  });
}

test("a caller without a key is rejected — no server key is ever used", async () => {
  const response = await POST(makeRequest({}));
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.code, "no_key");
});

test("a badly-formatted key is rejected before any work is done", async () => {
  const response = await POST(makeRequest({ apiKey: "definitely-not-a-key" }));
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.code, "bad_format");
});

test("a valid key for itself is tested and passes", async () => {
  fakeGeminiFetch("OK");
  const response = await POST(
    makeRequest({ apiKey: VALID_KEY }, { "x-google-generative-ai-api-key": VALID_KEY }),
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.model, "gemini-2.5-flash");
});

test("AI-backed work is rate-limited (memory fallback): 7th request in a minute is denied", async () => {
  _resetRateLimits();
  fakeGeminiFetch("OK");
  let lastStatus = 0;
  let retryAfter: string | null = null;
  for (let i = 0; i < 7; i++) {
    const response = await POST(
      makeRequest({ apiKey: VALID_KEY }, { "x-google-generative-ai-api-key": VALID_KEY }),
    );
    lastStatus = response.status;
    retryAfter = response.headers.get("retry-after");
  }
  assert.equal(lastStatus, 429);
  assert.ok(retryAfter, "429 must carry a Retry-After header");
});

test("no-key requests never burn a rate-limit slot (the 400 precedes any bucket work)", async () => {
  _resetRateLimits();
  // 8 requests, all without a key — all 400 — the rate limiter never consumes.
  for (let i = 0; i < 8; i++) {
    const response = await POST(makeRequest({}));
    assert.equal(response.status, 400);
  }
});
