import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const login = fs.readFileSync("app/login/page.tsx", "utf8");
const auth = fs.readFileSync("lib/auth.ts", "utf8");
const onboarding = fs.readFileSync("components/anvik/onboarding-flow.tsx", "utf8");
const consentRoute = fs.readFileSync("app/api/auth/consent/route.ts", "utf8");

test("legacy login route remains a guest-only redirect", () => {
  assert.ok(login.includes('redirect("/chat")'), "legacy login enters the guest workspace");
});

test("OAuth and onboarding preserve same-origin post-login destinations", () => {
  assert.ok(onboarding.includes("postLoginDestination"));
  assert.ok(onboarding.includes("target.origin === window.location.origin"));
});

test("legacy login route does not expose a sign-in form", () => {
  assert.ok(login.includes("Authentication is intentionally invisible in guest-only ANVIK."));
  assert.ok(login.includes('redirect("/chat")'));
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
