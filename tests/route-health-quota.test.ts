import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/* Health route is side-effect free: no key, no fetch, no Supabase. */
type HealthModule = typeof import("../app/api/health/route");
type QuotaModule = typeof import("../app/api/quota/route");
let healthGET: HealthModule["GET"];
let quotaGET: QuotaModule["GET"];

test.before(async () => {
  healthGET = (await import("../app/api/health/route")).GET;
  quotaGET = (await import("../app/api/quota/route")).GET;
  delete process.env.SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_ANON_KEY;
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
});

test("quota returns the full locked shape with a valid server key", async () => {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = "AIzaSyTestKey1234567890123456789012345678";
  try {
    mock.method(globalThis, "fetch", async () => new Response("{}", { status: 200 }));
    const response = await quotaGET(new Request("http://localhost/api/quota"));
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
    mock.method(globalThis, "fetch", async () =>
      new Response(JSON.stringify({ error: { message: "API key not valid" } }), { status: 400 }),
    );
    const response = await quotaGET(new Request("http://localhost/api/quota"));
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
      mock.method(globalThis, "fetch", async () =>
        new Response("temporarily unavailable", { status }),
      );
      const response = await quotaGET(new Request("http://localhost/api/quota"));
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
  const response = await quotaGET(new Request("http://localhost/api/quota"));
  const body = await response.json();
  assert.equal(body.hasServerKey, false);
  assert.equal(body.status, "not_configured");
  assert.equal(body.limit, 10);
});
