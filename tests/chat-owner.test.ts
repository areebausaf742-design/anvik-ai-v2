import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Identity scoping for the persisted chat store.
 *
 * Finding P2 from the frontend audit: /projects read the shared Zustand store
 * without performing the per-account switch that /chat does, so a direct visit
 * or refresh could show empty or stale history for a signed-in user.
 *
 * These tests pin the rule (one owner, resolved from the verified session) and
 * the invariant that every surface reading history applies it.
 */

test("a guest is its own owner namespace", async () => {
  const { resolveChatOwner } = await import("../lib/chat-owner");
  assert.equal(
    resolveChatOwner({ sessionLoading: false, hasSession: false, hasProfile: false, userId: null }),
    "guest",
  );
});

test("a verified user owns their own namespace, keyed by the server-verified id", async () => {
  const { resolveChatOwner } = await import("../lib/chat-owner");
  assert.equal(
    resolveChatOwner({
      sessionLoading: false,
      hasSession: true,
      hasProfile: true,
      userId: "8f14e45f-ceea-467f-a1b2-0d3c9a4b5e61",
    }),
    "8f14e45f-ceea-467f-a1b2-0d3c9a4b5e61",
  );
});

test("identity is never resolved while it is still being verified", async () => {
  const { resolveChatOwner } = await import("../lib/chat-owner");
  // While loading, an owner must not exist — otherwise the store hydrates as
  // "guest" first and the user sees a flash of the wrong history.
  assert.equal(
    resolveChatOwner({ sessionLoading: true, hasSession: true, hasProfile: true, userId: "u1" }),
    null,
  );
  // A session whose profile has not loaded is not yet safe to display.
  assert.equal(
    resolveChatOwner({ sessionLoading: false, hasSession: true, hasProfile: false, userId: "u1" }),
    null,
  );
});

test("every surface that reads history applies the same owner switch", () => {
  // A surface that reads the store without activating the owner is exactly the
  // bug that was reported. Both pages must go through the shared helper.
  for (const page of [
    "components/anvik/chat-workspace.tsx",
    "components/anvik/projects-page.tsx",
  ]) {
    const source = readFileSync(page, "utf8");
    assert.ok(source.includes("resolveChatOwner("), `${page} must resolve the owner`);
    assert.ok(source.includes("activateChatOwner("), `${page} must activate that owner`);
    assert.equal(
      /persist\.setOptions\(/.test(source),
      false,
      `${page} must not perform the switch itself — one implementation only`,
    );
  }
});

test("the owner switch preserves the account's saved conversations", () => {
  // persist() writes current state into the new key on the way through, so the
  // previous value must be restored before rehydrating or the switch wipes it.
  const source = readFileSync("lib/chat-owner.ts", "utf8");
  assert.ok(source.includes("previousAccountData"), "the saved value is captured first");
  assert.ok(
    source.indexOf("localStorage.getItem(storageKey)") < source.indexOf("useChatStore.setState("),
    "capture happens before the state reset writes over it",
  );
  assert.ok(
    source.indexOf("setItem(storageKey, previousAccountData)") < source.indexOf("rehydrate()"),
    "the saved value is restored before rehydrating",
  );
});

test("switching owner does not discard device-level preferences", () => {
  // mode/temperature are not account data. Resetting them on every sign-in would
  // throw away a choice the user made and expects to persist.
  const source = readFileSync("lib/chat-owner.ts", "utf8");
  const reset = source.slice(source.indexOf("useChatStore.setState({"), source.indexOf("useChatStore.setState({") + 300);
  assert.ok(reset.includes("conversations: []"), "account history is cleared");
  assert.equal(reset.includes("mode:"), false, "the chosen mode survives a switch");
  assert.equal(reset.includes("temperature"), false, "the chosen temperature survives a switch");
});
