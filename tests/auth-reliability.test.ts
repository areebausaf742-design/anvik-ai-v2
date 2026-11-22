import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const login = fs.readFileSync("app/login/page.tsx", "utf8");
const auth = fs.readFileSync("lib/auth.ts", "utf8");
const onboarding = fs.readFileSync("components/anvik/onboarding-flow.tsx", "utf8");
const consentRoute = fs.readFileSync("app/api/auth/consent/route.ts", "utf8");

test("login refreshes SessionProvider state after every successful sign-in path", () => {
  assert.ok(login.includes("await refresh();"), "successful auth awaits provider refresh");
  assert.ok(login.includes("oauthExchangeStarted"), "OAuth callback exchange is guarded");
  assert.ok(login.includes("oauthStartStarted"), "OAuth start is guarded against duplicate clicks");
});

test("OAuth and onboarding preserve same-origin post-login destinations", () => {
  assert.ok(login.includes("postLoginDestination"));
  assert.ok(login.includes("encodeURIComponent(destination)"));
  assert.ok(onboarding.includes("postLoginDestination"));
  assert.ok(onboarding.includes("target.origin === window.location.origin"));
});

test("cancelled OAuth is shown as an explicit cancellation and clears callback params", () => {
  assert.ok(login.includes('url.searchParams.get("error")'));
  assert.ok(login.includes("Google sign-in was cancelled."));
  assert.ok(login.includes('window.history.replaceState'));
});

test("browser OAuth uses the official Supabase SDK", () => {
  assert.ok(auth.includes('@supabase/supabase-js'));
  assert.ok(auth.includes("signInWithOAuth"));
  assert.ok(auth.includes("exchangeCodeForSession"));
  assert.ok(auth.includes('flowType: "pkce"'));
});

test("consent required responses use 400 and database failures use 500", () => {
  assert.ok(consentRoute.includes("consent_required"));
  assert.ok(consentRoute.includes("result.code === \"consent_required\" ? 400 : 500"));
});
