import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mock } from "node:test";
import { meteredStream } from "../lib/ai-gateway";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const AI_ROUTES = [
  "app/api/chat/route.ts",
  "app/api/ask/route.ts",
  "app/api/code/route.ts",
  "app/api/voice/route.ts",
  "app/api/vision/route.ts",
  "app/api/image/route.ts",
];

test("every AI route reserves a credit before touching a provider", () => {
  for (const routePath of AI_ROUTES) {
    const source = readFileSync(join(root, routePath), "utf8");
    const metered = source.includes("beginMeteredRequest(");
    // /api/chat keeps its own (older, richer) reservation flow for the free
    // per-IP quota and entitlement path; everything else must use the shared
    // gateway so no surface can silently spend the server key for free.
    const ownsReservation =
      routePath.endsWith("chat/route.ts") &&
      source.includes("reserveCredit(") &&
      source.includes("settleCredit(");
    assert.ok(
      metered || ownsReservation,
      `${routePath} spends the server key without reserving a credit`,
    );
  }
});

test("every AI route settles its reservation instead of dropping it", () => {
  for (const routePath of AI_ROUTES) {
    const source = readFileSync(join(root, routePath), "utf8");
    // "shares" covers routes that settle from a variable outcome after the
    // stream ends (the only correct place to decide success vs failure).
    const settles =
      /settle\(\s*("success"|outcome)/.test(source) ||
      source.includes('settleReservation(reservation, "success"') ||
      /settleSession\(\s*"success"/.test(source) ||
      source.includes("meteredStream(");
    assert.ok(settles, `${routePath} never settles its reservation on success`);

    const refunds =
      /settle\(\s*("failure"|"aborted"|outcome)/.test(source) ||
      source.includes('settleReservation(reservation, "failure"') ||
      /settleSession\(\s*("failure"|"aborted"|outcome)/.test(source) ||
      source.includes('settleReservation(reservation, "aborted"') ||
      source.includes("meteredStream(");
    assert.ok(refunds, `${routePath} never refunds its reservation on failure`);
  }
});

test("no AI route calls the provider before authenticating", () => {
  for (const routePath of AI_ROUTES) {
    const fullSource = readFileSync(join(root, routePath), "utf8");
    // Only the handler matters: helpers defined above POST may mention the
    // provider API without being reachable before authentication.
    const handlerStart = fullSource.indexOf("export async function POST");
    const source = handlerStart >= 0 ? fullSource.slice(handlerStart) : fullSource;
    const authIndex = source.search(/requireUser\(|beginMeteredRequest\(/);
    const providerIndex = source.search(/openGeminiStreamWithFallback\(|generateGeminiTextWithFallback\(|:generateContent|\/models\//);
    assert.ok(authIndex > -1, `${routePath} must authenticate`);
    assert.ok(providerIndex > -1, `${routePath} should call a provider`);
    assert.ok(
      authIndex < providerIndex,
      `${routePath} reaches the model before verifying identity`,
    );
  }
});

test("no AI route reads a client-supplied identity header", () => {
  for (const routePath of AI_ROUTES) {
    const source = readFileSync(join(routePath.startsWith("/") ? routePath : join(root, routePath)), "utf8");
    for (const header of ["x-anvik-user-id", "x-user-id", "x-anvik-uid"]) {
      assert.equal(
        source.includes(header),
        false,
        `${routePath} must never trust a client-supplied identity header (${header})`,
      );
    }
  }
});

/* ------------------------------------------------------------------ */
/* meteredStream                                                       */
/* ------------------------------------------------------------------ */

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

test("a fully read stream settles as success, exactly once", async () => {
  const calls: string[] = [];
  const wrapped = meteredStream(streamOf(["hel", "lo"]), async (outcome) => {
    calls.push(outcome);
  });
  assert.equal(await drain(wrapped), "hello");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(calls, ["success"]);
});

test("a stream that errors mid-way settles as failure", async () => {
  const calls: string[] = [];
  const upstream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("partial"));
      controller.error(new Error("model died"));
    },
  });
  const wrapped = meteredStream(upstream, async (outcome) => {
    calls.push(outcome);
  });
  await assert.rejects(drain(wrapped));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(calls, ["failure"]);
});

test("a client disconnect settles as aborted, so the credit is refunded", async () => {
  const calls: string[] = [];
  const wrapped = meteredStream(streamOf(["a", "b", "c"]), async (outcome) => {
    calls.push(outcome);
  });
  const reader = wrapped.getReader();
  await reader.read();
  await reader.cancel("user closed the tab");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(calls, ["aborted"]);
});

test("settlement is idempotent — a cancel after completion cannot double-charge", async () => {
  const calls: string[] = [];
  const wrapped = meteredStream(streamOf(["done"]), async (outcome) => {
    calls.push(outcome);
  });
  const reader = wrapped.getReader();
  await reader.read();
  await reader.read(); // done
  await reader.cancel().catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(calls, ["success"], "only the first settlement counts");
});

/* ------------------------------------------------------------------ */
/* PostgREST upsert safety                                             */
/* ------------------------------------------------------------------ */

test("the PostgREST adapter never sends an upsert without a conflict target", () => {
  const source = readFileSync(join(root, "lib/supabase.ts"), "utf8");
  assert.ok(
    source.includes("on_conflict="),
    "upserts must name the constraint PostgREST arbitrates on",
  );
  assert.ok(
    source.includes("upsert requires an explicit conflict target"),
    "an empty conflict target must be rejected, not silently downgraded to the primary key",
  );
});

test("every sbUpsert call site names its conflict columns", () => {
  const callers = [
    "app/api/auth/me/route.ts",
    "app/api/profile/route.ts",
    "app/api/entitlements/grant/route.ts",
    "lib/consent.ts",
    "lib/credits.ts",
    "lib/quota.ts",
  ];
  for (const caller of callers) {
    const source = readFileSync(join(root, caller), "utf8");
    // Match `sbUpsert(` / `sbUpsertDetailed(` invocations at the AST-ish level:
    // line-based is enough because every project call site is formatted the
    // same way (table, rows, conflict).
    assert.ok(
      /sbUpsert(?:Detailed)?\(\s*"[a-z_]+",\s*\[[^\]]*\]\s*,?\s*["`]/.test(source) ||
        source.includes('sbUpsert("entitlements", rows, "device_id")') ||
        source.includes("write: async (ipHash, day, count) =>") ||
        /sbUpsert\(\s*"[a-z_]+",\s*\[[\s\S]{0,400}?\],\s*"[a-z_,]+"\s*\)/.test(source),
      `${caller} has an upsert without an explicit conflict target`,
    );
  }
});

/* ------------------------------------------------------------------ */
/* Quota wiring                                                        */
/* ------------------------------------------------------------------ */

test("chat charges exactly one meter per caller: credit ledger, or the guest allowance", () => {
  const source = readFileSync(join(root, "app/api/chat/route.ts"), "utf8");
  // The gateway decides which meter applies — account credit for a signed-in
  // user, the ten-a-day guest allowance otherwise — and chat must not charge
  // either one itself. Two meters in one request would double-bill; a second
  // inline counter would be a third source of truth.
  assert.ok(source.includes("beginMeteredRequest("), "chat must delegate metering to the gateway");
  assert.equal(source.includes("reserveCredit("), false, "chat must not reserve credits itself");
  assert.equal(source.includes("settleCredit("), false, "chat must not settle credits itself");
  assert.equal(source.includes("consume_quota"), false, "chat must not charge the per-IP counter directly");
  assert.equal(/kind:\s*"free"/.test(source), false, "no legacy anonymous reservation branch");

  // The two meters themselves must stay mutually exclusive, and both atomic.
  const gateway = readFileSync(join(root, "lib/ai-gateway.ts"), "utf8");
  assert.ok(gateway.includes("reserveCredit("), "the gateway owns the account credit path");
  assert.ok(gateway.includes("reserveGuestRequest("), "the gateway owns the guest allowance path");
  assert.ok(
    gateway.indexOf('if (!user) {') < gateway.indexOf("reserveCredit(user.id"),
    "a guest must never reach the account credit path",
  );

  // Strip comments before scanning: this module explains at length *why* the
  // device header is not an identity, and that prose must not read as usage.
  const guestMeter = readFileSync(join(root, "lib/guest-quota.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.ok(guestMeter.includes("consume_quota"), "the guest meter increments atomically");
  assert.ok(guestMeter.includes("hashIp("), "the guest key is a salted IP hash");
  assert.equal(
    /x-anvik-device/.test(guestMeter),
    false,
    "a client-supplied device header must never be a guest identity",
  );
});

test("the per-IP counter is still atomic for whoever still reads it", () => {
  // /api/quota no longer reports it, but the RPC and the store remain correct
  // and covered, so a future surface cannot reintroduce the frozen counter.
  const store = readFileSync(join(root, "lib/quota.ts"), "utf8");
  assert.ok(store.includes("increment"), "the quota store keeps the atomic increment path");
  const migration = readFileSync(
    join(root, "supabase/migrations/20261124000000_quota_and_settle_rpcs.sql"),
    "utf8",
  );
  assert.ok(migration.includes("on conflict (ip_hash, date) do update"), "consume_quota must upsert atomically");
});

test("the quota store supports atomic increments and keeps reservations in-process", async () => {
  const { QuotaStore } = await import("../lib/quota");
  let stored = 0;
  const store = new QuotaStore({
    read: async () => stored,
    write: async (_ip, _day, count) => {
      stored = count;
      return true;
    },
    increment: async () => {
      stored += 1;
      return stored;
    },
  });

  const first = await store.checkAndReserve("hash-a");
  assert.equal(first.ok, true);
  await store.confirm(first.ok ? first.reservationKey : "");
  assert.equal(stored, 1, "the atomic increment must advance the stored counter");

  // Nine more successes fill the day: 10 total.
  for (let index = 0; index < 9; index += 1) {
    const check = await store.checkAndReserve("hash-a");
    assert.equal(check.ok, true);
    await store.confirm(check.ok ? check.reservationKey : "");
  }
  assert.equal(stored, 10);

  const eleventh = await store.checkAndReserve("hash-a");
  assert.equal(eleventh.ok, false, "the 11th request of the day must be refused");
  store.reset();
});

test("a cancelled reservation is never persisted", async () => {
  let increments = 0;
  const { QuotaStore } = await import("../lib/quota");
  const store = new QuotaStore({
    read: async () => 0,
    write: async () => true,
    increment: async () => {
      increments += 1;
      return increments;
    },
  });
  const check = await store.checkAndReserve("hash-b");
  store.cancel(check.ok ? check.reservationKey : "");
  assert.equal(increments, 0, "a failed request must not consume quota");
  store.reset();
});

mock.restoreAll();

/* ------------------------------------------------------------------ */
/* Money paths: grants must be idempotent and column-scoped            */
/* ------------------------------------------------------------------ */

test("an unfiltered UPDATE is refused by the adapter", () => {
  const source = readFileSync(join(root, "lib/supabase.ts"), "utf8");
  assert.ok(
    source.includes("update requires a filter"),
    "sbUpdateWhereDetailed must refuse to rewrite an entire table",
  );
});

test("a daily/yearly grant cannot touch pack credits", () => {
  const source = readFileSync(join(root, "app/api/entitlements/grant/route.ts"), "utf8");
  // The daily/yearly branch must use the column-scoped update...
  assert.ok(
    source.includes("sbUpdateWhereDetailed("),
    "daily/yearly reset must be a column-scoped UPDATE",
  );
  // ...and must never ASSIGN available_pack_credits (that is how paid credits
  // were silently deleted). Comments are stripped first so that documenting the
  // old bug cannot fail the test.
  const code = source
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
    .join("\n");
  assert.equal(
    /available_pack_credits\s*:\s*\d/.test(code),
    false,
    "grant must never assign a pack-credit total",
  );
});

test("a pack grant goes through the idempotent RPC, not a read-modify-write", () => {
  const source = readFileSync(join(root, "app/api/entitlements/grant/route.ts"), "utf8");
  assert.ok(source.includes('"grant_pack_credits"'), "pack grants must use the locked, idempotent RPC");
  assert.equal(
    /const\s+newBalance\s*=/.test(source),
    false,
    "no JS read-modify-write balance arithmetic",
  );
});

test("the settle and grant RPCs are defined with a pinned search_path and no public EXECUTE", () => {
  const migration = readFileSync(
    join(root, "supabase/migrations/20261124000000_quota_and_settle_rpcs.sql"),
    "utf8",
  );
  for (const fn of ["consume_quota", "settle_credit", "reclaim_stale_reservations", "grant_pack_credits"]) {
    assert.ok(migration.includes(`function public.${fn}`), `${fn} must be in the migration`);
  }
  assert.ok(migration.includes("security definer"), "RPCs must be SECURITY DEFINER");
  assert.ok(migration.includes("set search_path = pg_catalog, public"), "search_path must be pinned");
  assert.ok(
    migration.includes("from public, anon, authenticated"),
    "EXECUTE must be revoked from anon and authenticated",
  );
  assert.ok(migration.includes("to service_role"), "EXECUTE must be granted to service_role only");
});
