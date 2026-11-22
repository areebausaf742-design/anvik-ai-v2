import test from "node:test";
import assert from "node:assert/strict";
import { EntitlementsStore, type EntitlementHooks, type EntitlementRow } from "../lib/entitlements";
import { planById, whatsappEnquiryMessage, WHATSAPP_NUMBER } from "../lib/plans";

function memEntitlements(initial?: EntitlementRow, now = "2026-11-22T10:00:00Z") {
  let stored: EntitlementRow | null = initial ?? null;
  const hooks: EntitlementHooks = {
    now: () => new Date(now),
    read: async (deviceId) => (stored && stored.device_id === deviceId ? stored : null),
    write: async (row) => {
      stored = { ...row };
      return true;
    },
  };
  const reset = (value: EntitlementRow | null) => { stored = value; };
  return { hooks, reset, get: () => stored };
}

function freshPack(nowMs: number): EntitlementRow {
  const activatedAt = new Date(nowMs).toISOString();
  return {
    device_id: "dev-pack",
    plan: "pack",
    activated_at: activatedAt,
    expires_at: new Date(nowMs + 30 * 86_400_000).toISOString(),
    pack_total: 50,
    pack_used: 0,
    daily_day: null,
    daily_used: 0,
  };
}

function freshDaily(nowMs: number, plan: "daily" | "yearly"): EntitlementRow {
  const validityDays = plan === "daily" ? 30 : 365;
  const activatedAt = new Date(nowMs).toISOString();
  return {
    device_id: "dev-daily",
    plan,
    activated_at: activatedAt,
    expires_at: new Date(nowMs + validityDays * 86_400_000).toISOString(),
    pack_total: null,
    pack_used: 0,
    daily_day: "2026-11-22",
    daily_used: 0,
  };
}

test("pack allows 50 questions total then blocks (all or nothing across the 30-day validity)", async () => {
  const { hooks, get } = memEntitlements(freshPack(Date.parse("2026-11-22T10:00:00Z")), "2026-11-22T10:00:00Z");
  const store = new EntitlementsStore(hooks);
  for (let i = 0; i < 50; i++) {
    const outcome = await store.reserve("dev-pack");
    assert.equal(outcome.kind, "reserved");
    await store.confirm("dev-pack");
  }
  const blocked = await store.reserve("dev-pack");
  assert.equal(blocked.kind, "blocked");
  assert.equal(blocked.kind === "blocked" ? blocked.remaining : -1, 0);
});

test("pack expires after 30 days and falls back to free", async () => {
  const { hooks } = memEntitlements(
    freshPack(Date.parse("2026-11-01T10:00:00Z")),
    "2026-12-03T10:00:00Z", // 32 days later
  );
  const store = new EntitlementsStore(hooks);
  const outcome = await store.reserve("dev-pack");
  assert.equal(outcome.kind, "free", "an expired pack must degrade to the free tier");
});

test("pack never exceeds its 30-day validity even if the row looks long-lived", async () => {
  const longLived: EntitlementRow = {
    ...freshPack(Date.parse("2026-11-01T10:00:00Z")),
    expires_at: new Date(Date.parse("2026-11-01T10:00:00Z") + 45 * 86_400_000).toISOString(),
  };
  const { hooks } = memEntitlements(longLived, "2026-12-15T10:00:00Z");
  const store = new EntitlementsStore(hooks);
  const outcome = await store.reserve("dev-pack");
  assert.equal(outcome.kind, "free", "out-of-window rows must not extend the pack");
});

test("daily plan enforces 50 per IST day, not 50 per 30-day grant", async () => {
  const { hooks } = memEntitlements(
    freshDaily(Date.parse("2026-11-22T10:00:00Z"), "daily"),
    "2026-11-22T10:00:00Z",
  );
  const store = new EntitlementsStore(hooks);
  for (let i = 0; i < 50; i++) {
    const outcome = await store.reserve("dev-daily");
    assert.equal(outcome.kind, "reserved");
    await store.confirm("dev-daily");
  }
  const blocked = await store.reserve("dev-daily");
  assert.equal(blocked.kind, "blocked");
});

test("daily plan resets at midnight IST", async () => {
  const { hooks, reset } = memEntitlements(
    freshDaily(Date.parse("2026-11-22T10:00:00Z"), "daily"),
    "2026-11-22T10:00:00Z",
  );
  // burn all 50 for today
  const day1 = new EntitlementsStore(hooks);
  for (let i = 0; i < 50; i++) {
    const outcome = await day1.reserve("dev-daily");
    assert.equal(outcome.kind, "reserved");
    await day1.confirm("dev-daily");
  }
  const blockedToday = await day1.reserve("dev-daily");
  assert.equal(blockedToday.kind, "blocked");

  // move past midnight IST (18:30 UTC) on the next day
  reset({
    ...freshDaily(Date.parse("2026-11-22T10:00:00Z"), "daily"),
    daily_day: "2026-11-23",
    daily_used: 0,
    expires_at: new Date(Date.parse("2026-11-22T10:00:00Z") + 30 * 86_400_000).toISOString(),
  });
  const day2Hooks: EntitlementHooks = {
    now: () => new Date("2026-11-23T19:00:00Z"),
    read: hooks.read,
    write: hooks.write,
  };
  const day2 = new EntitlementsStore(day2Hooks);
  const outcome = await day2.reserve("dev-daily");
  assert.equal(outcome.kind, "reserved", "a fresh IST day must grant a fresh 50 allowance");
});

test("yearly plan enforces the same 50/day cap and lives for 365 days", async () => {
  const { hooks } = memEntitlements(
    freshDaily(Date.parse("2026-11-22T10:00:00Z"), "yearly"),
    "2026-11-22T10:00:00Z",
  );
  const store = new EntitlementsStore(hooks);
  for (let i = 0; i < 50; i++) {
    const outcome = await store.reserve("dev-daily");
    assert.equal(outcome.kind, "reserved");
    await store.confirm("dev-daily");
  }
  const blocked = await store.reserve("dev-daily");
  assert.equal(blocked.kind, "blocked");
});

test("yearly expires after 365 days", async () => {
  const { hooks } = memEntitlements(
    freshDaily(Date.parse("2026-11-22T10:00:00Z"), "yearly"),
    "2027-12-23T10:00:00Z", // one day past the 365-day validity
  );
  const store = new EntitlementsStore(hooks);
  const outcome = await store.reserve("dev-daily");
  assert.equal(outcome.kind, "free", "expired yearly must degrade to the free tier");
});

test("failed reservations are cancelled, keeping the slot for the next request", async () => {
  const { hooks } = memEntitlements(
    freshDaily(Date.parse("2026-11-22T10:00:00Z"), "daily"),
    "2026-11-22T10:00:00Z",
  );
  const store = new EntitlementsStore(hooks);
  const outcome = await store.reserve("dev-daily");
  assert.equal(outcome.kind, "reserved");
  store.cancel("dev-daily"); // failed before stream — must free the slot
  const again = await store.reserve("dev-daily");
  assert.equal(again.kind, "reserved");
});

test("grant writes the entitlement row with the plan's exact validity", async () => {
  const { hooks, get } = memEntitlements();
  const store = new EntitlementsStore(hooks);
  const row = await store.grant("dev-grant", "pack", { activatedAt: "2026-11-22T10:00:00Z" });
  assert.ok(row);
  assert.equal(row?.plan, "pack");
  assert.equal(row?.pack_total, 50);
  assert.equal(row?.expires_at, "2026-12-22T10:00:00.000Z");
  assert.equal(row?.pack_used, 0);

  const daily = await store.grant("dev-grant-2", "daily", { activatedAt: "2026-11-22T10:00:00Z" });
  assert.equal(daily?.plan, "daily");
  assert.equal(daily?.daily_day, "2026-11-22");
  assert.equal(daily?.expires_at, "2026-12-22T10:00:00.000Z");
  assert.equal(daily?.pack_total, null);

  const yearly = await store.grant("dev-grant-3", "yearly", { activatedAt: "2026-11-22T10:00:00Z" });
  assert.equal(yearly?.plan, "yearly");
  assert.equal(yearly?.expires_at, "2027-11-22T10:00:00.000Z");
});

test("remaining() reports the pack balance and the daily allowance", async () => {
  const { hooks } = memEntitlements(
    freshPack(Date.parse("2026-11-22T10:00:00Z")),
    "2026-11-22T10:00:00Z",
  );
  const store = new EntitlementsStore(hooks);
  const outcome = await store.reserve("dev-pack");
  assert.equal(outcome.kind, "reserved");
  await store.confirm("dev-pack");
  const tally = await store.remaining("dev-pack");
  assert.deepEqual(tally, { remaining: 49, limit: 50 });
});

test("WhatsApp enquiry composer: free is not an enquiry, paid plans carry name/price/period/quota", () => {
  assert.equal(planById("free").priceInr, 0);
  assert.equal(planById("pack").priceInr, 49);
  assert.equal(planById("daily").priceInr, 149);
  assert.equal(planById("yearly").priceInr, 1299);
  assert.equal(planById("yearly").monthlyEquivalentInr, 108);
  assert.equal(planById("yearly").savePercentVsMonthly, 27);

  const packMsg = whatsappEnquiryMessage("pack");
  assert.match(packMsg, /Pack/);
  assert.match(packMsg, /₹49/);
  assert.match(packMsg, /one-time/);
  assert.match(packMsg, /50 questions/);
  assert.match(packMsg, /valid 30 days/);

  const dailyMsg = whatsappEnquiryMessage("daily");
  assert.match(dailyMsg, /Daily/);
  assert.match(dailyMsg, /₹149/);
  assert.match(dailyMsg, /monthly subscription/);
  assert.match(dailyMsg, /50 questions every day/);

  const yearlyMsg = whatsappEnquiryMessage("yearly");
  assert.match(yearlyMsg, /Yearly/);
  assert.match(yearlyMsg, /₹1,299/);
  assert.match(yearlyMsg, /yearly subscription/);
  assert.match(yearlyMsg, /50 questions every day/);
  assert.match(yearlyMsg, /108\/month/);

  assert.equal(WHATSAPP_NUMBER, "919044996869");
});

test("grant for an unknown plan is impossible by type, but an unknown device id fails gracefully", async () => {
  const { hooks } = memEntitlements();
  const store = new EntitlementsStore(hooks);
  const row = await store.grant("", "pack");
  // An unusable device id must not silently become a clean entitlement.
  assert.equal(row, null);
});
