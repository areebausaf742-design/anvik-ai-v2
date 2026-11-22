/**
 * Supabase Auth client — plain fetch, no SDK (same contract as lib/supabase.ts).
 *
 * Handles the flows ANVIK needs:
 *  - email/password signup (with optional metadata)
 *  - email/password sign-in
 *  - Google OAuth via PKCE (code_challenge/s256 — no client secret ever)
 *  - password recovery emails (token_hash exchange)
 *  - session refresh via refresh_token
 *  - sign-out
 *
 * The browser uses only the public, anon/publishable key — never the service
 * role. Sessions are persisted in localStorage (see lib/session-context.tsx);
 * every protected API route re-validates the access token with Supabase
 * server-side (lib/session.ts), so the UI can never be trusted blindly.
 *
 * All methods return typed results and never throw — network and OAuth
 * failures are represented as data so the UI can show a clear message.
 */

// Read lazily on every call — an env var set at runtime (tests, SSR,
// long-lived server processes) must be visible without a reload.
function supabaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    ""
  ).replace(/\/+$/, "");
}

function supabaseKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    ""
  );
}

export function authEnabled(): boolean {
  return Boolean(supabaseUrl() && supabaseKey());
}

export type SupabaseUser = {
  id: string;
  email?: string;
  user_metadata?: {
    name?: string;
    full_name?: string;
    given_name?: string;
    family_name?: string;
    picture?: string;
    avatar_url?: string;
    [key: string]: unknown;
  } | null;
  app_metadata?: Record<string, unknown> | null;
  created_at?: string;
};

export type AuthSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch seconds
  token_type: string;
};

export type AuthResult =
  | { ok: true; session: AuthSession | null; user: SupabaseUser; emailConfirmationRequired?: boolean }
  | { ok: false; error: string; code?: string };

export type SessionResult =
  | { ok: true; session: AuthSession; user: SupabaseUser }
  | { ok: false; error: string; code?: string };

export type OAuthStartResult =
  | { ok: true; authorizeUrl: string }
  | { ok: false; error: string };

/* ------------------------------------------------------------------ */
/* Low-level REST                                                      */
/* ------------------------------------------------------------------ */

function authUrl(path: string): string {
  return `${supabaseUrl()}/auth/v1${path}`;
}

function headers(bearer?: string): Record<string, string> {
  const h: Record<string, string> = {
    apikey: supabaseKey(),
    "Content-Type": "application/json",
  };
  if (bearer) h["Authorization"] = `Bearer ${bearer}`;
  return h;
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readError(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    for (const key of ["msg", "message", "error_description", "error", "error_code"]) {
      const value = obj[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return fallback;
}

async function storeSession(session: AuthSession): Promise<void> {
  // localStorage is browser-only; server routes never write sessions here.
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("anvik-session", JSON.stringify(session));
  } catch {
    /* storage blocked — the session lives only in memory for this tab */
  }
}

export function readStoredSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("anvik-session");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.access_token === "string" &&
      parsed.access_token.length > 10 &&
      typeof parsed.refresh_token === "string" &&
      typeof parsed.expires_at === "number"
    ) {
      return parsed as AuthSession;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearStoredSession(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem("anvik-session");
  } catch {
    /* nothing to clear */
  }
}

/* ------------------------------------------------------------------ */
/* PKCE helpers                                                         */
/* ------------------------------------------------------------------ */

/**
 * A bounded AbortSignal for browser fetches. `AbortSignal.timeout()` is not
 * available in older mobile engines (iOS Safari before 16.4) — fall back to an
 * explicit controller so the timeout still applies (a bare `AbortSignal.timeout`
 * call there throws and silently degrades the flow).
 */
function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  if (typeof timer === "object" && typeof (timer as { unref?: () => void }).unref === "function") {
    (timer as { unref: () => void }).unref();
  }
  return controller.signal;
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Base64Url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(digest);
}

const PKCE_VERIFIER_KEY = "anvik-pkce-verifier";

/**
 * Sanitized diagnostic log — parameter presence and error categories only.
 * Never logs authorization codes, verifiers, access/refresh tokens, provider
 * secrets, or any raw value from a request or response body.
 */
function authLog(step: string, fields: Record<string, "present" | "absent" | "network_error" | "invalid_response">): void {
  try {
    const summary = Object.entries(fields)
      .map(([key, value]) => `${key}=${value}`)
      .join(", ");
    // eslint-disable-next-line no-console
    console.info(`[anvik-auth] ${step} (${summary})`);
  } catch {
    /* diagnostics must never break the flow */
  }
}

function storePKCEVerifier(verifier: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PKCE_VERIFIER_KEY, verifier);
  } catch {
    /* storage blocked — startGoogleOAuth still performs the flow best-effort */
  }
}

function readPKCEVerifier(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PKCE_VERIFIER_KEY);
    return raw && raw.trim() ? raw.trim() : null;
  } catch {
    return null;
  }
}

function clearPKCEVerifier(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(PKCE_VERIFIER_KEY);
  } catch {
    /* nothing to clear */
  }
}

function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes.buffer as ArrayBuffer);
}

/**
 * Validate the app-side redirect target for Google sign-in. The target must
 * parse as a URL and stay on the expected origin — the app never forwards an
 * OAuth return to an external domain, even if a buggy caller passed one.
 */
export function checkOAuthRedirectTarget(
  redirectTo: string,
  expectedOrigin?: string,
): { ok: true; url: string } | { ok: false; error: string } {
  let target: URL;
  try {
    target = new URL(redirectTo);
  } catch {
    return { ok: false, error: "Google sign-in is not available on this page." };
  }
  if (expectedOrigin && target.origin !== expectedOrigin) {
    return { ok: false, error: "Google sign-in is not available on this page." };
  }
  return { ok: true, url: target.toString() };
}

/**
 * Build the Google /authorize URL (PKCE) and persist the verifier alongside
 * the current session in localStorage — mirroring the official Supabase
 * auth-js implementation.
 *
 * `redirectTo` is the app-side URL Google should return to after sign-in —
 * it must stay on the app's origin. `expectedOrigin` pins that contract;
 * pass the current origin so a buggy caller can never bounce the user to an
 * external domain. `redirectTo` must be absolute.
 *
 * State: the server generates its own state (a flow-state UUID) and strips
 * client-supplied state params — do NOT send a client state. The PKCE
 * verifier is the CSRF protection: only the browser that created it can
 * exchange the authorization code.
 */
export async function startGoogleOAuth(redirectTo: string, expectedOrigin?: string): Promise<OAuthStartResult> {
  // The redirect target is app-level configuration: it is checked BEFORE the
  // provider check so a bad caller fails closed even when the provider is set.
  const checked = checkOAuthRedirectTarget(redirectTo, expectedOrigin);
  if (!checked.ok) return { ok: false, error: checked.error };
  if (!authEnabled()) return { ok: false, error: "Supabase is not configured." };
  const target = new URL(checked.url);
  try {
    const verifier = generateCodeVerifier();
    storePKCEVerifier(verifier);
    const challenge = await sha256Base64Url(verifier);
    const url = new URL(authUrl("/authorize"));
    url.searchParams.set("provider", "google");
    url.searchParams.set("redirect_to", target.toString());
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "s256");
    authLog("authorize_started", { verifier: "present" });
    return { ok: true, authorizeUrl: url.toString() };
  } catch {
    return { ok: false, error: "Could not start Google sign-in." };
  }
}

/**
 * Exchange the authorization code returned by the OAuth redirect for a
 * Supabase session. Requires:
 *  - the `code` present in the return URL (Supabase sends only the code)
 *  - the verifier stored by the same browser that started the flow
 *
 * On any exchange attempt the verifier is consumed (removed) when a network
 * response is received. If the fetch itself fails (network error/abort) the
 * verifier is preserved so a retry can continue the flow. No state parameter
 * is ever read or compared — the server owns state and PKCE is the CSRF
 * protection; verifying state here was both wrong and the source of the
 * production "could not be verified" failures.
 */
export async function completeGoogleOAuth(code: string): Promise<AuthResult> {
  if (!authEnabled()) return { ok: false, error: "Supabase is not configured." };
  if (!code) {
    authLog("exchange_rejected", { code: "absent" });
    return { ok: false, error: "Google sign-in was not started from this browser." };
  }
  const verifier = readPKCEVerifier();
  if (!verifier) {
    authLog("exchange_rejected", { code: "present", verifier: "absent" });
    return { ok: false, error: "Google sign-in was not started from this browser." };
  }
  authLog("exchange_started", { code: "present", verifier: "present" });
  try {
    const response = await fetch(authUrl("/token?grant_type=pkce"), {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
      signal: timeoutSignal(15000),
    });
    const body = await safeJson(response);
    // Any response — success or failure — consumes the verifier (official
    // auth-js behavior): a one-shot code must not be replayed.
    clearPKCEVerifier();
    if (!response.ok) {
      authLog("exchange_failed", { code: "present", reason: "invalid_response" });
      return { ok: false, error: readError(body, "Google sign-in could not be completed."), code: "oauth_failed" };
    }
    const session = (body as Record<string, unknown>) ?? {};
    const accessToken = typeof session.access_token === "string" ? session.access_token : "";
    if (!accessToken) {
      authLog("exchange_failed", { code: "present", reason: "invalid_response" });
      return { ok: false, error: "Google sign-in could not be completed.", code: "oauth_failed" };
    }
    const authSession: AuthSession = {
      access_token: accessToken,
      refresh_token: typeof session.refresh_token === "string" ? session.refresh_token : "",
      expires_at: typeof session.expires_at === "number" ? session.expires_at : Math.floor(Date.now() / 1000) + 3600,
      token_type: typeof session.token_type === "string" ? session.token_type : "bearer",
    };
    await storeSession(authSession);
    authLog("exchange_succeeded", { code: "present" });
    const me = await getCurrentUser(authSession.access_token);
    return { ok: true, session: authSession, user: me.user ?? { id: "" } };
  } catch {
    // Network failure — the server never received the code, so the verifier
    // stays stored; a retry continues the same flow.
    authLog("exchange_network_error", { code: "present", reason: "network_error" });
    return { ok: false, error: "Could not reach the sign-in service. Please try again." };
  }
}

/* ------------------------------------------------------------------ */
/* Email / password                                                     */
/* ------------------------------------------------------------------ */

export async function signUpWithPassword(
  email: string,
  password: string,
  metadata: { name?: string; provider?: string } = {},
): Promise<AuthResult> {
  if (!authEnabled()) return { ok: false, error: "Supabase is not configured." };
  try {
    const response = await fetch(authUrl("/signup"), {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        email,
        password,
        data: {
          name: metadata.name?.trim() || undefined,
          provider: metadata.provider ?? "email",
        },
      }),
    });
    const body = await safeJson(response);
    const obj = (body ?? {}) as Record<string, unknown>;
    if (!response.ok) {
      return { ok: false, error: readError(body, "Could not create your account."), code: "signup_failed" };
    }
    const accessToken = typeof obj.access_token === "string" ? obj.access_token : null;
    const user = (obj.user ?? obj.user_metadata ?? obj) as SupabaseUser | undefined;
    if (!accessToken) {
      // Email confirmation required — the account exists but has no session.
      return {
        ok: true,
        session: null,
        user: user ?? { id: "" },
        emailConfirmationRequired: true,
      };
    }
    const session: AuthSession = {
      access_token: accessToken,
      refresh_token: typeof obj.refresh_token === "string" ? obj.refresh_token : "",
      expires_at:
        typeof obj.expires_at === "number"
          ? obj.expires_at
          : Math.floor(Date.now() / 1000) + 3600,
      token_type: typeof obj.token_type === "string" ? obj.token_type : "bearer",
    };
    await storeSession(session);
    return { ok: true, session, user: user ?? { id: "" } };
  } catch {
    return { ok: false, error: "Could not create your account." };
  }
}

export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  if (!authEnabled()) return { ok: false, error: "Supabase is not configured." };
  try {
    const response = await fetch(authUrl("/token?grant_type=password"), {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ email, password }),
    });
    const body = await safeJson(response);
    if (!response.ok) {
      return { ok: false, error: readError(body, "Could not sign in. Check your email and password."), code: "signin_failed" };
    }
    const obj = (body ?? {}) as Record<string, unknown>;
    const accessToken = typeof obj.access_token === "string" ? obj.access_token : "";
    if (!accessToken) {
      return { ok: false, error: "Could not sign in. Check your email and password.", code: "signin_failed" };
    }
    const session: AuthSession = {
      access_token: accessToken,
      refresh_token: typeof obj.refresh_token === "string" ? obj.refresh_token : "",
      expires_at:
        typeof obj.expires_at === "number"
          ? obj.expires_at
          : Math.floor(Date.now() / 1000) + 3600,
      token_type: typeof obj.token_type === "string" ? obj.token_type : "bearer",
    };
    await storeSession(session);
    const me = await getCurrentUser(accessToken);
    return { ok: true, session, user: me.user ?? (obj.user as SupabaseUser) ?? { id: "" } };
  } catch {
    return { ok: false, error: "Could not sign in. Check your email and password." };
  }
}

export async function requestPasswordReset(email: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!authEnabled()) return { ok: false, error: "Supabase is not configured." };
  try {
    const response = await fetch(authUrl("/recover"), {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ email }),
    });
    // Always report success for email-not-found too — the endpoint deliberately
    // answers the same for unknown emails.
    if (!response.ok) {
      // A genuine error (e.g. rate limit) is surfaced; Supabase answers 422/404
      // for unknown emails which we deliberately do not distinguish.
      if (response.status === 429) return { ok: false, error: "Too many attempts — try again later." };
      return { ok: true };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not send the reset email. Please try again." };
  }
}

/* ------------------------------------------------------------------ */
/* Session management                                                   */
/* ------------------------------------------------------------------ */

export async function refreshSession(): Promise<AuthResult | null> {
  const stored = readStoredSession();
  if (!stored) return null;
  if (!stored.refresh_token) return null;
  try {
    const response = await fetch(authUrl("/token?grant_type=refresh_token"), {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ refresh_token: stored.refresh_token }),
    });
    if (!response.ok) return null;
    const body = await safeJson(response);
    const obj = (body ?? {}) as Record<string, unknown>;
    const accessToken = typeof obj.access_token === "string" ? obj.access_token : "";
    if (!accessToken) return null;
    const session: AuthSession = {
      access_token: accessToken,
      refresh_token: typeof obj.refresh_token === "string" ? obj.refresh_token : stored.refresh_token,
      expires_at:
        typeof obj.expires_at === "number"
          ? obj.expires_at
          : Math.floor(Date.now() / 1000) + 3600,
      token_type: typeof obj.token_type === "string" ? obj.token_type : "bearer",
    };
    await storeSession(session);
    const me = await getCurrentUser(accessToken);
    return { ok: true, session, user: me.user ?? { id: "" } };
  } catch {
    return null;
  }
}

export function isSessionUsable(session: AuthSession | null): boolean {
  if (!session) return false;
  return session.expires_at - 60 > Math.floor(Date.now() / 1000);
}

export async function getCurrentUser(accessToken: string): Promise<{ ok: boolean; user: SupabaseUser | null; status: number }> {
  if (!accessToken || !authEnabled()) return { ok: false, user: null, status: 401 };
  try {
    const response = await fetch(authUrl("/user"), {
      method: "GET",
      headers: headers(accessToken),
      cache: "no-store",
      signal: timeoutSignal(5000),
    });
    if (!response.ok) return { ok: false, user: null, status: response.status };
    const body = await safeJson(response);
    return { ok: true, user: body as SupabaseUser, status: response.status };
  } catch {
    return { ok: false, user: null, status: 401 };
  }
}

export async function signOut(accessToken?: string): Promise<void> {
  const stored = readStoredSession();
  const token = accessToken ?? stored?.access_token;
  if (token && authEnabled()) {
    try {
      await fetch(authUrl("/logout"), {
        method: "POST",
        headers: headers(token),
        signal: timeoutSignal(5000),
      });
    } catch {
      /* best-effort — sign-out proceeds locally regardless */
    }
  }
  clearStoredSession();
}

/* ------------------------------------------------------------------ */
/* Password recovery callback handling                                  */
/* ------------------------------------------------------------------ */

/**
 * Exchange an email recovery link for a session. Two shapes are accepted:
 *  - hash in the URL (#access_token=...&type=recovery) — legacy implicit
 *  - ?token_hash=...&type=recovery in the query string — the newer flow
 */
export async function completeRecoveryLink(
  query: { tokenHash?: string; type?: string },
  hashAccessToken?: string,
): Promise<AuthResult> {
  if (!authEnabled()) return { ok: false, error: "Supabase is not configured." };
  try {
    if (hashAccessToken) {
      const me = await getCurrentUser(hashAccessToken);
      const session: AuthSession = {
        access_token: hashAccessToken,
        refresh_token: "",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: "bearer",
      };
      await storeSession(session);
      return { ok: true, session, user: me.user ?? { id: "" } };
    }
    if (query.tokenHash && query.type) {
      const response = await fetch(authUrl("/verify"), {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ token_hash: query.tokenHash, type: query.type }),
      });
      const body = await safeJson(response);
      if (!response.ok) {
        return { ok: false, error: readError(body, "This reset link is invalid or expired."), code: "verify_failed" };
      }
      const obj = (body ?? {}) as Record<string, unknown>;
      const accessToken = typeof obj.access_token === "string" ? obj.access_token : "";
      if (!accessToken) return { ok: false, error: "This reset link is invalid or expired.", code: "verify_failed" };
      const session: AuthSession = {
        access_token: accessToken,
        refresh_token: typeof obj.refresh_token === "string" ? obj.refresh_token : "",
        expires_at: typeof obj.expires_at === "number" ? obj.expires_at : Math.floor(Date.now() / 1000) + 3600,
        token_type: typeof obj.token_type === "string" ? obj.token_type : "bearer",
      };
      await storeSession(session);
      const me = await getCurrentUser(accessToken);
      return { ok: true, session, user: me.user ?? (obj.user as SupabaseUser) ?? { id: "" } };
    }
    return { ok: false, error: "This reset link is invalid or expired." };
  } catch {
    return { ok: false, error: "This reset link is invalid or expired." };
  }
}

/** Set a new password for the currently authenticated user (recovery flow). */
export async function updatePassword(accessToken: string, newPassword: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!authEnabled()) return { ok: false, error: "Supabase is not configured." };
  try {
    const response = await fetch(authUrl("/user"), {
      method: "PUT",
      headers: headers(accessToken),
      body: JSON.stringify({ password: newPassword }),
    });
    if (!response.ok) {
      const body = await safeJson(response);
      return { ok: false, error: readError(body, "Could not update your password.") };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not update your password." };
  }
}

/* ------------------------------------------------------------------ */
/* Display name & profile update (authenticated)                        */
/* ------------------------------------------------------------------ */

export async function updateProfileMetadata(
  accessToken: string,
  data: { name?: string },
): Promise<{ ok: boolean; error?: string }> {
  if (!authEnabled()) return { ok: false, error: "Supabase is not configured." };
  try {
    const response = await fetch(authUrl("/user"), {
      method: "PUT",
      headers: headers(accessToken),
      body: JSON.stringify({ data }),
    });
    if (!response.ok) {
      const body = await safeJson(response);
      return { ok: false, error: readError(body, "Could not update your profile.") };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not update your profile." };
  }
}
