import test from "node:test";
import assert from "node:assert/strict";
import {
  QuotaStore,
  type QuotaHooks,
  FREE_LIMIT,
  istDay,
} from "../lib/quota";

function memQuota(now = "2026-11-22T10:00:00Z") {
  const stored = new Map<string, number>();
  const hooks: QuotaHooks = {
    now: () => new Date(now),
    read: async (ipHash, day) => stored.get(`${ipHash}:${day}`) ?? 0,
    write: async (ipHash, day, count) => {
      stored.set(`${ipHash}:${day}`, count);
      return true;
    },
  };
  return { hooks, stored };
}

test("free tier allows exactly 20 answers per IP per day, then stops", async () => {
  const { hooks } = memQuota();
  const store = new QuotaStore(hooks);
  const ipHash = "hash-a";
  let allowed = 0;
  for (let i = 0; i < 30; i++) {
    const check = await store.checkAndReserve(ipHash);
    if (check.ok) {
      allowed++;
      await store.confirm(check.reservationKey);
    }
  }
  assert.equal(allowed, FREE_LIMIT);
  assert.equal(await store.remaining(ipHash), 0);
});

test("a failed request never consumes quota", async () => {
  const { hooks } = memQuota();
  const store = new QuotaStore(hooks);
  const ipHash = "hash-b";
  const check = await store.checkAndReserve(ipHash);
  assert.equal(check.ok, true);
  if (!check.ok) return;
  store.cancel(check.reservationKey); // failed before stream
  const second = await store.checkAndReserve(ipHash);
  assert.equal(second.ok, true, "a cancelled reservation must free the slot");
  if (second.ok) await store.confirm(second.reservationKey);
  assert.equal(await store.remaining(ipHash), FREE_LIMIT - 1);
});

test("confirm persists the increment exactly once", async () => {
  const { hooks, stored } = memQuota();
  const store = new QuotaStore(hooks);
  const ipHash = "hash-c";
  const check = await store.checkAndReserve(ipHash);
  assert.equal(check.ok, true);
  if (!check.ok) return;
  const newCount = await store.confirm(check.reservationKey);
  assert.equal(newCount, 1);
  const day = istDay(new Date("2026-11-22T10:00:00Z"));
  assert.equal(stored.get(`${ipHash}:${day}`), 1);
});

test("reservations survive within the process but never double-spend", async () => {
  const { hooks } = memQuota();
  const store = new QuotaStore(hooks);
  const ipHash = "hash-d";
  const checks = await Promise.all(
    Array.from({ length: FREE_LIMIT + 5 }, () => store.checkAndReserve(ipHash)),
  );
  assert.equal(checks.filter((c) => c.ok).length, FREE_LIMIT);
});

test("a new day resets the free tier", async () => {
  const stored = new Map<string, number>();
  const days = ["2026-11-22T10:00:00Z", "2026-11-23T10:00:00Z"];
  let dayIdx = 0;
  const hooks: QuotaHooks = {
    now: () => new Date(days[dayIdx]),
    read: async (ipHash, day) => stored.get(`${ipHash}:${day}`) ?? 0,
    write: async (ipHash, day, count) => {
      stored.set(`${ipHash}:${day}`, count);
      return true;
    },
  };
  const store = new QuotaStore(hooks);
  const ipHash = "hash-e";
  // Day 1: burn the whole limit
  for (let i = 0; i < FREE_LIMIT; i++) {
    const check = await store.checkAndReserve(ipHash);
    assert.equal(check.ok, true);
    if (check.ok) await store.confirm(check.reservationKey);
  }
  assert.equal(await store.remaining(ipHash), 0);
  // Day 2: fresh allowance
  dayIdx = 1;
  const next = await store.checkAndReserve(ipHash);
  assert.equal(next.ok, true);
});

test("Supabase being unreachable degrades without throwing", async () => {
  const hooks: QuotaHooks = {
    read: async () => null,
    write: async () => false,
  };
  const store = new QuotaStore(hooks);
  const check = await store.checkAndReserve("hash-f");
  assert.equal(check.ok, true, "quota must degrade, never 500");
  if (!check.ok) return;
  const count = await store.confirm(check.reservationKey);
  assert.equal(count, null, "a failed write returns null, never throws");
});
