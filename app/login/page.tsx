"use client";

/**
 * /login — the entry to ANVIK AI.
 *
 * Sign in with Google, email + password, or continue without an account
 * (anonymous free tier). Handles the OAuth callback on return, the
 * email-confirmation state and password recovery. Premium states for loading,
 * success and error; never shows a raw error string as the only feedback.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
  Sparkles,
} from "lucide-react";
import AnvikStar from "@/components/anvik/anvik-star";
import { useSession } from "@/components/anvik/session-provider";
import {
  completeGoogleOAuth,
  requestPasswordReset,
  signInWithPassword,
  signUpWithPassword,
  startGoogleOAuth,
  type SupabaseUser,
} from "@/lib/auth";

type Mode = "signin" | "signup" | "forgot";

export default function LoginPage() {
  const router = useRouter();
  const { session, loading: sessionLoading, signOut } = useSession();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [successNote, setSuccessNote] = useState("");
  const [oauthPending, setOauthPending] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const redirectToApp = useCallback(() => {
    router.replace("/chat");
  }, [router]);

  // OAuth callback: Supabase returns to /login?code=... (the state param,
  // when present, is the server's flow-state UUID — it is never verified or
  // compared app-side; the PKCE verifier is the protection).
  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    if (!code) return;
    setOauthPending(true);
    void (async () => {
      // Strip the code/state from the address bar after handling.
      window.history.replaceState({}, "", "/login");
      const result = await completeGoogleOAuth(code);
      if (!mounted.current) return;
      setOauthPending(false);
      if (!result.ok) {
        setError(result.error ?? "Google sign-in could not be completed.");
        return;
      }
      const user = result.user as SupabaseUser | undefined;
      const displayName =
        (user?.user_metadata?.name as string | undefined) ??
        (user?.user_metadata?.full_name as string | undefined) ??
        (user?.user_metadata?.given_name as string | undefined) ??
        "";
      if (displayName) setName(displayName);
      // Consent is checked server-side in onboarding — fresh users go there.
      router.replace("/onboarding");
    })();
  }, [router]);

  // Already signed in — skip the login screen (mirrors returning users).
  useEffect(() => {
    if (!sessionLoading && session) redirectToApp();
  }, [sessionLoading, session, redirectToApp]);

  async function handleGoogle() {
    setError("");
    setBusy(true);
    try {
      const origin = window.location.origin;
      const result = await startGoogleOAuth(`${origin}/login`, origin);
      if (!result.ok) {
        setError(result.error ?? "Could not start Google sign-in.");
        setBusy(false);
        return;
      }
      window.location.assign(result.authorizeUrl);
    } catch {
      setError("Could not start Google sign-in.");
      setBusy(false);
    }
  }

  async function handleSignIn(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSuccessNote("");
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    try {
      const result = await signInWithPassword(email.trim().toLowerCase(), password);
      if (!mounted.current) return;
      if (!result.ok) {
        setError(result.error ?? "Could not sign in.");
        setBusy(false);
        return;
      }
      // Returning user: straight to the app. New users get onboarding first
      // via the onboarding check — onboarding handles the fresh/returning split.
      router.replace("/onboarding");
    } catch {
      setError("Could not sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignUp(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSuccessNote("");
    const trimmedName = name.trim();
    if (trimmedName.length < 1) {
      setError("Enter your name.");
      return;
    }
    if (!email.trim()) {
      setError("Enter your email.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const result = await signUpWithPassword(email.trim().toLowerCase(), password, {
        name: trimmedName,
        provider: "email",
      });
      if (!mounted.current) return;
      if (!result.ok) {
        setError(result.error ?? "Could not create your account.");
        setBusy(false);
        return;
      }
      if (result.session == null) {
        // Email confirmation required — the account exists, we wait for their inbox.
        setSuccessNote(
          "Account created. Check your inbox to confirm your email — then sign in to continue.",
        );
        setMode("signin");
        setPassword("");
        setBusy(false);
        return;
      }
      router.replace("/onboarding");
    } catch {
      setError("Could not create your account. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleForgot(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!email.trim()) {
      setError("Enter your email.");
      return;
    }
    setBusy(true);
    try {
      const result = await requestPasswordReset(email.trim().toLowerCase());
      if (!mounted.current) return;
      if (!result.ok) {
        setError(result.error ?? "Could not send the reset email.");
      } else {
        setSuccessNote("If that email exists, a reset link is on its way — check your inbox.");
        setMode("signin");
        setPassword("");
      }
    } catch {
      setError("Could not send the reset email. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const title = useMemo(() => {
    if (mode === "signup") return "Create your account";
    if (mode === "forgot") return "Reset your password";
    return "Welcome back";
  }, [mode]);

  const subtitle = useMemo(() => {
    if (mode === "signup") return "One account, every device — your history, credits and consent live with you.";
    if (mode === "forgot") return "We'll email you a link to set a new password.";
    return "Sign in to pick up where you left off.";
  }, [mode]);

  return (
    <main className="auth-page">
      <div className="auth-particles" aria-hidden="true">
        <i /><i /><i /><i /><i /><i />
      </div>

      <div className="auth-card" style={{ maxWidth: 440 }}>
        <div className="auth-brand">
          <span className="auth-brand-mark">
            <AnvikStar size="md" className="[&_path]:!fill-white [&_circle]:!fill-white" />
          </span>
          <div className="auth-brand-name">
            ANVIK
            <span>AI</span>
          </div>
        </div>

        <h1 className="auth-heading">{title}</h1>
        <p className="auth-subheading">{subtitle}</p>

        {error && (
          <div role="alert" className="auth-error">
            <LockKeyhole aria-hidden />
            <span>{error}</span>
          </div>
        )}
        {successNote && (
          <div role="status" className="auth-success">
            <Sparkles aria-hidden />
            <span>{successNote}</span>
          </div>
        )}

        {mode === "forgot" ? (
          <form onSubmit={handleForgot} noValidate>
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
        ) : mode === "signup" ? (
          <form onSubmit={handleSignUp} noValidate>
            <label className="auth-field">
              <span className="auth-label">Your name</span>
              <input
                className="auth-input"
                type="text"
                autoComplete="name"
                required
                maxLength={80}
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
              />
            </label>
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
            <label className="auth-field">
              <span className="auth-label">Password</span>
              <span className="auth-input-wrap">
                <input
                  className="auth-input"
                  type={passwordVisible ? "text" : "password"}
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
                  aria-label={passwordVisible ? "Hide password" : "Show password"}
                  onClick={() => setPasswordVisible((v) => !v)}
                >
                  {passwordVisible ? <EyeOff aria-hidden className="h-5 w-5" /> : <Eye aria-hidden className="h-5 w-5" />}
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
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={busy}
              />
            </label>
            <button className="auth-btn auth-btn-violet" type="submit" disabled={busy}>
              {busy && <Loader2 className="auth-spinner" aria-hidden />}
              {busy ? "Creating…" : "Create account"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSignIn} noValidate>
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
            <label className="auth-field">
              <span className="auth-label">Password</span>
              <span className="auth-input-wrap">
                <input
                  className="auth-input"
                  type={passwordVisible ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                />
                <button
                  type="button"
                  className="auth-eye"
                  aria-label={passwordVisible ? "Hide password" : "Show password"}
                  onClick={() => setPasswordVisible((v) => !v)}
                >
                  {passwordVisible ? <EyeOff aria-hidden className="h-5 w-5" /> : <Eye aria-hidden className="h-5 w-5" />}
                </button>
              </span>
            </label>
            <button className="auth-btn auth-btn-violet" type="submit" disabled={busy}>
              {busy && <Loader2 className="auth-spinner" aria-hidden />}
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        )}

        <div className="auth-divider">or</div>

        <button
          type="button"
          className="auth-btn-ghost"
          onClick={handleGoogle}
          disabled={busy || oauthPending}
        >
          {oauthPending ? (
            <Loader2 className="auth-spinner-dark" aria-hidden />
          ) : (
            <GoogleLogo />
          )}
          {oauthPending ? "Finishing Google sign-in…" : "Continue with Google"}
        </button>

        <div className="auth-center" style={{ marginTop: "0.9rem" }}>
          {mode === "signin" ? (
            <>
              <p className="auth-note">
                Already have an account?{" "}
                <button type="button" className="auth-link" onClick={() => setMode("signup")}>
                  Create one
                </button>{" "}
                ·{" "}
                <button type="button" className="auth-link" onClick={() => { setError(""); setSuccessNote(""); setMode("forgot"); }}>
                  Reset password
                </button>
              </p>
              <p className="auth-note">
                New here?{" "}
                <button type="button" className="auth-link" onClick={() => setMode("signup")}>
                  Create a free account
                </button>
              </p>
            </>
          ) : (
            <p className="auth-note">
              Already have an account?{" "}
              <button type="button" className="auth-link" onClick={() => setMode("signin")}>
                Sign in
              </button>
            </p>
          )}
        </div>

        <div className="auth-divider">or keep it free</div>
        <Link href="/chat" className="auth-btn-ghost" style={{ textDecoration: "none" }}>
          Continue without an account <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
        <p className="auth-note" style={{ textAlign: "center", marginTop: "0.75rem" }}>
          <Mail aria-hidden className="inline h-3.5 w-3.5" /> Anonymous usage keeps the free ten-question daily limit and never stores your identity — an account adds history, credits and consent control.
        </p>

        <Link className="auth-center" href="/" style={{ display: "block", marginTop: "1.4rem" }}>
          <span className="auth-link">Back to the beginning</span>
        </Link>
      </div>
    </main>
  );
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.86-3c-1.08.72-2.45 1.16-4.08 1.16-3.13 0-5.79-2.11-6.73-4.96H1.63v3.09C3.6 21.22 7.47 24 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.29c-.24-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.63C.58 8.74 0 10.67 0 12.7s.58 3.96 1.43 5.53l3.84-3.94z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.36.61 4.6 1.8l3.46-3.46C17.94 1.19 15.22 0 12 0 7.47 0 3.6 2.78 1.63 6.62l3.64 2.82C6.21 6.86 8.87 4.75 12 4.75z" />
    </svg>
  );
}
