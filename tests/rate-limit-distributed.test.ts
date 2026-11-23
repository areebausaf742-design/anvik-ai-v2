/**
 * Distributed rate limiting (lib/rate-limit.ts) — the production path for every
 * AI route. The real Postgres bucket decision is made by the Supabase RPC
 * consume_rate_limit; these tests mock the fetch surface and exercise:
 *
 *  - guest callers keyed by effective IP (and never by the x-anvik-device header)
 *  - verified users keyed by VERIFIED id, never by IP or by the device header
 *  - the RPC's fixed-window decision, denial semantics, and the retry hint
 *  - concurrency on the same bucket (12/min shared by 20 callers)
 *  - deliberate degradation to the bounded in-memory limiter when the RPC is
 *    unreachable or unconfigured (outage handling — the endpoint is never
 *    unprotected)
 *  - verified-user gating (no auth round-trip without an Authorization header)
 *
 * The fetch mock simulates the real RPC (fixed windows, atomic upsert), so the
 * resolved decisions are genuine — no re-implementation of bucket math here.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

// Set BEFORE importing the modules — lib/session reads env at import time.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test-supabase.example";
process.env.SUPABASE_URL = "https://test-supabase.example";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-anon-key-abc123";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key-abc123";

type RateLimitModule = typeof import("../lib/rate-limit");
type SessionModule = typeof import("../lib/session");

let allowDistributed: RateLimitModule["allowDistributed"];
let rateLimitIdentity: RateLimitModule["rateLimitIdentity"];
let _resetRateLimits: RateLimitModule["_resetRateLimits"];
let getVerifiedUserIfPresent: SessionModule["getVerifiedUserIfPresent"];

const runId = Math.floor(Math.random() * 1_000_000);

function req(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/probe", {
    method: "POST",
    headers: { "x-vercel-forwarded-for": `203.0.113.${(runId % 200) + 10}`, ...headers },
    body: "{}",
  });
}

type RpcCall = { bucket: string; limit: number; windowSeconds: number };

/**
 * Install a fetch mock that simulates consume_rate_limit: fixed-window buckets
 * tracked atomically in a process-local map. Throws when opts.outage is set,
 * mimicking a network/timeout failure — the deliberate fallback path.
 * Also understands the /auth/v1/user probe — anything else throws.
 */
function installFetchMock(opts: {
  outage?: boolean;
  denyAll?: boolean;
  authUsers?: Record<string, { id: string }>;
} = {}) {
  const rpcCalls: RpcCall[] = [];
  const authCalls: Array<{ token: string }> = [];
  const buckets = new Map<string, { windowStart: number; count: number }>();

  mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url.includes("/auth/v1/user")) {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const auth = String(headers["Authorization"] ?? "");
      const token = auth.replace(/^Bearer\s+/i, "").trim();
      authCalls.push({ token });
      const user = opts.authUsers?.[token];
      if (!user) {
        return new Response(JSON.stringify({ message: "invalid token" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({
          id: user.id,
          email: "probe@example.com",
          app_metadata: { provider: "google" },
          user_metadata: { name: "Probe User" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (url.includes("/rest/v1/rpc/consume_rate_limit")) {
      if (opts.outage) throw new Error("network down");
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        p_bucket_key: string;
        p_limit: number;
        p_window_seconds: number;
      };
      rpcCalls.push({
        bucket: body.p_bucket_key,
        limit: body.p_limit,
        windowSeconds: body.p_window_seconds,
      });
      if (opts.denyAll) {
        return new Response(JSON.stringify({ allowed: false, remaining: 0, retry_after_seconds: 9 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      const now = Date.now();
      const windowMs = body.p_window_seconds * 1000;
      const current = buckets.get(body.p_bucket_key);
      if (!current || now - current.windowStart >= windowMs) {
        buckets.set(body.p_bucket_key, { windowStart: now, count: 1 });
        return new Response(
          JSON.stringify({ allowed: true, remaining: body.p_limit - 1, retry_after_seconds: 0 }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (current.count >= body.p_limit) {
        const retry = Math.max(1, Math.ceil((current.windowStart + windowMs - now) / 1000));
        return new Response(JSON.stringify({ allowed: false, remaining: 0, retry_after_seconds: retry }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      current.count += 1;
      return new Response(
        JSON.stringify({ allowed: true, remaining: body.p_limit - current.count, retry_after_seconds: 0 }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    throw new Error(`unexpected fetch in test: ${url}`);
  });

  return {
    rpcCalls,
    getAuthCalls: () => authCalls,
  };
}

test.before(async () => {
  const rl = await import("../lib/rate-limit");
  const sm = await import("../lib/session");
  allowDistributed = rl.allowDistributed;
  rateLimitIdentity = rl.rateLimitIdentity;
  _resetRateLimits = rl._resetRateLimits;
  getVerifiedUserIfPresent = sm.getVerifiedUserIfPresent;
});

test.afterEach(() => {
  _resetRateLimits();
  mock.restoreAll();
});

test("guest requests with the same IP share one bucket; the x-anvik-device header is ignored", async () => {
  const { rpcCalls } = installFetchMock();
  const ip = "203.0.113.7";
  await allowDistributed(
    req({ "x-vercel-forwarded-for": ip, "x-anvik-device": "dev-alpha-1111" }),
    "probe",
    12,
    0,
  );
  await allowDistributed(
    req({ "x-vercel-forwarded-for": ip, "x-anvik-device": "dev-beta-2222" }),
    "probe",
    12,
    0,
  );
  assert.equal(rpcCalls.length, 2, "one minute bucket per request (perHour=0)");
  assert.equal(rpcCalls[0].bucket, rpcCalls[1].bucket, "device header must not change the bucket");
});

test("guest requests with different IPs do not share a bucket", async () => {
  const { rpcCalls } = installFetchMock();
  await allowDistributed(req({ "x-vercel-forwarded-for": "203.0.113.11" }), "probe", 12, 0);
  await allowDistributed(req({ "x-vercel-forwarded-for": "203.0.113.12" }), "probe", 12, 0);
  assert.equal(rpcCalls.length, 2);
  assert.notEqual(rpcCalls[0].bucket, rpcCalls[1].bucket, "different IPs must bucket separately");
});

test("verified users are bucketed by VERIFIED id — never by IP or the device header", async () => {
  const { rpcCalls } = installFetchMock({
    authUsers: {
      "tok-user-001": { id: "user-11111111-1111-1111-1111-111111111111" },
      "tok-user-002": { id: "user-22222222-2222-2222-2222-222222222222" },
    },
  });

  // Helper mirrors the routes: resolve the verified user first, then hand its
  // id to the limiter.
  const call = async (request: Request) => {
    const verified = await getVerifiedUserIfPresent(request);
    return allowDistributed(request, "probe", 12, 0, { verifiedUserId: verified?.id ?? null });
  };

  // Same verified user, different IPs and a different device header…
  await call(req({ authorization: "Bearer tok-user-001", "x-vercel-forwarded-for": "203.0.113.21" }));
  await call(
    req({
      authorization: "Bearer tok-user-001",
      "x-vercel-forwarded-for": "203.0.113.99",
      "x-anvik-device": "dev-9999",
    }),
  );
  // …and a different verified user sharing the same IP.
  await call(req({ authorization: "Bearer tok-user-002", "x-vercel-forwarded-for": "203.0.113.21" }));

  assert.equal(rpcCalls.length, 3);
  assert.equal(rpcCalls[0].bucket, rpcCalls[1].bucket, "same verified user → same bucket regardless of IP/device header");
  assert.notEqual(rpcCalls[0].bucket, rpcCalls[2].bucket, "different verified user → different bucket");
});

test("the RPC denial is honoured — no bypass — with the retry hint surfaced", async () => {
  installFetchMock({ denyAll: true });
  const decision = await allowDistributed(req(), "probe", 5, 0);
  assert.equal(decision.allowed, false);
  assert.equal(decision.source, "distributed");
  assert.ok(decision.retryAfterMs >= 9_000, `expected ≥ 9000ms retry hint, got ${decision.retryAfterMs}`);
});

test("hour cap is enforced from its own bucket, not the minute bucket", async () => {
  const { rpcCalls } = installFetchMock();
  const requestA = () => req({ "x-vercel-forwarded-for": "203.0.113.31" });
  const a = await allowDistributed(requestA(), "probe-hour", 60, 2);
  const b = await allowDistributed(requestA(), "probe-hour", 60, 2);
  const c = await allowDistributed(requestA(), "probe-hour", 60, 2);
  assert.equal(a.allowed, true);
  assert.equal(b.allowed, true);
  assert.equal(c.allowed, false, "hour cap of 2 must deny the third call");
  assert.equal(c.source, "distributed");
  const hourBuckets = rpcCalls.filter((call) => call.windowSeconds === 3600);
  assert.equal(hourBuckets.length, 3, "every request must consume the hour bucket");
  assert.ok(hourBuckets.every((call) => call.limit === 2));
});

test("spacing: min-spacing between calls is enforced inside the distributed path", async () => {
  installFetchMock();
  const first = await allowDistributed(req(), "probe-spacing", 60, 0, { spacingMs: 2_000 });
  assert.equal(first.allowed, true);
  const second = await allowDistributed(req(), "probe-spacing", 60, 0, { spacingMs: 2_000 });
  assert.equal(second.allowed, false, "second request inside the spacing window must be denied");
  assert.equal(second.source, "distributed");
});

test("concurrent callers on one bucket: the cap is atomic — no over-admission", async () => {
  installFetchMock();
  const request = () => req({ "x-vercel-forwarded-for": "203.0.113.55" });
  const decisions = await Promise.all(
    Array.from({ length: 20 }, () => allowDistributed(request(), "probe-race", 12, 0)),
  );
  const allowed = decisions.filter((d) => d.allowed).length;
  const denied = decisions.filter((d) => !d.allowed).length;
  assert.equal(allowed, 12, "only 12 of 20 concurrent requests may pass the 12/min cap");
  assert.equal(denied, 8);
  assert.ok(decisions.every((d) => d.source === "distributed"));
});

test("Supabase outage: degrades to the bounded in-memory limiter — never unprotected", async () => {
  installFetchMock({ outage: true });
  const request = () => req({ "x-vercel-forwarded-for": "203.0.113.66" });
  for (let i = 0; i < 12; i++) {
    const d = await allowDistributed(request(), "probe-outage", 12, 0);
    assert.equal(d.allowed, true, `request ${i + 1} should pass the memory fallback`);
    assert.equal(d.source, "memory", `request ${i + 1} should use the memory fallback`);
  }
  const denied = await allowDistributed(request(), "probe-outage", 12, 0);
  assert.equal(denied.allowed, false, "the outage fallback must still deny the 13th request");
  assert.equal(denied.source, "memory");
  assert.ok(denied.retryAfterMs >= 60_000, "memory fallback retry hint should cover the minute window");
});

test("hour cap in the outage path falls back to a faithful memory cap", async () => {
  installFetchMock({ outage: true });
  const request = () => req({ "x-vercel-forwarded-for": "203.0.113.67" });
  for (let i = 0; i < 3; i++) {
    const d = await allowDistributed(request(), "probe-hour-outage", 60, 3);
    assert.equal(d.allowed, true);
  }
  const denied = await allowDistributed(request(), "probe-hour-outage", 60, 3);
  assert.equal(denied.allowed, false, "memory fallback must still enforce the hour cap");
});

test("rateLimitIdentity never trusts the client device header", () => {
  const withDevice = rateLimitIdentity(req({ "x-anvik-device": "dev-zzz" }), null);
  const withoutDevice = rateLimitIdentity(req(), null);
  assert.equal(withDevice.kind, "ip");
  assert.equal(withoutDevice.kind, "ip");
  assert.equal(withDevice.seed, withoutDevice.seed, "device header must not change the identity");
  const authed = rateLimitIdentity(req({ authorization: "Bearer tok" }), "user-abc");
  assert.equal(authed.kind, "user");
  assert.equal(authed.seed, "user-abc");
});

test("getVerifiedUserIfPresent is a cheap gate — no fetch without an Authorization header", async () => {
  const { getAuthCalls } = installFetchMock();
  const anonymous = await getVerifiedUserIfPresent(req({ "x-vercel-forwarded-for": "203.0.113.70" }));
  assert.equal(anonymous, null);
  assert.equal(getAuthCalls().length, 0, "no Authorization header → zero auth round-trips");
});

test("getVerifiedUserIfPresent returns null for invalid tokens and a user for valid ones", async () => {
  installFetchMock({ authUsers: { "tok-good-001": { id: "user-good-001" } } });
  const bad = await getVerifiedUserIfPresent(req({ authorization: "Bearer tok-bad-001" }));
  assert.equal(bad, null);
  const good = await getVerifiedUserIfPresent(req({ authorization: "Bearer tok-good-001" }));
  assert.ok(good);
  assert.equal(good!.id, "user-good-001");
});

test("route integration: /api/ask keeps the cap in the memory fallback and returns Retry-After", async () => {
  const { POST } = await import("../app/api/ask/route");
  // RPC unreachable (outage) → the deliberate in-memory fallback; Gemini
  // success is faked through the same fetch mock.
  const makeSse = () => {
    const encoder = new TextEncoder();
    return new ReadableStream<Uint8Array>({
      start(controller) {
        const frame = JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] });
        controller.enqueue(encoder.encode(`data: ${frame}\n\n`));
        controller.close();
      },
    });
  };
  mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) {
      return new Response(JSON.stringify({
        id: "ask-route-test-user",
        email: "ask-route-test@example.test",
        app_metadata: { provider: "google" },
        user_metadata: { name: "Ask Route Test" },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("/rest/v1/rpc/consume_rate_limit")) throw new Error("outage");
    if (url.includes("generativelanguage.googleapis.com")) {
      return new Response(makeSse(), { status: 200, headers: { "content-type": "text/event-stream" } });
    }
    throw new Error(`unexpected fetch in test: ${url}`);
  });

  const headers = {
    "x-vercel-forwarded-for": "203.0.113.88",
    "x-google-generative-ai-api-key": "AIzaSyTestKey1234567890123456789012345678",
    Authorization: "Bearer ask-route-valid-session-token",
  };
  let allowed = 0;
  let denied = 0;
  let retryAfter: string | null = null;
  for (let i = 0; i < 13; i++) {
    const response = await POST(
      new Request("http://localhost/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ question: "hello" }),
      }),
    );
    if (response.status === 429) {
      denied++;
      retryAfter = response.headers.get("retry-after");
    } else {
      assert.equal(response.status, 200, `request ${i + 1} unexpectedly failed`);
      await response.text(); // drain the SSE stream
      allowed++;
    }
  }
  assert.equal(allowed, 12, "12/min expected through the memory fallback");
  assert.equal(denied, 1, "the 13th request must be denied");
  assert.ok(retryAfter, "429 must carry a Retry-After header");
});
