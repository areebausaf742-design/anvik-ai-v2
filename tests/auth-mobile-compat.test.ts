import test, { mock } from "node:test";
import assert from "node:assert/strict";

const SUPABASE = "https://xcpufhqegxumpqoeqmqb.supabase.co";
const ANON = "anon-key-placeholder";
const ORIGIN = "https://anvik-ai-v2.vercel.app";

type MemStorage = Map<string, string>;

function installBrowserStubs(): { storage: MemStorage; restore: () => void } {
  const stores = new Map<string, string>();
  const storage: MemStorage & Storage = {
    ...stores,
    get length() { return stores.size; },
    clear: () => stores.clear(),
    getItem: (k: string) => (stores.has(k) ? stores.get(k)! : null),
    key: (i: number) => [...stores.keys()][i] ?? null,
    removeItem: (k: string) => { stores.delete(k); },
    setItem: (k: string, v: string) => { stores.set(k, String(v)); },
  } as MemStorage & Storage;
  const previousWindow = (globalThis as Record<string, unknown>).window;
  const previousLocalStorage = (globalThis as Record<string, unknown>).localStorage;
  (globalThis as Record<string, unknown>).window = globalThis;
  (globalThis as Record<string, unknown>).localStorage = storage;
  return {
    storage: stores,
    restore: () => {
      (globalThis as Record<string, unknown>).window = previousWindow;
      (globalThis as Record<string, unknown>).localStorage = previousLocalStorage;
    },
  };
}

function setAuthEnv(): () => void {
  const prev = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON;
  return () => {
    if (prev.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = prev.url;
    if (prev.key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = prev.key;
  };
}

function tokenResponse() {
  return new Response(
    JSON.stringify({
      access_token: "a".repeat(64),
      refresh_token: "r".repeat(64),
      token_type: "bearer",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "user-1" },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

test("getCurrentUser still verifies the session when AbortSignal.timeout is unavailable (old iOS Safari)", async () => {
  const envRestore = setAuthEnv();
  const browser = installBrowserStubs();
  const originalAbortSignal = (globalThis as Record<string, unknown>).AbortSignal as Record<string, unknown>;
  // Simulate a pre-16.4 iOS Safari engine: no AbortSignal.timeout.
  (globalThis as Record<string, unknown>).AbortSignal = { ...originalAbortSignal, timeout: undefined };
  const calls: Array<{ url: string }> = [];
  const fetchMock = mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url });
    return new Response(JSON.stringify({ id: "u-1", email: "user@example.com" }), { status: 200 });
  });
  try {
    const { getCurrentUser } = await import("../lib/auth");
    const result = await getCurrentUser("a".repeat(64));
    assert.equal(result.ok, true, "session verification must not be blocked by a missing AbortSignal.timeout");
    assert.equal(result.user?.id, "u-1");
    assert.ok(calls.some((c) => c.url.includes("/user")), "a /user request went out");
  } finally {
    fetchMock.mock.restore();
    (globalThis as Record<string, unknown>).AbortSignal = originalAbortSignal;
    browser.restore();
    envRestore();
  }
});

test("completeGoogleOAuth bounds the exchange fetch with an AbortSignal (mobile-safe)", async () => {
  const envRestore = setAuthEnv();
  const browser = installBrowserStubs();
  browser.storage.set("anvik-pkce-verifier", "test-verifier-value");
  const seen: Array<{ url: string; signal: unknown }> = [];
  const fetchMock = mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes("/token?grant_type=pkce")) {
      seen.push({ url, signal: init?.signal ?? null });
      return tokenResponse();
    }
    if (url.includes("/user")) {
      return new Response(JSON.stringify({ id: "user-1", email: "user@example.com" }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  });
  try {
    const { completeGoogleOAuth } = await import("../lib/auth");
    const result = await completeGoogleOAuth("code-from-callback");
    assert.equal(result.ok, true, "exchange succeeds");
    assert.ok(seen.length === 1, "the exchange fetch was made exactly once");
    assert.ok(seen[0].signal instanceof AbortSignal, "the exchange fetch carries an AbortSignal");
  } finally {
    fetchMock.mock.restore();
    browser.restore();
    envRestore();
  }
});

test("startGoogleOAuth still pins the redirect target to the app origin", async () => {
  const envRestore = setAuthEnv();
  const browser = installBrowserStubs();
  try {
    const { startGoogleOAuth } = await import("../lib/auth");
    const ok = await startGoogleOAuth(`${ORIGIN}/login`, ORIGIN);
    assert.equal(ok.ok, true);
    const bad = await startGoogleOAuth("https://evil.example.com/login", ORIGIN);
    assert.equal(bad.ok, false, "cross-origin redirect targets are rejected");
  } finally {
    browser.restore();
    envRestore();
  }
});
