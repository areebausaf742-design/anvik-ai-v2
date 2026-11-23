import test from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeDisplayName,
  emailFallbackName,
  authConfigured,
  requireUser,
} from "../lib/session";
import { isSessionUsable } from "../lib/auth";

test("sanitizeDisplayName strips tags, control chars and trims", () => {
  assert.equal(sanitizeDisplayName("  Rahul K.  "), "Rahul K.");
  assert.equal(sanitizeDisplayName("<script>alert(1)</script>"), "scriptalert(1)/script");
  assert.equal(sanitizeDisplayName("\u0007\u0008  Riya\u0007 "), "Riya");
  assert.equal(sanitizeDisplayName("a".repeat(200)).length, 80);
  assert.equal(sanitizeDisplayName(""), "");
  assert.equal(sanitizeDisplayName(null as unknown as string), "");
  assert.equal(sanitizeDisplayName(42 as unknown as string), "");
});

test("emailFallbackName derives a safe first-name from the local part", () => {
  assert.equal(emailFallbackName("rahul.kumar@example.com"), "rahul");
  assert.equal(emailFallbackName("priya_charan@example.com"), "priya");
  assert.equal(emailFallbackName("anjali-sharma@example.com"), "anjali");
  assert.equal(emailFallbackName("rahul.kumar@example.com\n"), "rahul");
  assert.equal(emailFallbackName(""), "friend");
  assert.equal(emailFallbackName("@example.com"), "friend");
  assert.equal(emailFallbackName("123@example.com"), "123");
});

test("isSessionUsable requires a little headroom on expiry", () => {
  const now = Math.floor(Date.now() / 1000);
  assert.equal(isSessionUsable(null), false);
  assert.equal(isSessionUsable({ access_token: "t", refresh_token: "r", token_type: "bearer", expires_at: now - 1 }), false);
  assert.equal(isSessionUsable({ access_token: "t", refresh_token: "r", token_type: "bearer", expires_at: now + 30 }), false);
  assert.equal(isSessionUsable({ access_token: "t", refresh_token: "r", token_type: "bearer", expires_at: now + 120 }), true);
});

test("authConfigured is false when env is absent (never half-configured)", () => {
  // Sandbox env never has the variables set — must be false.
  assert.equal(authConfigured(), false);
});

test("requireUser rejects requests without a verified bearer session", async () => {
  const result = await requireUser(new Request("http://localhost/api/chat", { method: "POST" }));
  assert.ok("response" in result);
  if ("response" in result) {
    assert.equal(result.response.status, 401);
    const body = await result.response.json();
    assert.equal(body.code, "unauthenticated");
  }
});
