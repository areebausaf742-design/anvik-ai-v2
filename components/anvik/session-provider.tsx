"use client";

/**
 * SessionProvider — the single client-side session source for ANVIK.
 *
 * It owns the Supabase access token (localStorage, scoped to this app) and
 * re-validates it server-side on every refresh. Every protected API call in
 * the app passes the token as a bearer header; the server re-verifies it
 * against Supabase on every request — the UI is never trusted blindly.
 *
 * Consumed by: the chat workspace (quota + identity), the account dashboard,
 * the settings screen and the auth pages.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  clearStoredSession,
  isSessionUsable,
  readStoredSession,
  refreshSession,
  signOut as authSignOut,
  signInAnonymously,
  updateProfileMetadata,
  type AuthSession,
  type SupabaseUser,
} from "@/lib/auth";
import { emailFallbackName } from "@/lib/session";
import { setLearningOwner } from "@/lib/learning";

export type AccountProfile = {
  id: string;
  email: string;
  name: string;
  provider: "google" | "email" | "anonymous" | "unknown";
  avatarUrl: string | null;
  createdAt: string | null;
  accountStatus: string;
};

export type AccountCredits = {
  planId: string;
  planName: string;
  status: string;
  expiry: string | null;
  dailyLimit: number | null;
  dailyUsed: number | null;
  dailyRemaining: number | null;
  packRemaining: number | null;
  packExpiry: string | null;
  totalRemaining: number | null;
};

export type AccountConsent = {
  hasAccepted: boolean;
  aiImprovementConsent: boolean;
  withdrawnAt: string | null;
  termsAcceptedAt: string | null;
  privacyAcceptedAt: string | null;
  agreementVersion: string | null;
  privacyVersion: string | null;
  aiImprovementConsentAt: string | null;
};

/** Mirror the verified Supabase session into an HttpOnly cookie so the edge
 *  middleware can enforce the auth gate without reading localStorage. */
async function setSessionCookie(token: string): Promise<void> {
  try {
    await fetch("/api/auth/session-cookie", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    /* The cookie is an enforcement aid; a failure must never break sign-in. */
  }
}

/** Clear the HttpOnly session cookie on sign-out. */
async function clearSessionCookie(): Promise<void> {
  try {
    await fetch("/api/auth/session-cookie", { method: "DELETE" });
  } catch {
    /* Best-effort; local sign-out still proceeds. */
  }
}

type SessionContextValue = {
  loading: boolean;
  session: AuthSession | null;
  user: SupabaseUser | null;
  profile: AccountProfile | null;
  credits: AccountCredits | null;
  consent: AccountConsent | null;
  /** Re-fetch the verified account state from the server. */
  refresh: () => Promise<void>;
  /** Update the signed-in display name (server-validated). */
  setDisplayName: (name: string) => Promise<{ ok: boolean; error?: string }>;
  /** Revoke the session locally and at the provider. */
  signOut: () => Promise<void>;
  /** Mirror the current session into the HttpOnly cookie (used after sign-in). */
  setSessionCookie: (token: string) => Promise<void>;
  /** Clear the HttpOnly session cookie. */
  clearSessionCookie: () => Promise<void>;
  /** Authenticated bearer header value, or null when signed out. */
  bearerToken: () => string | null;
};

const SessionContext = createContext<SessionContextValue | null>(null);

type JsonFetchResult = { data: Record<string, unknown> | null; status: number };

/**
 * Last verified account state, kept in memory for route changes and in
 * sessionStorage for hard reloads. This is a display cache only: every API
 * call still sends the bearer token and the server re-verifies it.
 */
type CachedAccount = {
  session: AuthSession;
  user: SupabaseUser | null;
  profile: AccountProfile;
  credits: AccountCredits | null;
  consent: AccountConsent | null;
};

const ACCOUNT_CACHE_KEY = "anvik-account-cache-v1";
let memoryAccountCache: CachedAccount | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function readAccountCache(): CachedAccount | null {
  if (memoryAccountCache) return memoryAccountCache;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(ACCOUNT_CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const session = parsed.session as Partial<AuthSession> | undefined;
    const profile = parsed.profile as Partial<AccountProfile> | undefined;
    if (!session || typeof session.access_token !== "string" || !session.access_token) return null;
    if (!profile || typeof profile.id !== "string" || !profile.id) return null;
    // A cache from a different local session must never be shown.
    const stored = readStoredSession();
    if (!stored || stored.access_token !== session.access_token) return null;
    const cache: CachedAccount = {
      session: stored,
      user: isRecord(parsed.user) ? (parsed.user as SupabaseUser) : null,
      profile: profile as AccountProfile,
      credits: isRecord(parsed.credits) ? (parsed.credits as AccountCredits) : null,
      consent: isRecord(parsed.consent) ? (parsed.consent as AccountConsent) : null,
    };
    memoryAccountCache = cache;
    return cache;
  } catch {
    return null;
  }
}

function writeAccountCache(cache: CachedAccount): void {
  memoryAccountCache = cache;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(ACCOUNT_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* The cache is an optimization; the verified fetch still owns the state. */
  }
}

function clearAccountCache(): void {
  memoryAccountCache = null;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(ACCOUNT_CACHE_KEY);
  } catch {
    /* nothing to clear */
  }
}

async function fetchJson(url: string, init?: RequestInit): Promise<JsonFetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, { cache: "no-store", ...init, signal: controller.signal });
    if (!response.ok) return { data: null, status: response.status };
    return { data: (await response.json()) as Record<string, unknown>, status: response.status };
  } catch {
    return { data: null, status: controller.signal.aborted ? 408 : 0 };
  } finally {
    clearTimeout(timeout);
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [credits, setCredits] = useState<AccountCredits | null>(null);
  const [consent, setConsent] = useState<AccountConsent | null>(null);
  const refreshGeneration = useRef(0);

  const bearerToken = useCallback(() => {
    // Hide the old account token while identity is being verified.
    return !loading && session && isSessionUsable(session) ? session.access_token : null;
  }, [loading, session]);

  const hydrateFromCache = useCallback(() => {
    const cached = readAccountCache();
    if (!cached) return false;
    setLearningOwner(cached.profile.id);
    setSession(cached.session);
    setUser(cached.user);
    setProfile(cached.profile);
    setCredits(cached.credits);
    setConsent(cached.consent);
    setLoading(false);
    return true;
  }, []);

  const refresh = useCallback(async (options?: { background?: boolean }) => {
    const background = options?.background === true;
    const generation = ++refreshGeneration.current;
    const isCurrent = () => refreshGeneration.current === generation;

    // A background pass keeps the cached identity on screen while the server
    // revalidates it. A user-initiated refresh is authoritative and may clear.
    if (!background) {
      setLoading(true);
      setLearningOwner("guest");
      setSession(null);
      setUser(null);
      setProfile(null);
      setCredits(null);
      setConsent(null);
    }

    let stored = readStoredSession();
    if (!stored) {
      // Start a private anonymous Supabase identity automatically. No account
      // form, email, password or OAuth action is required from the visitor.
      const guest = await signInAnonymously();
      if (!isCurrent()) return;
      if (!guest.ok || !guest.session) {
        clearAccountCache();
        setLearningOwner("guest");
        setSession(null);
        setUser(null);
        setProfile(null);
        setCredits(null);
        setConsent(null);
        setLoading(false);
        return;
      }
      stored = guest.session;
      await setSessionCookie(stored.access_token);
    }

    let active = stored;
    if (!isSessionUsable(stored)) {
      const refreshed = await refreshSession();
      if (!isCurrent()) return;
      if (refreshed && refreshed.ok && refreshed.session) {
        active = refreshed.session;
        setSession(active);
      } else {
        // A revoked or expired identity is replaced with a fresh guest. This
        // does not restore history from the old anonymous account.
        clearAccountCache();
        clearStoredSession();
        const guest = await signInAnonymously();
        if (!isCurrent()) return;
        if (!guest.ok || !guest.session) {
          setLearningOwner("guest");
          setSession(null);
          setUser(null);
          setProfile(null);
          setCredits(null);
          setConsent(null);
          setLoading(false);
          return;
        }
        active = guest.session;
        await setSessionCookie(active.access_token);
      }
    }
    if (!isSessionUsable(active)) {
      // A usable session is the only one we trust; leftover refresh races.
      clearAccountCache();
      setLearningOwner("guest");
      clearStoredSession();
      setSession(null);
      setUser(null);
      setProfile(null);
      setCredits(null);
      setConsent(null);
      setLoading(false);
      return;
    }
    setSession(active);
    // Renew the edge-readable cookie on every refresh, not only on first
    // creation. This keeps protected API surfaces available after reloads.
    await setSessionCookie(active.access_token);

    const token = active.access_token;
    const headers = { Authorization: `Bearer ${token}` };

    const [meResult, creditsRes] = await Promise.all([
      fetchJson("/api/auth/me", { headers }),
      fetchJson("/api/credits", { headers }),
    ]);
    if (!isCurrent()) return;
    const me = meResult.data;

    if (me && me.user && typeof me.user === "object") {
      const u = me.user as Record<string, unknown>;
      const nextUser: SupabaseUser = {
        id: String(u.id ?? ""),
        email: typeof u.email === "string" ? u.email : undefined,
        user_metadata: null,
      };
      const nextProvider = typeof u.provider === "string" ? u.provider : "unknown";
      const nextProfile: AccountProfile = {
        id: String(u.id ?? ""),
        email: typeof u.email === "string" ? u.email : "",
        name: nextProvider === "anonymous" ? "Guest" : typeof u.name === "string" && u.name ? u.name : emailFallbackName(typeof u.email === "string" ? u.email : ""),
        provider: nextProvider as "google" | "email" | "anonymous" | "unknown",
        avatarUrl: typeof u.avatarUrl === "string" ? u.avatarUrl : null,
        createdAt: typeof u.createdAt === "string" ? u.createdAt : null,
        accountStatus: typeof u.accountStatus === "string" ? u.accountStatus : "active",
      };
      const c = (me.credits ?? null) as Record<string, unknown> | null;
      const entitlement = (me.entitlement ?? null) as Record<string, unknown> | null;
      const nextCredits: AccountCredits = {
        planId: typeof entitlement?.planId === "string" ? entitlement.planId : "free",
        planName: typeof entitlement?.planName === "string" ? entitlement.planName : "Free",
        status: typeof entitlement?.status === "string" ? entitlement.status : "active",
        expiry: typeof entitlement?.expiry === "string" ? entitlement.expiry : null,
        dailyLimit: typeof c?.dailyLimit === "number" ? c.dailyLimit : null,
        dailyUsed: typeof c?.dailyUsed === "number" ? c.dailyUsed : null,
        dailyRemaining: typeof c?.dailyRemaining === "number" ? c.dailyRemaining : null,
        packRemaining: typeof c?.packRemaining === "number" ? c.packRemaining : null,
        packExpiry: typeof c?.packExpiry === "string" ? c.packExpiry : null,
        totalRemaining: typeof c?.totalRemaining === "number" ? c.totalRemaining : null,
      };
      const cons = (me.consent ?? null) as Record<string, unknown> | null;
      const nextConsent: AccountConsent | null = cons
        ? {
            hasAccepted: cons.hasAccepted === true,
            aiImprovementConsent: cons.aiImprovementConsent === true,
            withdrawnAt: typeof cons.withdrawnAt === "string" ? cons.withdrawnAt : null,
            termsAcceptedAt: typeof cons.termsAcceptedAt === "string" ? cons.termsAcceptedAt : null,
            privacyAcceptedAt: typeof cons.privacyAcceptedAt === "string" ? cons.privacyAcceptedAt : null,
            agreementVersion: typeof cons.agreementVersion === "string" ? cons.agreementVersion : null,
            privacyVersion: typeof cons.privacyVersion === "string" ? cons.privacyVersion : null,
            aiImprovementConsentAt: typeof cons.aiImprovementConsentAt === "string" ? cons.aiImprovementConsentAt : null,
          }
        : null;

      setLearningOwner(nextProfile.id || "guest");
      setUser(nextUser);
      setProfile(nextProfile);
      setCredits(nextCredits);
      setConsent(nextConsent);
      writeAccountCache({
        session: active,
        user: nextUser,
        profile: nextProfile,
        credits: nextCredits,
        consent: nextConsent,
      });
    } else if (meResult.status === 401 || meResult.status === 403 || (me && !me.user)) {
      // Only an explicit auth rejection clears the local session. Temporary
      // network and server failures must not destroy a refreshable session.
      clearAccountCache();
      setLearningOwner("guest");
      clearStoredSession();
      setSession(null);
      setUser(null);
      setProfile(null);
      setCredits(null);
      setConsent(null);
    } else if (background && memoryAccountCache) {
      // Revalidation is best-effort while cached: keep the last verified
      // identity visible and let the next pass recover.
    } else {
      // Hide profile data while the server is unavailable, but retain the
      // refreshable session. The next refresh can recover it safely.
      setLearningOwner("guest");
      setUser(null);
      setProfile(null);
      setCredits(null);
      setConsent(null);
    }

    // Belt-and-braces: a separate credits fetch (cheap, already cached by server logic).
    void creditsRes;

    if (isCurrent()) setLoading(false);
  }, []);

  const setDisplayName = useCallback(
    async (name: string) => {
      const token = bearerToken();
      if (!token) return { ok: false, error: "You must be signed in." };
      const response = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        return { ok: false, error: typeof body?.error === "string" ? body.error : "Could not save your name." };
      }
      // Also mirror into auth metadata (non-authoritative, client-readable).
      updateProfileMetadata(token, { name }).catch(() => undefined);
      await refresh();
      return { ok: true };
    },
    [bearerToken, refresh],
  );

  const signOut = useCallback(async () => {
    refreshGeneration.current += 1;
    clearAccountCache();
    setLoading(true);
    setLearningOwner("guest");
    setSession(null);
    setUser(null);
    setProfile(null);
    setCredits(null);
    setConsent(null);
    await authSignOut();
    await clearSessionCookie();
    // "Sign out" now starts a fresh isolated guest instead of exposing a
    // sign-in screen. The previous guest's data remains owned by that id.
    await refresh();
  }, [refresh]);

  useEffect(() => {
    const hydrated = hydrateFromCache();
    void refresh({ background: hydrated });
  }, [hydrateFromCache, refresh]);

  const value = useMemo<SessionContextValue>(
    () => ({
      loading,
      session,
      user,
      profile,
      credits,
      consent,
      refresh,
      setDisplayName,
      signOut,
      setSessionCookie,
      clearSessionCookie,
      bearerToken,
    }),
    [
      loading,
      session,
      user,
      profile,
      credits,
      consent,
      refresh,
      setDisplayName,
      signOut,
      bearerToken,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}

export function useRequireAuth({ onUnauthenticated }: { onUnauthenticated?: () => void } = {}) {
  const { loading, session } = useSession();
  useEffect(() => {
    if (!loading && !session && onUnauthenticated) onUnauthenticated();
  }, [loading, session, onUnauthenticated]);
  return { loading, session, ready: !loading && Boolean(session) };
}
