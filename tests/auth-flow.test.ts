import test from "node:test";
import assert from "node:assert/strict";
import { authEnabled } from "../lib/auth";

test("auth is never silently enabled — requires URL + a key", () => {
  assert.equal(authEnabled(), false);
});

test("Google OAuth redirect target is pinned to the app origin", async () => {
  const { startGoogleOAuth, checkOAuthRedirectTarget } = await import("../lib/auth");
  const origin = "https://anvik-ai-v2.vercel.app";

  // Cross-origin targets are refused fail-closed, never forwarded to the provider.
  assert.equal(checkOAuthRedirectTarget("https://anvik-ai-sooty.vercel.app/login", origin).ok, false);
  assert.equal(checkOAuthRedirectTarget("https://evil.example/login?next=//x", origin).ok, false);
  assert.equal((await startGoogleOAuth("https://anvik-ai-sooty.vercel.app/login", origin)).ok, false);
  assert.equal((await startGoogleOAuth("https://evil.example/login?next=//x", origin)).ok, false);

  // Malformed redirect targets are refused outright.
  assert.equal(checkOAuthRedirectTarget("not a url", origin).ok, false);
  assert.equal((await startGoogleOAuth("not a url", origin)).ok, false);

  // Same-origin targets are accepted.
  const same = checkOAuthRedirectTarget(`${origin}/login`, origin);
  assert.equal(same.ok, true);
  if (same.ok) assert.equal(same.url, `${origin}/login`);
});
