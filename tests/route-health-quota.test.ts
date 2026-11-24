import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/* Health route is side-effect free: no key, no fetch, no Supabase. */
type HealthModule = typeof import("../app/api/health/route");
type QuotaModule = typeof import("../app/api/quota/route");
let healthGET: HealthModule["GET"];
let quotaGET: QuotaModule["GET"];

test.before(async () => {
  // /api/quota now requires a verified account, so auth must be configured
  // before the route module imports (session.ts reads these at import time).
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.test";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  delete process.env.SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_ANON_KEY;
  healthGET = (await import("../app/api/health/route")).GET;
  quotaGET = (await import("../app/api/quota/route")).GET;
});

/**
 * /api/quota now requires a verified account, so every quota test sends a
 * bearer token and stubs the one identity call it needs. `extra` lets a test
 * additionally answer the Gemini key probe and the credit read.
 */
function authedQuotaRequest(extra?: (url: string) => Response | null) {
  mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = String(input);
    const handled = extra?.(url);
    if (handled) return handled;
    if (url.endsWith("/auth/v1/user")) {
      return Response.json({
        id: "quota-test-user",
        email: "quota@example.test",
        app_metadata: { provider: "email" },
        user_metadata: { name: "Quota Tester" },
      });
    }
    // No credit rows: readCredits degrades to the free tier.
    return Response.json([], { status: 200 });
  });
  return new Request("http://localhost/api/quota", {
    headers: { Authorization: "Bearer quota-test-session-token" },
  });
}

test("quota refuses a signed-out caller instead of inventing an allowance", async () => {
  // The old route reported `remaining: 10` to anyone, read from a per-IP
  // counter that nothing incremented. Guests now get a 401.
  const response = await quotaGET(new Request("http://localhost/api/quota"));
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.code, "unauthenticated");
});

test.afterEach(() => {
  mock.restoreAll();
});

test("health returns ok with the default model", async () => {
  const response = await healthGET();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "ok");
  assert.equal(body.model, "gemini-2.5-flash");
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("health reports configured integrations — never a secret, never a live probe", async () => {
  const response = await healthGET();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(body.configured && typeof body.configured === "object");
  assert.equal(typeof body.configured.supabase, "boolean");
  assert.equal(typeof body.configured.serverKey, "boolean");
  assert.equal(typeof body.configured.auth, "boolean");
  // The response must never carry env values — no service key, no anon key,
  // no random bearer token material.
  const serialized = JSON.stringify(body);
  assert.doesNotMatch(serialized, /test-key/i);
  assert.doesNotMatch(serialized, /service-role/i);
  assert.doesNotMatch(serialized, /AIzaSy/);
});

test("quota returns the full locked shape with a valid server key", async () => {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = "AIzaSyTestKey1234567890123456789012345678";
  try {
    const response = await quotaGET(
      authedQuotaRequest((url) => (url.includes("generativelanguage") ? new Response("{}", { status: 200 }) : null)),
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(
      {
        hasServerKey: body.hasServerKey,
        status: body.status,
        remaining: body.remaining,
        googleStatus: body.googleStatus,
        modelUsed: body.modelUsed,
        limit: body.limit,
      },
      {
        hasServerKey: true,
        status: "ok",
        remaining: 10, // fresh process, no stored rows
        googleStatus: 200,
        modelUsed: "gemini-2.5-flash",
        limit: 10,
      },
    );
  } finally {
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  }
});

test("quota reports invalid_server_key only when Google says the key is not valid", async () => {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = "AIzaSyTestKey1234567890123456789012345678";
  try {
    const response = await quotaGET(
      authedQuotaRequest((url) =>
        url.includes("generativelanguage")
          ? new Response(JSON.stringify({ error: { message: "API key not valid" } }), { status: 400 })
          : null,
      ),
    );
    const body = await response.json();
    assert.equal(body.status, "invalid_server_key");
    assert.equal(body.googleStatus, 400);
  } finally {
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  }
});

test("quota never reports invalid_server_key for a 429 or 500 from Google", async () => {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = "AIzaSyTestKey1234567890123456789012345678";
  try {
    for (const status of [429, 500]) {
      const response = await quotaGET(
        authedQuotaRequest((url) =>
          url.includes("generativelanguage")
            ? new Response("temporarily unavailable", { status })
            : null,
        ),
      );
      const body = await response.json();
      assert.notEqual(body.status, "invalid_server_key");
      assert.equal(body.googleStatus, status);
      mock.restoreAll();
    }
  } finally {
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  }
});

test("quota reports not_configured with no key at all", async () => {
  delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  const response = await quotaGET(authedQuotaRequest());
  const body = await response.json();
  assert.equal(body.hasServerKey, false);
  assert.equal(body.status, "not_configured");
  assert.equal(body.limit, 10);
});
