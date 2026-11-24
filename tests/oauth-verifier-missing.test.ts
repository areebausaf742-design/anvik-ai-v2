import test, { mock } from "node:test";
import assert from "node:assert/strict";

const ORIGIN = "https://anvik-ai-v2.vercel.app";
const SUPABASE = "https://xcpufhqegxumpqoeqmqb.supabase.co";

function createMemStorage() {
  const stores = new Map<string, string>();
  return {
    stores,
    get length() { return stores.size; },
    clear: () => stores.clear(),
    getItem: (k: string) => (stores.has(k) ? stores.get(k)! : null),
    key: (i: number) => [...stores.keys()][i] ?? null,
    removeItem: (k: string) => { stores.delete(k); },
    setItem: (k: string, v: string) => { stores.set(k, String(v)); },
  };
}

/**
 * Install a browser-ish environment with NO stored verifier, which is exactly
 * the state that produced the production error: the callback arrived in a
 * browser that never started the flow.
 */
function installBrowserWithoutVerifier() {
  const localStorage = createMemStorage();
  const previous = {
    window: (globalThis as Record<string, unknown>).window,
    localStorage: (globalThis as Record<string, unknown>).localStorage,
    location: (globalThis as Record<string, unknown>).location,
    document: (globalThis as Record<string, unknown>).document,
  };
  (globalThis as Record<string, unknown>).window = globalThis;
  (globalThis as Record<string, unknown>).localStorage = localStorage;
  (globalThis as Record<string, unknown>).location = { origin: ORIGIN, href: `${ORIGIN}/login` };
  // A real browser has a document; lib/auth uses its presence to pick the
  // client-side PKCE path over the SSR/no-DOM path.
  (globalThis as Record<string, unknown>).document = {};
  return {
    localStorage,
    restore: () => {
      (globalThis as Record<string, unknown>).window = previous.window;
      (globalThis as Record<string, unknown>).localStorage = previous.localStorage;
      (globalThis as Record<string, unknown>).location = previous.location;
      (globalThis as Record<string, unknown>).document = previous.document;
    },
  };
}

function setAuthEnv(): () => void {
  const prev = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "anon-key-placeholder";
  return () => {
    if (prev.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = prev.url;
    if (prev.key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = prev.key;
  };
}

test("a callback with no stored verifier fails with the user-facing message, not the SDK error", async () => {
  // Auth configured: this is the production shape of the bug.
  const envRestore = setAuthEnv();
  const browser = installBrowserWithoutVerifier();
  // No network call may be attempted: there is no verifier to exchange.
  const fetchMock = mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    assert.fail(`unexpected network call: ${String(input)}`);
  });
  try {
    const { completeGoogleOAuth, OAUTH_VERIFIER_MISSING_MESSAGE } = await import("../lib/auth");
    const result = await completeGoogleOAuth("an-oauth-code");
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "pkce_verifier_missing");
    assert.equal(result.error, OAUTH_VERIFIER_MISSING_MESSAGE);
    assert.equal(result.error.toLowerCase().includes("@supabase"), false);
    assert.equal(result.error.toLowerCase().includes("code verifier not found in storage"), false);
    assert.equal(
      fetchMock.mock.calls.length,
      0,
      "a missing verifier is detected locally, before burning a request",
    );
  } finally {
    fetchMock.mock.restore();
    browser.restore();
    envRestore();
  }
});

test("the recovery step clears every pending verifier so the next attempt is clean", async () => {
  const browser = installBrowserWithoutVerifier();
  // Leftovers from earlier flows, in the shapes supabase-js actually writes.
  browser.localStorage.setItem("sb-somekey-auth-token-flows-code-verifier", JSON.stringify(["abc"]));
  browser.localStorage.setItem("sb-somekey-auth-token-flow-abc-code-verifier", "stale");
  browser.localStorage.setItem("sb-somekey-auth-token-code-verifier", "stale-legacy");
  browser.localStorage.setItem("anvik-pkce-verifier", "stale");
  // An unrelated key must survive — this step may only touch PKCE state.
  browser.localStorage.setItem("anvik-theme", "dark");
  try {
    const { resetStalePkceState } = await import("../lib/auth");
    resetStalePkceState();
    assert.equal(browser.localStorage.getItem("sb-somekey-auth-token-flows-code-verifier"), null, "flow index cleared");
    assert.equal(browser.localStorage.getItem("sb-somekey-auth-token-flow-abc-code-verifier"), null, "stale slot cleared");
    assert.equal(browser.localStorage.getItem("sb-somekey-auth-token-code-verifier"), null, "legacy key cleared");
    assert.equal(browser.localStorage.getItem("anvik-pkce-verifier"), null);
    assert.equal(browser.localStorage.getItem("anvik-theme"), "dark", "unrelated storage is untouched");
  } finally {
    browser.restore();
  }
});

test("a stored verifier is reported as present so the flow may proceed", async () => {
  const browser = installBrowserWithoutVerifier();
  try {
    const { hasStoredPkceVerifier } = await import("../lib/auth");
    assert.equal(hasStoredPkceVerifier(), false, "nothing stored yet");
    browser.localStorage.setItem("sb-x-auth-token-code-verifier", "v".repeat(43));
    assert.equal(hasStoredPkceVerifier(), true, "the legacy fixed key counts");
  } finally {
    browser.restore();
  }
});
