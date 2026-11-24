import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { aiRequestHeaders, mapHttpErrorMessage } from "../lib/client-api";

/**
 * Finding P1 from the frontend audit: the Image, Code, Voice and Vision clients
 * sent requests with no `Authorization: Bearer` header, while their API routes
 * require a verified user. Those four screens could therefore never authenticate
 * a signed-in user — they were dead on arrival.
 */

test("the bearer token is sent when the user is signed in", () => {
  const headers = aiRequestHeaders({ token: "session-access-token" });
  assert.equal(headers.Authorization, "Bearer session-access-token");
  assert.equal(headers["Content-Type"], "application/json");
});

test("a personal Gemini key is a separate header, never the bearer token", () => {
  const headers = aiRequestHeaders({ token: "session-token", apiKey: "AIza-personal-key" });
  assert.equal(headers.Authorization, "Bearer session-token");
  assert.equal(headers["x-google-generative-ai-api-key"], "AIza-personal-key");
});

test("signed out sends no Authorization header at all", () => {
  for (const token of [null, undefined, ""]) {
    const headers = aiRequestHeaders({ token });
    assert.equal("Authorization" in headers, false, `no token header for ${String(token)}`);
  }
});

test("the optional pieces appear only when asked for", () => {
  const plain = aiRequestHeaders({});
  assert.equal("Accept" in plain, false);
  assert.equal("x-anvik-request-id" in plain, false);
  const full = aiRequestHeaders({ accept: "text/event-stream", requestId: "req-1" });
  assert.equal(full.Accept, "text/event-stream");
  assert.equal(full["x-anvik-request-id"], "req-1");
});

test("every AI studio request goes through the shared header builder", () => {
  // The studios used to hand-build header objects and forget the token. They
  // must use the one helper, so a new studio cannot repeat the omission.
  for (const file of [
    "components/anvik/creative-studio.tsx",
    "components/anvik/vision-studio.tsx",
  ]) {
    const source = readFileSync(file, "utf8");
    assert.ok(source.includes("aiRequestHeaders("), `${file} must use the shared headers`);
    assert.ok(source.includes("bearerToken()"), `${file} must pass the session token`);
    assert.equal(
      /"x-anvik-device":\s*readDeviceId\(\)/.test(source),
      false,
      `${file} must not hand-build request headers`,
    );
  }
});

test("an auth refusal is not reported as a bad personal key", () => {
  // These are different problems with different fixes: one needs a sign-in, the
  // other needs a new Gemini key. Reporting the first as the second sent people
  // to the wrong settings screen.
  const unauthenticated = mapHttpErrorMessage(401, "You must be signed in.", "unauthenticated");
  assert.match(unauthenticated, /sign in/i);
  assert.doesNotMatch(unauthenticated, /api key/i);

  const badKey = mapHttpErrorMessage(401, undefined, "bad_format");
  assert.match(badKey, /key/i);
});

test("the guest limit points at the free account instead of a dead end", () => {
  const limited = mapHttpErrorMessage(429, undefined, "guest_limit_reached");
  assert.match(limited, /sign in/i, "tells the user how to continue");
});

test("the free-key status reports the SERVER key, not the user's local one", () => {
  // Reported live: Settings said "No free key detected — add your own below"
  // under the "ANVIK Free Key (Automatic)" heading while /api/health and
  // /api/quota both confirmed a working server key. The badge was reading the
  // locally-saved personal key, so a user with no personal key was told the
  // product was broken.
  // Strip comments: the fix explains the old wording in prose, and that must
  // not count as the wording still being there.
  const source = readFileSync("components/anvik/settings-screen.tsx", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.ok(source.includes("quota?.hasServerKey"), "the badge must consult hasServerKey");
  assert.ok(
    !/No free key detected/.test(source),
    "the misleading wording must be gone",
  );
  assert.ok(
    source.includes("Automatic free key active"),
    "an available server key is stated plainly",
  );
  // And it must not assert a key problem before usage has loaded.
  assert.ok(source.includes("Checking availability"), "unknown state says so instead of guessing");
});
