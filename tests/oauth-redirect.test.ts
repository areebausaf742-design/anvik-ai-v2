import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOAuthRedirect,
  rememberOAuthDestination,
  safeNextPath,
  takeOAuthDestination,
  OAUTH_VERIFIER_MISSING_MESSAGE,
} from "../lib/auth";

const ORIGIN = "https://anvik-ai-v2.vercel.app";

test("the OAuth callback is EXACTLY the allow-listed /login URL, for every destination", () => {
  // Regression: a decorated `redirect_to` (/login?next=%2Fchat) is not on the
  // project's Redirect URLs allow-list, so Supabase replaced it with the Site
  // URL and the user came back without a `?code=` to exchange.
  const cases: Array<string | null | undefined> = [
    undefined,
    null,
    "",
    "/chat",
    "/settings?tab=plan",
    "/library#top",
    "https://evil.example/steal",
    "//evil.example",
  ];
  for (const destination of cases) {
    const result = buildOAuthRedirect(ORIGIN, destination);
    assert.equal(result.ok, true);
    if (!result.ok) continue;
    assert.equal(
      result.redirectTo,
      `${ORIGIN}/login`,
      `redirect_to must carry no query/fragment for ${JSON.stringify(destination)}`,
    );
  }
});

test("the destination is remembered out of band instead of in the callback URL", () => {
  const stores = new Map<string, string>();
  const previous = (globalThis as Record<string, unknown>).sessionStorage;
  (globalThis as Record<string, unknown>).sessionStorage = {
    get length() { return stores.size; },
    clear: () => stores.clear(),
    getItem: (k: string) => (stores.has(k) ? stores.get(k)! : null),
    key: (i: number) => [...stores.keys()][i] ?? null,
    removeItem: (k: string) => { stores.delete(k); },
    setItem: (k: string, v: string) => { stores.set(k, String(v)); },
  };
  try {
    const built = buildOAuthRedirect(ORIGIN, "/settings?tab=plan");
    assert.equal(built.ok, true);
    if (!built.ok) return;
    rememberOAuthDestination(built.destination);
    assert.equal(takeOAuthDestination(), "/settings?tab=plan", "round-trips the destination");
    assert.equal(takeOAuthDestination(), null, "read is one-shot so a stale value cannot redirect later");
  } finally {
    (globalThis as Record<string, unknown>).sessionStorage = previous;
  }
});

test("a tampered remembered destination is discarded on read", () => {
  const stores = new Map<string, string>();
  const previous = (globalThis as Record<string, unknown>).sessionStorage;
  (globalThis as Record<string, unknown>).sessionStorage = {
    get length() { return stores.size; },
    clear: () => stores.clear(),
    getItem: (k: string) => (stores.has(k) ? stores.get(k)! : null),
    key: (i: number) => [...stores.keys()][i] ?? null,
    removeItem: (k: string) => { stores.delete(k); },
    setItem: (k: string, v: string) => { stores.set(k, String(v)); },
  };
  try {
    for (const hostile of ["https://evil.example", "//evil.example", "javascript:alert(1)"]) {
      rememberOAuthDestination(hostile);
      assert.equal(takeOAuthDestination(), null, `rejects ${hostile}`);
    }
  } finally {
    (globalThis as Record<string, unknown>).sessionStorage = previous;
  }
});

test("a hostile destination can never leave the app", () => {
  const hostile = [
    "https://evil.example/steal",
    "//evil.example/steal",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "  ",
    "",
  ];
  for (const value of hostile) {
    const result = buildOAuthRedirect(ORIGIN, value);
    assert.equal(result.ok, true, `origin stays valid for ${JSON.stringify(value)}`);
    if (!result.ok) continue;
    assert.equal(new URL(result.redirectTo).origin, ORIGIN, `never redirects off-origin for ${JSON.stringify(value)}`);
    assert.equal(result.destination, "/chat", `hostile destination is dropped: ${JSON.stringify(value)}`);
  }
});

test("safeNextPath accepts internal paths and rejects everything else", () => {
  assert.equal(safeNextPath("/chat"), "/chat");
  assert.equal(safeNextPath("/settings"), "/settings");
  assert.equal(safeNextPath("/library?q=code#top"), "/library?q=code#top");
  assert.equal(safeNextPath("https://evil.example"), null);
  assert.equal(safeNextPath("//evil.example"), null);
  assert.equal(safeNextPath("/\\evil.example"), null);
  assert.equal(safeNextPath("javascript:alert(1)"), null);
  assert.equal(safeNextPath(null), null);
  assert.equal(safeNextPath(undefined), null);
  assert.equal(safeNextPath(""), null);
  assert.equal(safeNextPath("/" + "a".repeat(600)), null, "absurd length is rejected");
});

test("buildOAuthRedirect fails closed on an unusable origin", () => {
  assert.equal(buildOAuthRedirect("not-a-url").ok, false);
  assert.equal(buildOAuthRedirect("javascript:alert(1)").ok, false);
});

test("the verifier-missing message is written for a user, not an integrator", () => {
  // Regression: the login screen used to print the raw supabase-js error, which
  // mentions @supabase/ssr, cookie storage and "a different browser or device".
  const lower = OAUTH_VERIFIER_MISSING_MESSAGE.toLowerCase();
  assert.equal(lower.includes("@supabase"), false, "no library names in user-facing copy");
  assert.equal(lower.includes("cookie"), false, "no storage internals in user-facing copy");
  assert.ok(/continue with google/i.test(OAUTH_VERIFIER_MISSING_MESSAGE), "tells the user what to do next");
});
