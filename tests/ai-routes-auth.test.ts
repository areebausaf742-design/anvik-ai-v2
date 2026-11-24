import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as chatRoute from "../app/api/chat/route";
import * as askRoute from "../app/api/ask/route";
import * as codeRoute from "../app/api/code/route";
import * as voiceRoute from "../app/api/voice/route";
import * as visionRoute from "../app/api/vision/route";
import * as imageRoute from "../app/api/image/route";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The auth contract, after guests were made a real, metered case.
 *
 * There is one identity rule and one place that enforces it — `lib/ai-gateway.ts`
 * — so these tests assert the contract at the boundary the user experiences,
 * not the shape of any individual route.
 */

const ACCOUNT_ONLY_ROUTES = [
  "app/api/ask/route.ts",
  "app/api/code/route.ts",
  "app/api/voice/route.ts",
  "app/api/vision/route.ts",
  "app/api/image/route.ts",
];

test("every generation route resolves identity before it can spend anything", () => {
  const routes = ["app/api/chat/route.ts", ...ACCOUNT_ONLY_ROUTES];
  for (const routePath of routes) {
    const source = readFileSync(join(root, routePath), "utf8");
    assert.ok(
      source.includes('from "@/lib/session"'),
      routePath + " must use the shared session module",
    );
    // Either the route verifies the user itself, or it hands the caller to the
    // gateway which does. Neither may be missing.
    const guardsItself = source.includes("requireUser");
    const delegates = source.includes("beginMeteredRequest");
    assert.ok(guardsItself || delegates, routePath + " must enforce identity somehow");
  }
});

test("account-only routes still require a verified user at the route level", () => {
  for (const routePath of ACCOUNT_ONLY_ROUTES) {
    const source = readFileSync(join(root, routePath), "utf8");
    assert.ok(
      source.includes("requireUser"),
      routePath + " is account-only and must call requireUser directly",
    );
    assert.ok(
      !source.includes("getVerifiedUserIfPresent"),
      routePath + " must not accept a guest",
    );
  }
});

test("chat hands identity to the one gateway instead of billing inline", () => {
  const source = readFileSync(join(root, "app/api/chat/route.ts"), "utf8");
  // Regression: chat used to duplicate the whole chain (standing → rate limit →
  // reserve), which is how it drifted away from the other five routes.
  assert.ok(source.includes("beginMeteredRequest"), "chat must use the metered gateway");
  assert.ok(source.includes("getVerifiedUserIfPresent"), "chat must accept a guest caller");
  assert.ok(!source.includes("reserveCredit("), "chat must not reserve credits itself");
  assert.ok(!source.includes("allowDistributed("), "chat must not run its own limiter");
  assert.ok(!source.includes("settleReservation("), "chat must not settle credits itself");
});

test("account-only endpoints refuse a guest with a sign-in error and no provider call", async () => {
  const headers = {
    "Content-Type": "application/json",
    "x-google-generative-ai-api-key": "AQ.test-key-aq-prefix-acceptance-1234567890",
  };
  const makeRequest = (url: string, body: unknown = {}) =>
    new Request("http://localhost" + url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  const calls = await Promise.all([
    askRoute.POST(makeRequest("/api/ask")),
    codeRoute.POST(makeRequest("/api/code")),
    voiceRoute.POST(makeRequest("/api/voice")),
    visionRoute.POST(makeRequest("/api/vision")),
    imageRoute.POST(makeRequest("/api/image")),
  ]);
  for (const response of calls) {
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.code, "unauthenticated");
    assert.match(body.error, /sign in/i, "the message must tell the user what to do");
  }
});

test("a guest is NOT refused by chat's own auth — it reaches the guest meter", async () => {
  // The composer is enabled for guests and the product promises ten free
  // questions, so "no bearer token" must not be an auth failure on chat.
  //
  // We assert on the refusal *reason* rather than the status: with no server
  // key configured in tests, chat will refuse with `no_server_key` (a
  // configuration answer) instead of `unauthenticated` (an identity answer).
  // Getting past identity is exactly what this test is checking.
  const response = await chatRoute.POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "guest hello" }] }),
    }),
  );
  if (response.status === 401) {
    const body = (await response.json()) as { code?: string };
    assert.notEqual(
      body.code,
      "unauthenticated",
      "chat must not reject a guest for lacking a token",
    );
  }
});
