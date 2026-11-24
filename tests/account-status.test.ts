import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isBlockedStatus, normalizeAccountStatus } from "../lib/account-status";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("known blocked statuses are blocked", () => {
  assert.equal(isBlockedStatus(normalizeAccountStatus("suspended")), true);
  assert.equal(isBlockedStatus(normalizeAccountStatus("deleted")), true);
});

test("active and unrecognised values stay allowed", () => {
  assert.equal(isBlockedStatus(normalizeAccountStatus("active")), false);
  assert.equal(isBlockedStatus(normalizeAccountStatus(null)), false);
  assert.equal(isBlockedStatus(normalizeAccountStatus(undefined)), false);
  // A typo in an operator's SQL must not lock real users out.
  assert.equal(isBlockedStatus(normalizeAccountStatus("activ")), false);
});

test("account standing is enforced on every AI route, not just reported", () => {
  const gateway = readFileSync(join(root, "lib/ai-gateway.ts"), "utf8");
  assert.ok(gateway.includes("readAccountStanding("), "the shared gateway must check standing");

  // Every AI route now delegates to the gateway, so the check runs once, in one
  // place, before any provider call. Chat no longer repeats it inline.
  for (const routePath of [
    "app/api/chat/route.ts",
    "app/api/ask/route.ts",
    "app/api/code/route.ts",
    "app/api/voice/route.ts",
    "app/api/vision/route.ts",
    "app/api/image/route.ts",
  ]) {
    const source = readFileSync(join(root, routePath), "utf8");
    assert.ok(
      source.includes("beginMeteredRequest("),
      routePath + " must go through the metered gateway (which checks standing)",
    );
    assert.ok(
      !source.includes("readAccountStanding("),
      routePath + " must not re-implement the standing check",
    );
  }

  // Ordering inside the gateway: standing is read before any key is used.
  assert.ok(
    gateway.indexOf("readAccountStanding(") < gateway.indexOf("const key = userKey ?? serverKey()"),
    "standing must be checked before the server key is resolved",
  );
});
