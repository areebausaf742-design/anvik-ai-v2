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
  provider: "google" | "email" | "unknown";
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
  /** Authenticated bearer header value, or null when signed out. */
  bearerToken: () => string | null;
};

const SessionContext = createContext<SessionContextValue | null>(null);

type JsonFetchResult = { data: Record<string, unknown> | null; status: number };

async function fetchJson(url: string, init?: RequestInit): Promise<JsonFetchResult> {
  try {
    const response = await fetch(url, { cache: "no-store", ...init });
    if (!response.ok) return { data: null, status: response.status };
    return { data: (await response.json()) as Record<string, unknown>, status: response.status };
  } catch {
    return { data: null, status: 0 };
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

  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    const isCurrent = () => refreshGeneration.current === generation;
    setLoading(true);
    setSession(null);
    setUser(null);
    setProfile(null);
    setCredits(null);
    setConsent(null);
    const stored = readStoredSession();
    if (!stored) {
      setLearningOwner("guest");
      setSession(null);
      setUser(null);
      setProfile(null);
      setCredits(null);
      setConsent(null);
      setLoading(false);
      return;
    }

    let active = stored;
    if (!isSessionUsable(stored)) {
      const refreshed = await refreshSession();
      if (!isCurrent()) return;
      if (refreshed && refreshed.ok && refreshed.session) {
        active = refreshed.session;
        setSession(active);
      } else {
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
    }
    if (!isSessionUsable(active)) {
      // A usable session is the only one we trust; leftover refresh races.
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
      setLearningOwner(String(u.id ?? "guest"));
      if (u) {
        setUser({ id: String(u.id ?? ""), email: typeof u.email === "string" ? u.email : undefined, user_metadata: null });
        setProfile({
          id: String(u.id ?? ""),
          email: typeof u.email === "string" ? u.email : "",
          name: typeof u.name === "string" && u.name ? u.name : emailFallbackName(typeof u.email === "string" ? u.email : ""),
          provider: (typeof u.provider === "string" ? u.provider : "unknown") as "google" | "email" | "unknown",
          avatarUrl: typeof u.avatarUrl === "string" ? u.avatarUrl : null,
          createdAt: typeof u.createdAt === "string" ? u.createdAt : null,
          accountStatus: typeof u.accountStatus === "string" ? u.accountStatus : "active",
        });
      }
      const c = (me.credits ?? null) as Record<string, unknown> | null;
      const entitlement = (me.entitlement ?? null) as Record<string, unknown> | null;
      setCredits({
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
      });
      const cons = (me.consent ?? null) as Record<string, unknown> | null;
      if (cons) {
        setConsent({
          hasAccepted: cons.hasAccepted === true,
          aiImprovementConsent: cons.aiImprovementConsent === true,
          withdrawnAt: typeof cons.withdrawnAt === "string" ? cons.withdrawnAt : null,
          termsAcceptedAt: typeof cons.termsAcceptedAt === "string" ? cons.termsAcceptedAt : null,
          privacyAcceptedAt: typeof cons.privacyAcceptedAt === "string" ? cons.privacyAcceptedAt : null,
          agreementVersion: typeof cons.agreementVersion === "string" ? cons.agreementVersion : null,
          privacyVersion: typeof cons.privacyVersion === "string" ? cons.privacyVersion : null,
          aiImprovementConsentAt: typeof cons.aiImprovementConsentAt === "string" ? cons.aiImprovementConsentAt : null,
        });
      }
    } else if (meResult.status === 401 || meResult.status === 403 || (me && !me.user)) {
      // Only an explicit auth rejection clears the local session. Temporary
      // network and server failures must not destroy a refreshable session.
      setLearningOwner("guest");
      clearStoredSession();
      setSession(null);
      setUser(null);
      setProfile(null);
      setCredits(null);
      setConsent(null);
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
    setLoading(true);
    setLearningOwner("guest");
    setSession(null);
    setUser(null);
    setProfile(null);
    setCredits(null);
    setConsent(null);
    await authSignOut();
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
      bearerToken,
    }),
    [loading, session, user, profile, credits, consent, refresh, setDisplayName, signOut, bearerToken],
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
