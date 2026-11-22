import test from "node:test";
import assert from "node:assert/strict";
import { effectivePlan, type UserEntitlement } from "../lib/credits";
import { TERMS_VERSION, PRIVACY_VERSION } from "../lib/consent";

const base: UserEntitlement = {
  user_id: "u1",
  plan_id: "free",
  daily_message_limit: 10,
  current_plan_status: "active",
  entitlement_start: "2026-11-20T00:00:00.000Z",
  entitlement_expiry: null,
};

test("free plan keeps its daily allowance and stays active forever", () => {
  const eff = effectivePlan(base);
  assert.equal(eff.plan, "free");
  assert.equal(eff.limit, 10);
  assert.equal(eff.active, true);
});

test("active daily/yearly plans keep their 50/day limit", () => {
  const daily = effectivePlan({ ...base, plan_id: "daily", daily_message_limit: 50, entitlement_expiry: "2026-12-20T00:00:00Z" });
  assert.equal(daily.plan, "daily");
  assert.equal(daily.limit, 50);
  assert.equal(daily.active, true);

  const yearly = effectivePlan({ ...base, plan_id: "yearly", daily_message_limit: 50, entitlement_expiry: "2027-10-20T00:00:00Z" });
  assert.equal(yearly.plan, "yearly");
  assert.equal(yearly.limit, 50);
});

test("expired paid plans degrade honestly to the free floor", () => {
  const expired = effectivePlan({ ...base, plan_id: "daily", daily_message_limit: 50, entitlement_expiry: "2026-01-01T00:00:00Z" });
  assert.equal(expired.plan, "free");
  assert.equal(expired.limit, 10);
  assert.equal(expired.active, true, "degraded to free, still usable");
});

test("non-active entitlement rows degrade to free", () => {
  const pending = effectivePlan({ ...base, plan_id: "yearly", current_plan_status: "pending", entitlement_expiry: "2027-01-01T00:00:00Z" });
  assert.equal(pending.plan, "free");
  assert.equal(pending.limit, 10);
});

test("pack plan has a null daily cap (pack credits are the allowance)", () => {
  const pack = effectivePlan({ ...base, plan_id: "pack", daily_message_limit: 0, entitlement_expiry: "2026-12-01T00:00:00Z" });
  assert.equal(pack.plan, "pack");
  assert.equal(pack.limit, 0);
  assert.equal(pack.active, true);
});

test("missing entitlement behaves as the free plan", () => {
  const eff = effectivePlan(null);
  assert.equal(eff.plan, "free");
  assert.equal(eff.limit, 10);
});

test("consent versions are pinned server-side (never client-supplied)", () => {
  assert.equal(TERMS_VERSION, "2026-11");
  assert.equal(PRIVACY_VERSION, "2026-11");
});
