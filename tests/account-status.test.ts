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

  const chat = readFileSync(join(root, "app/api/chat/route.ts"), "utf8");
  assert.ok(chat.includes("readAccountStanding("), "chat must check standing");
  assert.ok(
    chat.indexOf("readAccountStanding(") < chat.indexOf("openGeminiStreamWithFallback("),
    "standing must be checked before the model is called",
  );
});
