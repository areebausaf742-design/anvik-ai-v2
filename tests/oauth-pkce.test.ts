import test, { mock } from "node:test";
import assert from "node:assert/strict";

const ORIGIN = "https://anvik-ai-v2.vercel.app";
const SUPABASE = "https://xcpufhqegxumpqoeqmqb.supabase.co";
const ANON = "anon-key-placeholder";

type MemStorage = { stores: Map<string, string> } & Storage;

function createMemLocalStorage(): MemStorage {
  const stores = new Map<string, string>();
  const storage = {
    stores,
    get length() { return stores.size; },
    clear: () => stores.clear(),
    getItem: (k: string) => (stores.has(k) ? stores.get(k)! : null),
    key: (i: number) => [...stores.keys()][i] ?? null,
    removeItem: (k: string) => { stores.delete(k); },
    setItem: (k: string, v: string) => { stores.set(k, String(v)); },
  } as MemStorage;
  return storage;
}

function getOfficialPkceVerifier(storage: MemStorage): string | null {
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && key.includes("code-verifier")) {
      return storage.getItem(key);
    }
  }
  return null;
}

function installBrowserStubs(): { localStorage: MemStorage; restore: () => void } {
  const localStorage = createMemLocalStorage();
  const previous = {
    window: (globalThis as Record<string, unknown>).window,
    localStorage: (globalThis as Record<string, unknown>).localStorage,
    document: (globalThis as Record<string, unknown>).document,
    location: (globalThis as Record<string, unknown>).location,
  };
  (globalThis as Record<string, unknown>).window = globalThis;
  (globalThis as Record<string, unknown>).localStorage = localStorage;
  (globalThis as Record<string, unknown>).location = { origin: ORIGIN, href: `${ORIGIN}/login` };
  return {
    localStorage,
    restore: () => {
      (globalThis as Record<string, unknown>).window = previous.window;
      (globalThis as Record<string, unknown>).localStorage = previous.localStorage;
      (globalThis as Record<string, unknown>).location = previous.location;
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

async function importAuth() {
  const auth = await import("../lib/auth");
  return auth;
}

function tokenResponse() {
  return new Response(
    JSON.stringify({
      access_token: "a".repeat(64),
      refresh_token: "r".repeat(64),
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "user-1" },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

const USER_JSON = JSON.parse(JSON.stringify({ id: "user-1", email: "user@example.com", user_metadata: { name: "Test User" } }));

/** A fetch mock dispatcher: records every call, answers token/user with canned bodies. */
function mockFetch(handlers: {
  token?: (body: string) => Response;
  user?: () => Response;
}) {
  const calls: Array<{ url: string; body?: string }> = [];
  const fetchMock = mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const body = typeof init?.body === "string" ? init.body : undefined;
    calls.push({ url, body });
    if (url.includes("/token?grant_type=pkce") && handlers.token) {
      return handlers.token(body ?? "");
    }
    if (url.includes("/user")) {
      return handlers.user ? handlers.user() : new Response(JSON.stringify(USER_JSON), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  });
  return { calls, restore: () => fetchMock.mock.restore() };
}

test("startGoogleOAuth builds a PKCE authorize URL with no client state and a pinned target", async () => {
  const envRestore = setAuthEnv();
  const browser = installBrowserStubs();
  try {
    const { startGoogleOAuth } = await importAuth();
    const result = await startGoogleOAuth(`${ORIGIN}/login`, ORIGIN);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const url = new URL(result.authorizeUrl);

    assert.equal(url.origin, `${SUPABASE}`);
    assert.ok(url.pathname.endsWith("/auth/v1/authorize") || url.pathname.endsWith("/auth/v1/authorize"));
    assert.equal(url.searchParams.get("provider"), "google");
    // The server supplies its own state — client-supplied state must NOT be present.
    assert.equal(url.searchParams.get("state"), null, "client-side state is never sent");
    assert.equal(url.searchParams.get("code_challenge_method"), "s256");
    const challenge = url.searchParams.get("code_challenge");
    assert.ok(challenge && challenge.length >= 43 && challenge.length <= 128, "challenge is a valid s256 value");
    assert.equal(url.searchParams.get("redirect_to"), `${ORIGIN}/login`);

    // The verifier lives in localStorage (never the URL), not sessionStorage.
    const verifier = browser.localStorage.getItem("anvik-pkce-verifier");
    assert.ok(verifier && verifier.length >= 43, "verifier is stored for the exchange");
    assert.equal(url.toString().includes(verifier), false, "verifier is never in the authorize URL");
    const expectedChallenge = await (async () => {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier!));
      const bytes = new Uint8Array(digest);
      let bin = "";
      for (const b of bytes) bin += String.fromCharCode(b);
      return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    })();
    assert.equal(challenge, expectedChallenge, "challenge is the s256 hash of the stored verifier");
  } finally {
    browser.restore();
    envRestore();
  }
});

test("startGoogleOAuth fails closed on a bad caller before any state is persisted", async () => {
  const envRestore = setAuthEnv();
  const browser = installBrowserStubs();
  try {
    const { startGoogleOAuth } = await importAuth();
    const result = await startGoogleOAuth("https://evil.example/login", ORIGIN);
    assert.equal(result.ok, false);
    assert.equal(browser.localStorage.getItem("anvik-pkce-verifier"), null, "no verifier persisted on a refused call");
  } finally {
    browser.restore();
    envRestore();
  }
});

test("completeGoogleOAuth fails closed with no code or no verifier, without any exchange", async () => {
  const envRestore = setAuthEnv();
  const browser = installBrowserStubs();
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response("{}", { status: 200 }));
  try {
    const { completeGoogleOAuth } = await importAuth();

    const noCode = await completeGoogleOAuth("");
    assert.equal(noCode.ok, false);

    const noVerifier = await completeGoogleOAuth("code-present");
    assert.equal(noVerifier.ok, false);

    assert.equal(fetchMock.mock.calls.length, 0, "no exchange is attempted without a valid flow");
  } finally {
    fetchMock.mock.restore();
    browser.restore();
    envRestore();
  }
});

test("completeGoogleOAuth exchanges the code, persists the session, and consumes the verifier", async () => {
  const envRestore = setAuthEnv();
  const browser = installBrowserStubs();
  const logs: string[] = [];
  const logMock = mock.method(console, "info", (msg?: unknown) => { logs.push(String(msg)); });
  const fetchMock = mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const body = typeof init?.body === "string" ? init.body : "";
    if (url.includes("/token?grant_type=pkce")) {
      const parsed = JSON.parse(body);
      assert.equal(parsed.auth_code, "code-from-callback");
      assert.ok(parsed.code_verifier && parsed.code_verifier.length >= 43, "verifier is sent to the exchange");
      return tokenResponse();
    }
    if (url.includes("/user")) return new Response(JSON.stringify(USER_JSON), { status: 200 });
    return new Response("{}", { status: 404 });
  });
  try {
    const { startGoogleOAuth, completeGoogleOAuth } = await importAuth();
    const start = await startGoogleOAuth(`${ORIGIN}/login`, ORIGIN);
    assert.equal(start.ok, true);

    const result = await completeGoogleOAuth("code-from-callback");
    assert.equal(result.ok, true);
    if (!result.ok || !result.session) return;
    assert.equal(result.session.access_token, "a".repeat(64));
    assert.equal(result.user.id, "user-1");
    assert.equal(result.user.email, "user@example.com");

    // The session is persisted in localStorage.
    const storedRaw = browser.localStorage.getItem("anvik-session");
    assert.ok(storedRaw, "session is persisted");
    const stored = JSON.parse(storedRaw!);
    assert.equal(stored.access_token, "a".repeat(64));

    // The verifier was consumed — replay is refused.
    assert.equal(browser.localStorage.getItem("anvik-pkce-verifier"), null, "verifier is consumed after exchange");
    const replay = await completeGoogleOAuth("code-from-callback");
    assert.equal(replay.ok, false, "replay of a consumed code is refused");

    // Sanitized diagnostics must never leak secrets or tokens.
    for (const line of logs) {
      assert.equal(line.includes("code-from-callback"), false, "authorization code never appears in logs");
      assert.equal(line.includes("anvik-pkce-verifier"), false, "verifier never appears in logs");
      assert.equal(line.includes("a".repeat(32)), false, "access token never appears in logs");
      assert.equal(line.includes("r".repeat(32)), false, "refresh token never appears in logs");
    }
  } finally {
    fetchMock.mock.restore();
    logMock.mock.restore();
    browser.restore();
    envRestore();
  }
});

test("completeGoogleOAuth handles an expired/failed exchange without persisting a session", async () => {
  const envRestore = setAuthEnv();
  const browser = installBrowserStubs();
  const fetchMock = mockFetch({
    token: () =>
      new Response(JSON.stringify({ error: "invalid_grant", error_description: "code exchange failed" }), {
        status: 422,
        headers: { "Content-Type": "application/json" },
      }),
  });
  try {
    const { startGoogleOAuth, completeGoogleOAuth } = await importAuth();
    const start = await startGoogleOAuth(`${ORIGIN}/login`, ORIGIN);
    assert.equal(start.ok, true);

    const result = await completeGoogleOAuth("code-from-callback");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "oauth_failed");
    assert.equal(browser.localStorage.getItem("anvik-session"), null, "no session persisted on failure");
    assert.equal(browser.localStorage.getItem("anvik-pkce-verifier"), null, "verifier is consumed even on failure");
  } finally {
    fetchMock.restore();
    browser.restore();
    envRestore();
  }
});

test("completeGoogleOAuth treats a malformed 200 as a failure and consumes the verifier", async () => {
  const envRestore = setAuthEnv();
  const browser = installBrowserStubs();
  const fetchMock = mockFetch({
    token: () => new Response(JSON.stringify({ error: "unexpected" }), { status: 200 }),
  });
  try {
    const { startGoogleOAuth, completeGoogleOAuth } = await importAuth();
    const start = await startGoogleOAuth(`${ORIGIN}/login`, ORIGIN);
    assert.equal(start.ok, true);

    const result = await completeGoogleOAuth("code-from-callback");
    assert.equal(result.ok, false);
    assert.equal(browser.localStorage.getItem("anvik-pkce-verifier"), null);
    assert.equal(browser.localStorage.getItem("anvik-session"), null);
  } finally {
    fetchMock.restore();
    browser.restore();
    envRestore();
  }
});

test("completeGoogleOAuth keeps the verifier on a network error so a retry can continue", async () => {
  const envRestore = setAuthEnv();
  const browser = installBrowserStubs();
  const callCount = { n: 0 };
  const fetchMock = mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    callCount.n += 1;
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/token?grant_type=pkce") && callCount.n === 1) throw new TypeError("network down");
    if (url.includes("/token?grant_type=pkce")) return tokenResponse();
    if (url.includes("/user")) return new Response(JSON.stringify(USER_JSON), { status: 200 });
    return new Response("{}", { status: 404 });
  });
  try {
    const { startGoogleOAuth, completeGoogleOAuth } = await importAuth();
    const start = await startGoogleOAuth(`${ORIGIN}/login`, ORIGIN);
    assert.equal(start.ok, true);
    const verifierBefore = browser.localStorage.getItem("anvik-pkce-verifier");
    assert.ok(verifierBefore);

    const first = await completeGoogleOAuth("code-from-callback");
    assert.equal(first.ok, false, "first exchange fails on network error");
    assert.equal(browser.localStorage.getItem("anvik-pkce-verifier"), verifierBefore, "verifier survives a network error");

    const second = await completeGoogleOAuth("code-from-callback");
    assert.equal(second.ok, true, "retry continues the same flow and succeeds");
    assert.equal(browser.localStorage.getItem("anvik-pkce-verifier"), null, "verifier consumed on success");
  } finally {
    fetchMock.mock.restore();
    browser.restore();
    envRestore();
  }
});

test("authEnabled is false with a partial config and both OAuth entry points fail closed", async () => {
  const prev = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "";
  try {
    const { authEnabled, startGoogleOAuth, completeGoogleOAuth } = await importAuth();
    assert.equal(authEnabled(), false);
    const start = await startGoogleOAuth(`${ORIGIN}/login`);
    assert.equal(start.ok, false);
    const complete = await completeGoogleOAuth("code-present");
    assert.equal(complete.ok, false);
  } finally {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = prev;
  }
});

test("no code param in the callback means no exchange is attempted", async () => {
  const envRestore = setAuthEnv();
  const browser = installBrowserStubs();
  const fetchMock = mockFetch({});
  try {
    const { completeGoogleOAuth } = await importAuth();
    const result = await completeGoogleOAuth("");
    assert.equal(result.ok, false);
    assert.equal(fetchMock.calls.length, 0, "no exchange attempted with no code");
  } finally {
    fetchMock.restore();
    browser.restore();
    envRestore();
  }
});
