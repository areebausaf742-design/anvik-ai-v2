/* Isolated store: its own data dir, set BEFORE the store module loads.
   tsx compiles .ts as CJS here, so no top-level await: the store is imported
   dynamically inside a before-hook, after the env var is set. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const TMP = mkdtempSync(path.join(tmpdir(), "anvik-test-"));
process.env.ANVIK_DATA_DIR = path.join(TMP, "data");

import test from "node:test";
import assert from "node:assert/strict";
type StoreModule = typeof import("../lib/store");

let store: StoreModule["store"];
let estimateCostPaise: StoreModule["estimateCostPaise"];
let DAILY_CEILING_PAISE: number;

test.before(async () => {
  const m: StoreModule = await import("../lib/store");
  store = m.store;
  estimateCostPaise = m.estimateCostPaise;
  DAILY_CEILING_PAISE = m.DAILY_CEILING_PAISE;
});

test("plan §6.2 race test: 20 concurrent asks against a quota of 3 yield exactly 3", async () => {
  const results = await Promise.all(Array.from({ length: 20 }, () => store.decrementQuota("race-shared")));
  const granted = results.filter((r) => r !== null).length;
  assert.equal(granted, 3, `expected exactly 3 grants, got ${granted}: ${results.join(",")}`);
});

test("a second device keeps its own quota", async () => {
  assert.equal(await store.decrementQuota("other-device"), 2);
});

test("cost maths lands in the §7.2 planning band at 450 output tokens", () => {
  const paise = estimateCostPaise(450);
  assert.ok(paise >= 8 && paise <= 20, `₹${(paise / 100).toFixed(2)} outside ₹0.08–0.20`);
});

test("today's spend sums for the ceiling check", async () => {
  const q = await store.recordQuestion({
    deviceId: "cost-device",
    text: "ceiling probe",
    lang: "en",
    slug: null,
    idempotencyKey: null,
    status: "answered",
  });
  await store.recordAnswer({
    questionId: q.id,
    body: "probe answer body",
    model: "test",
    promptTokens: 100,
    outputTokens: 50,
    cachedTokens: 0,
    costPaise: 12,
    latencyMs: 10,
    isPublic: false,
    moderationState: "clean",
    reviewed: false,
    lang: "en",
    slug: "ceiling-probe",
  });
  assert.ok(store.todayCostPaise() >= 12);
  assert.equal(typeof DAILY_CEILING_PAISE, "number");
});

test("unreviewed answers never reach the gallery", () => {
  const gallery = store.reviewedWithQuestions();
  assert.ok(gallery.length > 0, "seed corpus should be reviewed");
  assert.ok(
    gallery.every(({ answer }) => answer.reviewed),
    "gallery leaked an unreviewed answer",
  );
  assert.ok(
    !gallery.some(({ answer }) => answer.slug === "ceiling-probe"),
    "unreviewed probe answer appeared in gallery",
  );
});

test.after(() => {
  rmSync(TMP, { recursive: true, force: true });
});
