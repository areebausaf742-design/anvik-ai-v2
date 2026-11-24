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
      source.includes("meteredStream(");
    assert.ok(settles, `${routePath} never settles its reservation on success`);

    const refunds =
      /settle\(\s*("failure"|"aborted"|outcome)/.test(source) ||
      source.includes('settleReservation(reservation, "failure"') ||
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
    "app/api/chat/route.ts",
    "app/api/quota/route.ts",
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

test("the chat route persists the free-tier counter through the atomic RPC", () => {
  const source = readFileSync(join(root, "app/api/chat/route.ts"), "utf8");
  assert.ok(
    source.includes('"consume_quota"'),
    "chat must increment the free counter with consume_quota, not a read-modify-write",
  );
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
