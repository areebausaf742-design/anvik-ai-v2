/**
 * Supabase Auth client — official Supabase auth-js/SSR SDK for browser OAuth,
 * with plain fetch retained for the app's existing email/password flows.
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

import { createClient, isAuthPKCECodeVerifierMissingError } from "@supabase/supabase-js";

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

let browserSupabaseClient: ReturnType<typeof createClient> | null = null;

function browserSupabase() {
  if (browserSupabaseClient) return browserSupabaseClient;
  browserSupabaseClient = createClient(supabaseUrl(), supabaseKey(), {
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return browserSupabaseClient;
}

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

export function mapSupabaseAuthError(
  body: unknown,
  status: number,
  action: "signin" | "signup",
): string {
  const details = body && typeof body === "object" ? JSON.stringify(body).toLowerCase() : "";
  if (status === 429 || /rate.?limit|too many requests|over_email_send_rate_limit/.test(details)) {
    return "Too many attempts. Wait a moment, then try again.";
  }
  if (/email_not_confirmed|email not confirmed/.test(details)) {
    return "Confirm your email using the link in your inbox, then sign in again.";
  }
  if (/weak_password|password.*(at least|too short|weak)/.test(details)) {
    return "Choose a stronger password with at least 8 characters.";
  }
  if (/email_address_invalid|invalid email|email.*invalid/.test(details)) {
    return "Enter a valid email address.";
  }
  if (status >= 500) {
    return action === "signin"
      ? "Sign-in is temporarily unavailable. Please try again shortly."
      : "Account creation is temporarily unavailable. Please try again shortly.";
  }
  if (action === "signin") return "Invalid email or password.";
  return "Could not create your account with those details. Please try again.";
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

/**
 * Build a session from an auth-endpoint response body. Supabase answers with
 * either `expires_at` (epoch seconds) or `expires_in` (seconds from now) —
 * both are accepted, falling back to the default 1-hour lifetime otherwise.
 * Returns null when the body has no usable access token.
 *
 * Only used for the plain-fetch paths — the browser OAuth path is handled by
 * the official Supabase auth SDK, which owns its own expiry handling.
 */
function sessionFromBody(obj: Record<string, unknown>): AuthSession | null {
  if (!obj || typeof obj.access_token !== "string" || !obj.access_token) return null;
  let expiresAt: number;
  if (typeof obj.expires_at === "number" && obj.expires_at > 0) {
    expiresAt = obj.expires_at;
  } else if (typeof obj.expires_in === "number" && obj.expires_in > 0) {
    expiresAt = Math.floor(Date.now() / 1000) + obj.expires_in;
  } else {
    expiresAt = Math.floor(Date.now() / 1000) + 3600;
  }
  return {
    access_token: obj.access_token,
    refresh_token: typeof obj.refresh_token === "string" ? obj.refresh_token : "",
    expires_at: expiresAt,
    token_type: typeof obj.token_type === "string" ? obj.token_type : "bearer",
  };
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

function storePKCEVerifier(verifier: string): void {
  try { localStorage.setItem(PKCE_VERIFIER_KEY, verifier); } catch { /* unavailable */ }
}

function readPKCEVerifier(): string | null {
  try {
    const raw = localStorage.getItem(PKCE_VERIFIER_KEY);
    return raw && raw.trim() ? raw.trim() : null;
  } catch {
    return null;
  }
}

function clearPKCEVerifier(): void {
  try { localStorage.removeItem(PKCE_VERIFIER_KEY); } catch { /* unavailable */ }
}

/**
 * The message a user sees when the browser that started the flow no longer
 * holds its PKCE verifier.
 *
 * The old code surfaced the raw supabase-js error, which is written for
 * integrators — it talks about @supabase/ssr, cookie storage and "the auth flow
 * was initiated in a different browser". Told to an end user on a login screen,
 * that is noise about our internals and it suggests nothing to do. This message
 * says what happened in plain language and what to do next.
 */
export const OAUTH_VERIFIER_MISSING_MESSAGE =
  "That Google sign-in link has expired or was opened on a different device. Please tap \u201cContinue with Google\u201d to sign in again.";

/**
 * The recovery step after a failed PKCE exchange: drop every pending verifier.
 *
 * When the verifier is gone, supabase-js throws BEFORE its cleanup call, so the
 * flow index and the legacy fixed key are left behind. They are harmless on
 * their own, but they bias the next exchange towards a stale slot. Clearing
 * them makes the following attempt start from a clean state.
 *
 * Called when a verifier turns out to be missing, so it only ever touches
 * pending-flow bookkeeping — never a session, never an access/refresh token.
 */
export function resetStalePkceState(): void {
  try {
    const removable: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.endsWith("-code-verifier") || key.endsWith("-flows-code-verifier")) removable.push(key);
    }
    for (const key of removable) localStorage.removeItem(key);
  } catch {
    /* storage unavailable — nothing to clean */
  }
  clearPKCEVerifier();
}

function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes.buffer as ArrayBuffer);
}

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

/** The one callback URL this app uses. */
export const OAUTH_CALLBACK_PATH = "/login";
/** Where the post-login destination is stashed across the OAuth round-trip. */
const OAUTH_DESTINATION_KEY = "anvik-oauth-next";

/**
 * Build the exact `redirect_to` handed to supabase-js.
 *
 * The value is ALWAYS `${origin}/login` — no query string, no fragment.
 *
 * That is deliberate. Supabase compares `redirect_to` against the project's
 * Redirect URLs allow-list and, on a miss, silently substitutes the project's
 * Site URL, landing the user on a page with no `?code=` to exchange. The
 * allow-list entry configured for this app is the bare `/login`, so any
 * decorated variant (`/login?next=%2Fchat`) is one dashboard edit away from
 * breaking sign-in for everybody. A URL that cannot vary cannot drift out of
 * sync with the dashboard.
 *
 * The destination therefore travels out of band (see
 * `rememberOAuthDestination`) and is re-validated on return.
 */
export function buildOAuthRedirect(
  origin: string,
  destination?: string | null,
): { ok: true; redirectTo: string; destination: string } | { ok: false; error: string } {
  let base: URL;
  try {
    base = new URL(origin);
  } catch {
    return { ok: false, error: "Google sign-in is not available on this page." };
  }
  if (base.protocol !== "https:" && base.protocol !== "http:") {
    return { ok: false, error: "Google sign-in is not available on this page." };
  }
  return {
    ok: true,
    redirectTo: new URL(OAUTH_CALLBACK_PATH, base).toString(),
    destination: safeNextPath(destination) ?? "/chat",
  };
}

/** Pick a storage object that works in the current environment, if any. */
function destinationStorage(): Storage | null {
  try {
    if (typeof sessionStorage !== "undefined") return sessionStorage; // per-tab, survives the redirect
  } catch {
    /* blocked */
  }
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    /* blocked */
  }
  return null;
}

/**
 * Remember where to land after Google sign-in.
 *
 * Out of band because `redirect_to` must stay exactly allow-listed. This is not
 * a security boundary: whatever is read back goes through `safeNextPath()`
 * before it is used as a navigation target.
 */
export function rememberOAuthDestination(destination: string): void {
  try {
    destinationStorage()?.setItem(OAUTH_DESTINATION_KEY, destination);
  } catch {
    /* storage unavailable — the caller falls back to /chat */
  }
}

/** Read and clear the remembered destination, re-validating it. */
export function takeOAuthDestination(): string | null {
  try {
    const store = destinationStorage();
    if (!store) return null;
    const raw = store.getItem(OAUTH_DESTINATION_KEY);
    store.removeItem(OAUTH_DESTINATION_KEY);
    return safeNextPath(raw);
  } catch {
    return null;
  }
}

/**
 * Accept only a same-origin, absolute-path destination. Anything that could
 * leave the app — a scheme, a protocol-relative `//host`, a backslash trick, or
 * a non-path value — degrades to null and the caller falls back to /chat.
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || raw.length > 512) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
  if (/[\\\u0000-\u001f]/.test(raw)) return null;
  try {
    // Resolved against a throwaway origin: a value that escapes it is rejected.
    const probe = new URL(raw, "https://anvik.invalid");
    if (probe.origin !== "https://anvik.invalid") return null;
    return `${probe.pathname}${probe.search}${probe.hash}`;
  } catch {
    return null;
  }
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
  const checked = checkOAuthRedirectTarget(redirectTo, expectedOrigin);
  if (!checked.ok) return { ok: false, error: checked.error };
  if (!authEnabled()) return { ok: false, error: "Supabase is not configured." };
  if (typeof document === "undefined") {
    try {
      const verifier = generateCodeVerifier();
      storePKCEVerifier(verifier);
      const challenge = await sha256Base64Url(verifier);
      const url = new URL(authUrl("/authorize"));
      url.searchParams.set("provider", "google");
      url.searchParams.set("redirect_to", checked.url);
      url.searchParams.set("code_challenge", challenge);
      url.searchParams.set("code_challenge_method", "s256");
      authLog("authorize_started", { verifier: "present" });
      return { ok: true, authorizeUrl: url.toString() };
    } catch {
      return { ok: false, error: "Could not start Google sign-in." };
    }
  }
  try {
    const supabase = browserSupabase();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: checked.url,
        skipBrowserRedirect: true,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error || !data.url) {
      authLog("authorize_started", { verifier: "absent" });
      return { ok: false, error: "Could not start Google sign-in." };
    }

    // Do not navigate away unless the verifier is actually persisted.
    //
    // signInWithOAuth() writes the PKCE verifier to localStorage as a side
    // effect. If that write silently failed — storage disabled, private-mode
    // quota, a third-party-cookie-restricted webview — the browser is sent to
    // Google with a challenge it can never answer, and the user comes back to a
    // "verifier not found" error. Checking here turns that dead end into an
    // immediate, honest failure on the page that caused it.
    if (!hasStoredPkceVerifier()) {
      authLog("authorize_started", { verifier: "absent" });
      return {
        ok: false,
        error:
          "Your browser is not allowing ANVIK to save the sign-in state. Allow storage for this site (or leave private browsing) and try again.",
      };
    }

    authLog("authorize_started", { verifier: "present" });
    return { ok: true, authorizeUrl: data.url };
  } catch {
    return { ok: false, error: "Could not start Google sign-in." };
  }
}

/**
 * Is a PKCE verifier present for a flow supabase-js just started?
 *
 * Deliberately reads storage rather than trusting that the write happened: the
 * only thing that matters is what the callback will be able to find.
 */
export function hasStoredPkceVerifier(): boolean {
  try {
    if (readPKCEVerifier()) return true;
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.endsWith("-code-verifier") && localStorage.getItem(key)) return true;
    }
    return false;
  } catch {
    return false;
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
  authLog("exchange_started", { code: "present", verifier: "present" });
  if (typeof document === "undefined") {
    // SSR/no-DOM path: we run the exchange ourselves, so OUR verifier key is the
    // only one that matters here.
    const verifier = readPKCEVerifier();
    if (!verifier) {
      authLog("exchange_rejected", { code: "present", verifier: "absent" });
      return { ok: false, error: "Google sign-in was not started from this browser." };
    }
    try {
      const response = await fetch(authUrl("/token?grant_type=pkce"), {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
        signal: timeoutSignal(15000),
      });
      const body = await safeJson(response);
      clearPKCEVerifier();
      if (!response.ok) return { ok: false, error: readError(body, "Google sign-in could not be completed."), code: "oauth_failed" };
      const authSession = sessionFromBody((body ?? {}) as Record<string, unknown>);
      if (!authSession) return { ok: false, error: "Google sign-in could not be completed.", code: "oauth_failed" };
      await storeSession(authSession);
      const me = await getCurrentUser(authSession.access_token);
      return { ok: true, session: authSession, user: me.user ?? { id: "" } };
    } catch {
      authLog("exchange_network_error", { code: "present", reason: "network_error" });
      return { ok: false, error: "Could not reach the sign-in service. Please try again." };
    }
  }
  // Detect the "no verifier for this browser" case BEFORE calling the SDK.
  //
  // supabase-js throws AuthPKCECodeVerifierMissingError from inside
  // exchangeCodeForSession() when storage has no verifier slot and no legacy
  // key. We check the same two places ourselves so the user gets a deliberate
  // message in every environment — the SDK's own text is written for
  // integrators ("@supabase/ssr ... code verifier in cookies").
  if (!hasStoredPkceVerifier()) {
    authLog("exchange_rejected", { code: "present", verifier: "absent" });
    resetStalePkceState();
    return { ok: false, error: OAUTH_VERIFIER_MISSING_MESSAGE, code: "pkce_verifier_missing" };
  }

  try {
    const supabase = browserSupabase();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    // Belt and braces: a verifier can disappear between the check above and the
    // SDK's lookup (another tab finishing first, storage evicted mid-flight).
    // A missing verifier is a distinct, recoverable situation — the user has to
    // start again from this browser — and must never be reported with the raw
    // SDK text (it talks about @supabase/ssr and cookie adapters).
    if (error && isAuthPKCECodeVerifierMissingError(error)) {
      authLog("exchange_rejected", { code: "present", verifier: "absent" });
      resetStalePkceState();
      return { ok: false, error: OAUTH_VERIFIER_MISSING_MESSAGE, code: "pkce_verifier_missing" };
    }

    if (error || !data.session) {
      authLog("exchange_failed", { code: "present", reason: "invalid_response" });
      // Any other auth error still describes our internals; keep the detail in
      // diagnostics and give the user one actionable sentence.
      return {
        ok: false,
        error: "Google sign-in could not be completed. Please tap \u201cContinue with Google\u201d to try again.",
        code: "oauth_failed",
      };
    }
    const accessToken = data.session.access_token;
    const authSession: AuthSession = {
      access_token: accessToken,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
      token_type: data.session.token_type ?? "bearer",
    };
    await storeSession(authSession);
    authLog("exchange_succeeded", { code: "present" });
    const me = await getCurrentUser(authSession.access_token);
    return { ok: true, session: authSession, user: me.user ?? { id: "" } };
  } catch {
    // The official Supabase auth client owns PKCE verifier persistence and
    // recovery; no authorization code or verifier is retained in app code.
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
      signal: timeoutSignal(15_000),
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
      return { ok: false, error: mapSupabaseAuthError(body, response.status, "signup"), code: "signup_failed" };
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
    const session = sessionFromBody(obj);
    if (!session) {
      return { ok: false, error: "Could not create your account.", code: "signup_failed" };
    }
    await storeSession(session);
    return { ok: true, session, user: user ?? { id: "" } };
  } catch {
    return { ok: false, error: "Could not create your account." };
  }
}

export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  if (!authEnabled()) return { ok: false, error: "Supabase is not configured." };
  const maxAttempts = 3;
  let lastError = "Could not sign in. Check your email and password.";
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    try {
      const response = await fetch(authUrl("/token?grant_type=password"), {
        method: "POST",
        headers: headers(),
        signal: timeoutSignal(15_000),
        body: JSON.stringify({ email, password }),
      });
      const body = await safeJson(response);
      if (!response.ok) {
        if (response.status >= 500 && attempt < maxAttempts - 1) { lastError = mapSupabaseAuthError(body, response.status, "signin"); continue; }
        return { ok: false, error: mapSupabaseAuthError(body, response.status, "signin"), code: "signin_failed" };
      }
      const obj = (body ?? {}) as Record<string, unknown>;
      const accessToken = typeof obj.access_token === "string" ? obj.access_token : "";
      if (!accessToken) return { ok: false, error: "Could not sign in. Check your email and password.", code: "signin_failed" };
      const session = sessionFromBody(obj);
      if (!session) return { ok: false, error: "Could not sign in. Check your email and password.", code: "signin_failed" };
      await storeSession(session);
      const me = await getCurrentUser(session.access_token);
      return { ok: true, session, user: me.user ?? (obj.user as SupabaseUser) ?? { id: "" } };
    } catch {
      lastError = "Could not sign in. Check your email and password.";
      if (attempt < maxAttempts - 1) continue;
    }
  }
  return { ok: false, error: lastError, code: "signin_failed" };
}

export async function requestPasswordReset(email: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!authEnabled()) return { ok: false, error: "Supabase is not configured." };
  try {
    const response = await fetch(authUrl("/recover"), {
      method: "POST",
      headers: headers(),
      signal: timeoutSignal(15_000),
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
      signal: timeoutSignal(15_000),
      body: JSON.stringify({ refresh_token: stored.refresh_token }),
    });
    if (!response.ok) return null;
    const body = await safeJson(response);
    const obj = (body ?? {}) as Record<string, unknown>;
    const session = sessionFromBody(obj);
    if (!session) return null;
    // Preserve the caller's refresh token when the server does not issue one.
    if (!session.refresh_token) session.refresh_token = stored.refresh_token;
    await storeSession(session);
    const me = await getCurrentUser(session.access_token);
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
      const session = sessionFromBody(obj);
      if (!session) return { ok: false, error: "This reset link is invalid or expired.", code: "verify_failed" };
      await storeSession(session);
      const me = await getCurrentUser(session.access_token);
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
