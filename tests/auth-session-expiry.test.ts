import test, { mock } from "node:test";
import assert from "node:assert/strict";

const SUPABASE = "https://fake.supabase.test";
const ANON = "anon-key-placeholder";

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

function installBrowserStubs(): { localStorage: Storage; restore: () => void } {
  const stores = new Map<string, string>();
  const storage = {
    get length() { return stores.size; },
    clear: () => stores.clear(),
    getItem: (k: string) => (stores.has(k) ? stores.get(k)! : null),
    key: (i: number) => [...stores.keys()][i] ?? null,
    removeItem: (k: string) => { stores.delete(k); },
    setItem: (k: string, v: string) => { stores.set(k, String(v)); },
  } as Storage;
  const prevWindow = (globalThis as Record<string, unknown>).window;
  const prevLocalStorage = (globalThis as Record<string, unknown>).localStorage;
  (globalThis as Record<string, unknown>).window = globalThis;
  (globalThis as Record<string, unknown>).localStorage = storage;
  return {
    localStorage: storage as Storage,
    restore: () => {
      (globalThis as Record<string, unknown>).window = prevWindow;
      (globalThis as Record<string, unknown>).localStorage = prevLocalStorage;
    },
  };
}

test("signInWithPassword honors expires_in when expires_at is absent", async () => {
  const envRestore = setAuthEnv();
  const browser = installBrowserStubs();
  const fetchMock = mock.method(globalThis, "fetch", async () =>
    new Response(
      JSON.stringify({
        access_token: "a".repeat(64),
        refresh_token: "r".repeat(64),
        token_type: "bearer",
        expires_in: 1800,
        user: { id: "u-1" },
      }),
      { status: 200 },
    ),
  );
  try {
    const { signInWithPassword } = await import("../lib/auth");
    const result = await signInWithPassword("user@example.com", "password123");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.session, "session is stored");
    const session = result.session;
    const expected = Math.floor(Date.now() / 1000) + 1800;
    assert.ok(
      Math.abs(session.expires_at - expected) <= 10,
      `expires_at honors expires_in (got ${session.expires_at}, expected ~${expected})`,
    );
  } finally {
    fetchMock.mock.restore();
    browser.restore();
    envRestore();
  }
});

test("refreshSession honors expires_in when expires_at is absent", async () => {
  const envRestore = setAuthEnv();
  const browser = installBrowserStubs();
  browser.localStorage.setItem(
    "anvik-session",
    JSON.stringify({ access_token: "old-token-xxxxxxxx", refresh_token: "r".repeat(64), expires_at: Math.floor(Date.now() / 1000) - 10, token_type: "bearer" }),
  );
  const fetchMock = mock.method(globalThis, "fetch", async () =>
    new Response(
      JSON.stringify({
        access_token: "b".repeat(64),
        refresh_token: "r2".repeat(64),
        token_type: "bearer",
        expires_in: 1800,
      }),
      { status: 200 },
    ),
  );
  try {
    const { refreshSession } = await import("../lib/auth");
    const result = await refreshSession();
    assert.ok(result && result.ok, "refresh succeeds");
    if (!result || !result.ok || !result.session) return;
    const session = result.session;
    const expected = Math.floor(Date.now() / 1000) + 1800;
    assert.ok(
      Math.abs(session.expires_at - expected) <= 10,
      `expires_at honors expires_in (got ${session.expires_at}, expected ~${expected})`,
    );
  } finally {
    fetchMock.mock.restore();
    browser.restore();
    envRestore();
  }
});
