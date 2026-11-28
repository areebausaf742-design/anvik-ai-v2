"use client";

/**
 * Account dashboard — profile, subscription, credits, usage and consent in one
 * premium, server-computed view. No value is computed in the browser: the
 * quota, remaining allowance and history all come from /api/credits.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  Check,
  ChevronRight,
  CreditCard,
  History,
  Loader2,
  Pencil,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import AnvikStar from "@/components/anvik/anvik-star";
import { useSession } from "@/components/anvik/session-provider";

type UsageRow = { id: string; model: string | null; feature: string | null; status: string; credits: number; createdAt: string };
type LedgerRow = { id: string; type: string; amount: number; description: string | null; createdAt: string };

function fmtDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function fmtTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function ledgerDescription(type: string, description: string | null): string {
  if (description) return description;
  switch (type) {
    case "reserve": return "Credit reserved";
    case "confirm": return "Usage recorded";
    case "refund": return "Refunded after failure";
    case "pack_grant": return "Pack credits added";
    case "daily_reset": return "Daily allowance refreshed";
    default: return type.replaceAll("_", " ");
  }
}

export default function AccountScreen() {
  const router = useRouter();
  const { loading, session, profile, credits, consent, refresh, signOut, bearerToken, setDisplayName } = useSession();

  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [historyError, setHistoryError] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [nameBusy, setNameBusy] = useState(false);
  const [nameError, setNameError] = useState("");
  const [consentBusy, setConsentBusy] = useState(false);
  const [consentError, setConsentError] = useState("");
  const [consentNote, setConsentNote] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const consentSubmitStarted = useRef(false);

  // Guard: signed out → login.
  useEffect(() => {
    if (!loading && !session) router.replace("/login");
  }, [loading, session, router]);

  // Load history from the server (verified-identity, never client-supplied).
  const loadHistory = useCallback(async () => {
    const token = bearerToken();
    if (!token) return;
    try {
      const response = await fetch("/api/credits", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!response.ok) throw new Error("failed");
      const body = await response.json();
      setUsage(Array.isArray(body.usage) ? body.usage : []);
      setLedger(Array.isArray(body.ledger) ? body.ledger : []);
      setHistoryError("");
    } catch {
      setHistoryError("Could not load history — showing the values already loaded.");
    }
  }, [bearerToken]);

  useEffect(() => {
    if (session) void loadHistory();
  }, [session, loadHistory]);

  useEffect(() => {
    if (profile?.name) setNameValue(profile.name);
  }, [profile?.name]);

  const dailyLimit = credits?.dailyLimit ?? 0;
  const dailyUsed = credits?.dailyUsed ?? 0;
  const dailyRemaining = credits?.dailyRemaining ?? 0;
  const planIsPack = credits?.planId === "pack";
  const planName = credits?.planName ?? "Free";
  const planStatus = credits?.status ?? "active";
  const packRemaining = credits?.packRemaining ?? 0;
  const progress = planIsPack ? (packRemaining > 0 ? 100 : 0) : Math.min(100, dailyLimit > 0 ? (dailyUsed / dailyLimit) * 100 : 0);
  const isExpired = planStatus !== "active";

  const displayName = profile?.name?.trim() || "friend";
  const initials = useMemo(() => {
    const parts = displayName.split(/\s+/).filter(Boolean);
    return (parts[0]?.[0] ?? "A").toUpperCase() + (parts[1]?.[0]?.toUpperCase() ?? "");
  }, [displayName]);

  async function saveName() {
    setNameError("");
    const trimmed = nameValue.trim();
    if (!trimmed) {
      setNameError("Enter a display name.");
      return;
    }
    setNameBusy(true);
    const result = await setDisplayName(trimmed);
    setNameBusy(false);
    if (!result.ok) {
      setNameError(result.error ?? "Could not save your name.");
      return;
    }
    setEditingName(false);
  }

  async function toggleAiConsent() {
    if (consentSubmitStarted.current) return;
    const token = bearerToken();
    if (!token) return;
    consentSubmitStarted.current = true;
    setConsentError("");
    setConsentNote("");
    const next = !(consent?.aiImprovementConsent ?? false);
    setConsentBusy(true);
    try {
      const response = await fetch("/api/auth/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "set_ai_improvement", enabled: next }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setConsentError(body?.error ?? "Could not update consent.");
      } else {
        await refresh();
        setConsentNote(
          next
            ? "AI improvement enabled — your conversations may be used to improve and evaluate the model."
            : "AI improvement disabled — your conversations will not be used for improvement.",
        );
      }
    } catch {
      setConsentError("Could not update consent.");
    } finally {
      setConsentBusy(false);
      consentSubmitStarted.current = false;
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    router.replace("/login");
  }

  if (loading) {
    return (
      <main className="account-page">
        <div className="account-shell">
          <div className="auth-center" style={{ padding: "4rem 0" }}>
            <Loader2 className="auth-spinner auth-spinner-dark" aria-hidden style={{ margin: "0 auto" }} />
            <p className="account-sub" style={{ marginTop: "1rem" }}>Loading your account…</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="account-page">
      <div className="account-shell">
        <div className="account-topbar">
          <div>
            <p className="account-sub" style={{ margin: 0 }}>ANVIK AI · Account</p>
            <h1 className="account-title">Your account</h1>
          </div>
          <button
            type="button"
            onClick={() => router.push("/chat")}
            className="auth-btn-ghost"
            style={{ width: "auto", padding: "0.55rem 1.1rem", fontSize: "0.85rem" }}
          >
            <ArrowLeft aria-hidden className="h-4 w-4" /> Back to chat
          </button>
        </div>

        <div className="account-grid">
          {/* Profile */}
          <section className="account-card" aria-label="Profile">
            <h2>Profile</h2>
            <div className="acct-profile">
              <span className="acct-avatar relative" aria-hidden="true">
                {profile?.avatarUrl ? <Image src={profile.avatarUrl} alt="" fill sizes="54px" className="object-cover" /> : <>{initials}</>}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                {editingName ? (
                  <input
                    className="auth-input"
                    value={nameValue}
                    maxLength={80}
                    autoFocus
                    aria-label="Display name"
                    onChange={(e) => setNameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void saveName();
                      if (e.key === "Escape") setEditingName(false);
                    }}
                  />
                ) : (
                  <h3 className="acct-profile-name" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    {displayName}
                    <button
                      type="button"
                      onClick={() => { setNameValue(profile?.name ?? displayName); setEditingName(true); }}
                      aria-label="Edit display name"
                      className="auth-link"
                      style={{ padding: "0.2rem" }}
                    >
                      <Pencil aria-hidden className="h-4 w-4" />
                    </button>
                  </h3>
                )}
                <p className="acct-profile-email">{profile?.email ?? "—"}</p>
              </div>
            </div>

            {editingName && (
              <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.6rem" }}>
                <button type="button" className="auth-btn" style={{ width: "auto", padding: "0.55rem 1rem" }} onClick={() => void saveName()} disabled={nameBusy}>
                  {nameBusy ? <Loader2 className="auth-spinner" aria-hidden /> : <Check aria-hidden className="h-4 w-4" />}
                  Save name
                </button>
                <button type="button" className="auth-btn-ghost" style={{ width: "auto", padding: "0.55rem 0.9rem" }} onClick={() => setEditingName(false)}>
                  <X aria-hidden className="h-4 w-4" />
                </button>
              </div>
            )}
            {nameError && <p className="auth-error" style={{ marginTop: "0.6rem", marginBottom: 0 }} role="alert">{nameError}</p>}

            <div style={{ marginTop: "0.9rem" }}>
              <div className="acct-kv"><span className="k">Provider</span><span className="v">{profile?.provider === "google" ? "Google" : "Email & password"}</span></div>
              <div className="acct-kv"><span className="k">Status</span><span className="v">{isExpired ? "Expired" : "Active"}</span></div>
              <div className="acct-kv"><span className="k">Member since</span><span className="v">{fmtDate(profile?.createdAt ?? null)}</span></div>
            </div>
          </section>

          {/* Subscription & credits */}
          <section className="account-card" aria-label="Subscription and credits">
            <h2>Subscription & credits</h2>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.8rem", flexWrap: "wrap" }}>
              <span className="acct-chip">{planName}</span>
              <span className="auth-note" style={{ margin: 0 }}>{isExpired ? "Expired — free floor applies" : "Active"}</span>
            </div>

            {planIsPack ? (
              <>
                <div className="acct-quota-meta"><span>Pack credits remaining</span><span>{packRemaining}</span></div>
                <div className="acct-quota-bar" role="progressbar" aria-valuenow={packRemaining} aria-label="Pack credits remaining">
                  <span style={{ width: `${packRemaining > 0 ? Math.min(100, (packRemaining / 50) * 100) : 0}%` }} />
                </div>
                <div className="acct-kv"><span className="k">Pack expires</span><span className="v">{fmtDate(credits?.packExpiry ?? null)}</span></div>
              </>
            ) : (
              <>
                <div className="acct-quota-meta"><span>Daily quota</span><span>{dailyUsed}/{dailyLimit} used — {dailyRemaining} remaining</span></div>
                <div className="acct-quota-bar" role="progressbar" aria-valuenow={dailyUsed} aria-valuemin={0} aria-valuemax={dailyLimit} aria-label="Daily quota used">
                  <span style={{ width: `${progress}%` }} />
                </div>
                <div className="acct-kv"><span className="k">Daily limit</span><span className="v">{dailyLimit} messages / day (IST)</span></div>
                {packRemaining > 0 && (
                  <div className="acct-kv"><span className="k">Pack fallback</span><span className="v">{packRemaining} credits</span></div>
                )}
                {credits?.expiry && <div className="acct-kv"><span className="k">Renews / expires</span><span className="v">{fmtDate(credits.expiry)}</span></div>}
              </>
            )}

            <button
              type="button"
              onClick={() => router.push("/pricing")}
              className="auth-btn-ghost"
              style={{ marginTop: "0.6rem" }}
            >
              <CreditCard aria-hidden className="h-4 w-4" />
              {planIsPack ? "View plans" : "Upgrade plan"}
            </button>
            <p className="auth-note" style={{ marginTop: "0.55rem" }}>
              Paid plans are activated by a human operator after WhatsApp enquiry — never automatically.
            </p>
          </section>

          {/* Usage & transactions */}
          <section className="account-card" aria-label="Usage and transaction history">
            <h2>Usage history</h2>
            {historyError && <p className="auth-note" role="status">{historyError}</p>}
            {usage.length === 0 ? (
              <p className="acct-empty">No answers yet — your messages will appear here after you ask.</p>
            ) : (
              <div className="acct-history-list">
                {usage.slice(0, 6).map((u) => (
                  <div key={u.id} className="acct-history-item">
                    <div>
                      <span className="h-type">{u.feature ?? "Chat"}</span>
                      <div className="h-meta">{u.model ?? "gemini"} · {u.status}</div>
                    </div>
                    <div className="h-amt">{u.credits}</div>
                    <div className="h-meta" style={{ textAlign: "right" }}>{fmtTime(u.createdAt)}</div>
                  </div>
                ))}
              </div>
            )}

            <h2 style={{ marginTop: "1.2rem" }}>Transactions</h2>
            {ledger.length === 0 ? (
              <p className="acct-empty">No transactions yet — credits will appear here as you use ANVIK.</p>
            ) : (
              <div className="acct-history-list">
                {ledger.slice(0, 6).map((l) => (
                  <div key={l.id} className="acct-history-item">
                    <div>
                      <span className="h-type">{l.type.replaceAll("_", " ")}</span>
                      <div className="h-meta">{ledgerDescription(l.type, l.description)}</div>
                    </div>
                    <div className="h-amt">{l.amount > 0 ? `+${l.amount}` : l.amount}</div>
                    <div className="h-meta" style={{ textAlign: "right" }}>{fmtTime(l.createdAt)}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Privacy & consent */}
          <section className="account-card" aria-label="Privacy and consent">
            <h2>Privacy &amp; consent</h2>
            <div className="acct-kv"><span className="k">Terms accepted</span><span className="v">{fmtDate(consent?.termsAcceptedAt ?? null)}</span></div>
            <div className="acct-kv"><span className="k">Privacy policy</span><span className="v">{fmtDate(consent?.privacyAcceptedAt ?? null)}</span></div>
            <div className="acct-kv" style={{ borderBottom: 0, alignItems: "center" }}>
              <span className="k">
                <span style={{ display: "block", fontSize: "0.82rem" }}>AI-improvement consent</span>
                <span className="acct-profile-email" style={{ margin: 0 }}>Your conversations may be used to improve and evaluate the model. You can always change this.</span>
              </span>
              <button
                type="button"
                className={`acct-toggle ${consent?.aiImprovementConsent ? "on" : ""}`}
                role="switch"
                aria-checked={consent?.aiImprovementConsent === true}
                aria-label="Toggle AI-improvement consent"
                disabled={consentBusy}
                onClick={() => void toggleAiConsent()}
              />
            </div>
            {consentBusy && <p className="auth-note" role="status">Saving…</p>}
            {consentError && <p className="auth-error" role="alert" style={{ marginBottom: 0 }}>{consentError}</p>}
            {consentNote && <p className="auth-success" role="status" style={{ marginBottom: 0 }}><ShieldCheck aria-hidden /><span>{consentNote}</span></p>}
            <p className="auth-note" style={{ marginTop: "0.6rem" }}>
              <ShieldCheck aria-hidden className="inline h-3.5 w-3.5" style={{ verticalAlign: "-2px" }} /> AI improvement is optional and never required. Withdrawal applies immediately.
            </p>
          </section>

          {/* Guest session security */}
          <section className="account-card" aria-label="Session security">
            <h2>Guest session security</h2>
            <p className="auth-note" style={{ marginTop: 0 }}>
              ANVIK created this private guest session automatically. Your chats and usage are scoped to its Supabase identity and are not shared with other visitors.
            </p>
            <p className="auth-note" style={{ marginTop: "0.6rem" }}>
              Keep this browser&apos;s site data to retain access to this session and its history.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
