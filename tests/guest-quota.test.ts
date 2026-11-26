import test from "node:test";
import assert from "node:assert/strict";

/**
 * The guest allowance — the ten free answers the home page promises.
 *
 * These tests protect the two things that were broken in production:
 *   1. guests could not chat at all (the client redirected to /login)
 *   2. the quota endpoint had no honest guest answer, so the UI invented one
 *
 * They also pin the identity rule: a guest is keyed by the platform-derived IP,
 * never by the `x-anvik-device` header, which any caller can rotate freely.
 */

const ENV = {
  url: "NEXT_PUBLIC_SUPABASE_URL",
  key: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
} as const;

/** No Supabase configured → the in-process counter is authoritative. */
function withoutSupabase(): () => void {
  const previous = { url: process.env[ENV.url], key: process.env[ENV.key] };
  delete process.env[ENV.url];
  delete process.env[ENV.key];
  return () => {
    if (previous.url !== undefined) process.env[ENV.url] = previous.url;
    if (previous.key !== undefined) process.env[ENV.key] = previous.key;
  };
}

function guestRequest(ip: string, deviceHeader?: string): Request {
  const headers: Record<string, string> = { "x-vercel-forwarded-for": ip };
  if (deviceHeader) headers["x-anvik-device"] = deviceHeader;
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers,
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
  });
}

test("guest chat is intentional and limited to the chat feature", async () => {
  const { ACCOUNT_ONLY_FEATURES, GUEST_LIMIT } = await import("../lib/guest-quota");

  // Product decision: a visitor may ask questions without an account. The
  // expensive studios stay account-only, and the server is the authority.
  assert.equal(GUEST_LIMIT, 10);
  assert.deepEqual(
    [...ACCOUNT_ONLY_FEATURES].sort(),
    ["code", "image", "vision", "voice"],
    "chat must never be account-only",
  );
  assert.equal(
    (ACCOUNT_ONLY_FEATURES as readonly string[]).includes("chat"),
    false,
    "guests are allowed to chat",
  );
});

test("a guest identity is a salted IP hash, never the device header", async () => {
  const restore = withoutSupabase();
  try {
    const { guestIpHash } = await import("../lib/guest-quota");
    const a = await guestIpHash(guestRequest("203.0.113.7", "device-alpha"));
    const b = await guestIpHash(guestRequest("203.0.113.7", "device-beta"));
    assert.ok(a, "an IP yields an identity");
    assert.equal(a, b, "rotating the device header must not mint a new guest identity");

    const other = await guestIpHash(guestRequest("198.51.100.9"));
    assert.notEqual(a, other, "different IPs are different guests");
    assert.doesNotMatch(String(a), /203\.0\.113\.7/, "the raw IP is never the key");
    assert.match(String(a), /^[0-9a-f]{64}$/, "the key is a sha-256 digest");
  } finally {
    restore();
  }
});

test("a guest gets exactly ten answers a day, then is refused", async () => {
  const restore = withoutSupabase();
  try {
    const { reserveGuestRequest, GUEST_LIMIT, _resetGuestQuota } = await import("../lib/guest-quota");
    _resetGuestQuota();
    assert.equal(GUEST_LIMIT, 10, "the number the home page promises");

    const request = guestRequest("203.0.113.20");
    for (let i = 0; i < GUEST_LIMIT; i += 1) {
      const result = await reserveGuestRequest(request, "chat");
      assert.equal(result.ok, true, `answer ${i + 1} of ${GUEST_LIMIT} must be allowed`);
      if (result.ok) await result.reserve();
    }

    const eleventh = await reserveGuestRequest(request, "chat");
    assert.equal(eleventh.ok, false, "the eleventh answer is refused");
    if (!eleventh.ok) assert.equal(eleventh.reason, "limit_reached");
  } finally {
    restore();
  }
});

test("a failed answer does not spend one of the ten questions", async () => {
  const restore = withoutSupabase();
  try {
    const { reserveGuestRequest, readGuestAllowance, _resetGuestQuota } = await import("../lib/guest-quota");
    _resetGuestQuota();
    const request = guestRequest("203.0.113.31");

    const before = await readGuestAllowance(request);
    assert.equal(before.remaining, 10);

    // Reserve, then give it back — this is what a provider error or a client
    // disconnect does. The allowance must be untouched.
    const attempt = await reserveGuestRequest(request, "chat");
    assert.equal(attempt.ok, true);
    if (attempt.ok) attempt.release();

    const after = await readGuestAllowance(request);
    assert.equal(after.remaining, 10, "an unanswered request is free");
  } finally {
    restore();
  }
});

test("the allowance is reported truthfully, and only for the caller's own IP", async () => {
  const restore = withoutSupabase();
  try {
    const { reserveGuestRequest, readGuestAllowance, _resetGuestQuota } = await import("../lib/guest-quota");
    _resetGuestQuota();
    const mine = guestRequest("203.0.113.40");

    const first = await reserveGuestRequest(mine, "chat");
    assert.equal(first.ok, true);
    if (first.ok) await first.reserve();

    const view = await readGuestAllowance(mine);
    assert.equal(view.remaining, 9, "one answered question is counted");
    assert.equal(view.limit, 10);
    assert.match(view.day, /^\d{4}-\d{2}-\d{2}$/, "the IST day is stated");

    const someoneElse = await readGuestAllowance(guestRequest("198.51.100.77"));
    assert.equal(someoneElse.remaining, 10, "one IP's usage never leaks into another's count");
  } finally {
    restore();
  }
});

test("guests are only offered to chat; the expensive surfaces stay account-only", async () => {
  const { ACCOUNT_ONLY_FEATURES, GUEST_LIMIT } = await import("../lib/guest-quota");
  for (const feature of ["image", "code", "voice", "vision"]) {
    assert.ok(
      (ACCOUNT_ONLY_FEATURES as readonly string[]).includes(feature),
      `${feature} must require an account`,
    );
  }
  assert.equal(
    (ACCOUNT_ONLY_FEATURES as readonly string[]).includes("chat"),
    false,
    "chat is the surface the product promises without an account",
  );
  assert.equal(GUEST_LIMIT, 10);
});

test("the guest meter increments through the atomic RPC, not read-modify-write", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync("lib/guest-quota.ts", "utf8");
  assert.ok(source.includes("consume_quota"), "the distributed increment is the atomic RPC");
  // Argument names must match the SQL signature or PostgREST 404s and every
  // guest silently degrades to the in-process counter.
  assert.ok(source.includes("p_ip_hash"), "the RPC argument names match the function");
  assert.ok(source.includes("p_day"), "the RPC day argument matches the function");
  assert.equal(source.includes("p_date"), false, "no stale argument name");
});
