"use client";

/**
 * Password recovery. Two modes:
 *  - token in the URL (?token_hash=...&type=recovery or #access_token) —
 *    set a new password for the signed-in session.
 *  - no token — request a reset email.
 *
 * Token handling never trusts the client to know the identity: Supabase
 * verifies the token and returns a session, which we only use to update
 * the password.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, LockKeyhole, MailCheck, Sparkles } from "lucide-react";
import AnvikStar from "@/components/anvik/anvik-star";
import {
  completeRecoveryLink,
  requestPasswordReset,
  updatePassword,
  type AuthSession,
} from "@/lib/auth";

function readTokenFromUrl(): { tokenHash?: string; type?: string; accessToken?: string } | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const tokenHash = url.searchParams.get("token_hash") ?? undefined;
  const type = url.searchParams.get("type") ?? undefined;
  if (tokenHash) return { tokenHash, type };
  const hash = url.hash.replace(/^#/, "");
  if (hash) {
    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    if (accessToken) return { accessToken };
  }
  return null;
}

export default function RecoveryFlow() {
  const router = useRouter();
  const [mode, setMode] = useState<"request" | "verify" | "set" | "done">("request");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [sent, setSent] = useState(false);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState<AuthSession | null>(null);
  const derived = useMemo(() => readTokenFromUrl(), []);

  useEffect(() => {
    const token = derived;
    if (!token) return; // request mode
    void (async () => {
      setMode("verify");
      const result = await completeRecoveryLink(
        { tokenHash: token.tokenHash, type: token.type },
        token.accessToken,
      );
      if (!result.ok) {
        setError(result.error ?? "This reset link is invalid or expired.");
        setMode("request");
        return;
      }
      setSession(result.session);
      // Strip the token from the address bar after handling.
      window.history.replaceState({}, "", "/auth/reset");
      setMode("set");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRequest(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!email.trim()) {
      setError("Enter your email.");
      return;
    }
    setBusy(true);
    const result = await requestPasswordReset(email.trim().toLowerCase());
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not send the reset email.");
      return;
    }
    setMode("request");
    setError("");
    setSent(true);
  }

  async function handleSet(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    const token = session?.access_token;
    if (!token) {
      setError("This reset link is no longer valid.");
      setMode("request");
      return;
    }
    setBusy(true);
    const result = await updatePassword(token, password);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not update your password.");
      return;
    }
    setMode("done");
  }

  const title =
    mode === "request"
      ? "Reset your password"
      : mode === "verify"
        ? "Verifying your link…"
        : mode === "set"
          ? "Set a new password"
          : "Password updated";

  const subtitle =
    mode === "request"
      ? "We'll email you a link to set a new password."
      : mode === "verify"
        ? "Checking your reset link…"
        : mode === "set"
          ? "Choose a new password for your account."
          : "Your password has been updated.";


  return (
    <main className="auth-page">
      <div className="auth-particles" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      <div className="auth-card" style={{ maxWidth: 440 }}>
        <div className="auth-brand">
          <span className="auth-brand-mark">
            <AnvikStar size="md" className="[&_path]:!fill-white [&_circle]:!fill-white" />
          </span>
          <div className="auth-brand-name">ANVIK<span>AI</span></div>
        </div>
        <h1 className="auth-heading">{title}</h1>
        <p className="auth-subheading">{subtitle}</p>

        {error && (
          <div role="alert" className="auth-error"><LockKeyhole aria-hidden /><span>{error}</span></div>
        )}

        {mode === "request" ? (
          sent ? (
            <div className="auth-success" role="status">
              <MailCheck aria-hidden />
              <span>If that email exists, a reset link is on its way — check your inbox.</span>
            </div>
          ) : (
            <form onSubmit={handleRequest} noValidate>
              <label className="auth-field">
                <span className="auth-label">Email</span>
                <input
                  className="auth-input"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy}
                />
              </label>
              <button className="auth-btn auth-btn-violet" type="submit" disabled={busy}>
                {busy && <Loader2 className="auth-spinner" aria-hidden />}
                {busy ? "Sending…" : "Send reset link"}
              </button>
            </form>
          )
        ) : mode === "verify" ? (
          <div className="auth-center" style={{ padding: "2.2rem 0" }}>
            <Loader2 className="auth-spinner auth-spinner-dark" aria-hidden style={{ margin: "0 auto" }} />
          </div>
        ) : mode === "set" ? (
          <form onSubmit={handleSet} noValidate>
            <label className="auth-field">
              <span className="auth-label">New password</span>
              <span className="auth-input-wrap">
                <input
                  className="auth-input"
                  type={visible ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                />
                <button
                  type="button"
                  className="auth-eye"
                  aria-label={visible ? "Hide password" : "Show password"}
                  onClick={() => setVisible((v) => !v)}
                >
                  {visible ? <EyeOff aria-hidden className="h-5 w-5" /> : <Eye aria-hidden className="h-5 w-5" />}
                </button>
              </span>
            </label>
            <label className="auth-field">
              <span className="auth-label">Confirm password</span>
              <input
                className="auth-input"
                type="password"
                autoComplete="new-password"
                required
                placeholder="Repeat your password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={busy}
              />
            </label>
            <button className="auth-btn auth-btn-violet" type="submit" disabled={busy}>
              {busy && <Loader2 className="auth-spinner" aria-hidden />}
              {busy ? "Updating…" : "Update password"}
            </button>
          </form>
        ) : (
          <div className="auth-success" role="status">
            <Sparkles aria-hidden />
            <span>Your password has been updated. You can now sign in with your new password.</span>
          </div>
        )}

        {mode === "done" && (
          <button type="button" className="auth-btn auth-btn-violet" onClick={() => router.replace("/login")}>
            Go to sign in
          </button>
        )}
        {(mode === "verify") && (
          <p className="auth-note" style={{ textAlign: "center" }}>Checking your reset link…</p>
        )}
      </div>
    </main>
  );
}
