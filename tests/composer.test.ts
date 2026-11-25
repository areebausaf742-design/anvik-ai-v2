import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Composer readiness regression tests (audit P0).
 *
 * A visitor could not type while the session was loading, and pressing Enter
 * during that window returned silently. The textarea must stay typable; only
 * sending waits for identity, and the reason must be visible.
 */

const readiness = (overrides: Partial<{
  identityReady: boolean;
  sessionLoading: boolean;
  hasSession: boolean;
  hasProfile: boolean;
}> = {}) => ({
  identityReady: true,
  sessionLoading: false,
  hasSession: false,
  hasProfile: false,
  ...overrides,
});

test("the composer blocks sending while identity resolves, but not drafting", async () => {
  const { composerBlockReason, canSendMessage } = await import("../lib/composer");

  const loading = readiness({ identityReady: false, sessionLoading: true });
  assert.equal(composerBlockReason(loading), "preparing");
  assert.equal(canSendMessage(loading, "hello", false), false);

  const switching = readiness({ identityReady: false });
  assert.equal(composerBlockReason(switching), "preparing");
  assert.equal(canSendMessage(switching, "hello", false), false);
});

test("a signed-in user whose profile failed to load gets an explicit retry reason", async () => {
  const { composerBlockReason, canSendMessage, COMPOSER_NOTICE } = await import("../lib/composer");
  const unverified = readiness({ identityReady: false, hasSession: true, hasProfile: false });

  assert.equal(composerBlockReason(unverified), "verify_account");
  assert.equal(canSendMessage(unverified, "hello", false), false);
  assert.match(COMPOSER_NOTICE.verify_account, /retry the connection/i);
});

test("a ready composer still refuses empty drafts and in-flight sends", async () => {
  const { canSendMessage } = await import("../lib/composer");
  const ready = readiness();
  assert.equal(canSendMessage(ready, "   ", false), false);
  assert.equal(canSendMessage(ready, "hello", true), false);
  assert.equal(canSendMessage(ready, "hello", false), true);
});

test("the textarea is never disabled by session or identity state", () => {
  const source = readFileSync(
    new URL("../components/anvik/chat-workspace.tsx", import.meta.url),
    "utf8",
  );
  const textarea = source.match(/<textarea[\s\S]*?\/>/)?.[0] ?? "";
  assert.ok(textarea, "composer textarea should exist");
  assert.doesNotMatch(textarea, /\bdisabled=/, "typing must work while identity resolves");
  assert.match(textarea, /aria-busy=\{pending\}/);
});
