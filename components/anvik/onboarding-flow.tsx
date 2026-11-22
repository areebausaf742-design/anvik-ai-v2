"use client";

/**
 * First-time onboarding — full-screen, one step at a time.
 *
 *   1. Identity — confirm who you are (verified Google name or sanitized email)
 *   2. Terms of Service — required acknowledgement
 *   3. Privacy Policy — required acknowledgement
 *   4. AI Model Improvement Consent — OPTIONAL, never preselected, explicit
 *      opt-out path, minor-user safeguard, withdrawal always available
 *
 * Consent is recorded server-side (terms/privacy versions + timestamps +
 * optional AI-improvement state). Returning users with accepted consent skip
 * the flow entirely.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Loader2, LockKeyhole, Sparkles } from "lucide-react";
import AnvikStar from "@/components/anvik/anvik-star";
import { useSession } from "@/components/anvik/session-provider";
import { requestFreshChat } from "@/lib/fresh-chat";
import { emailFallbackName } from "@/lib/session";

type Step = 0 | 1 | 2 | 3;
const TOTAL_STEPS = 4;

function stepLabel(step: Step): string {
  switch (step) {
    case 0: return "Who you are";
    case 1: return "Terms of Service";
    case 2: return "Privacy Policy";
    case 3: return "AI improvement consent";
  }
}

export default function OnboardingFlow() {
  const router = useRouter();
  const { loading, session, profile, consent, bearerToken, setDisplayName, refresh } = useSession();
  const [step, setStep] = useState<Step>(0);
  const [name, setName] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [aiConsent, setAiConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [redirecting, setRedirecting] = useState(false);
  const nameTouched = useRef(false);
  const redirected = useRef(false);
  const submitStarted = useRef(false);

  const postLoginDestination = useCallback(() => {
    const url = new URL(window.location.href);
    const next = url.searchParams.get("next");
    if (!next) return "/chat";
    try {
      const target = new URL(next, window.location.origin);
      return target.origin === window.location.origin ? `${target.pathname}${target.search}${target.hash}` : "/chat";
    } catch {
      return "/chat";
    }
  }, []);

  // Signed out → login. Returning users (consent complete) → chat.
  useEffect(() => {
    if (loading || redirected.current) return;
    if (!session) {
      redirected.current = true;
      router.replace("/login");
      return;
    }
    if (consent?.hasAccepted) {
      redirected.current = true;
      router.replace(postLoginDestination());
    }
  }, [loading, session, consent, router, postLoginDestination]);

  // Prefill the display name once, from the verified Google profile or a
  // sanitized email fallback. Never invents a name — only sanitizes.
  useEffect(() => {
    if (nameTouched.current) return;
    const fromProfile = profile?.name?.trim();
    if (fromProfile) {
      setName(fromProfile);
      return;
    }
    const fromEmail = profile?.email ?? "";
    if (fromEmail) setName(emailFallbackName(fromEmail));
  }, [profile?.name, profile?.email]);

  const canContinue = useMemo(() => {
    if (step === 0) return name.trim().length >= 1 && name.trim().length <= 80;
    if (step === 1) return termsAccepted;
    if (step === 2) return privacyAccepted;
    return true;
  }, [step, name, termsAccepted, privacyAccepted]);

  const submit = useCallback(
    async (aiImprovementConsent: boolean) => {
      if (submitStarted.current || busy || redirecting) return;
      submitStarted.current = true;
      const token = bearerToken();
      if (!token) {
        setError("You must be signed in to continue.");
        submitStarted.current = false;
        return;
      }
      setBusy(true);
      setError("");
      try {
        // 1. Persist the display name first so onboarding identity is saved.
        const nameResult = await setDisplayName(name.trim());
        if (!nameResult.ok && !(nameResult.error ?? "").includes("signed in")) {
          // A name-save failure is honest feedback, but we still record consent
          // — the name can be re-saved in settings.
          // eslint-disable-next-line no-console
          console.warn("name save failed:", nameResult.error);
        }

        // 2. Record consent server-side.
        let consentRes: Response;
        consentRes = await fetch("/api/auth/consent", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            termsAccepted: true,
            privacyAccepted: true,
            aiImprovementConsent,
          }),
        });
        const consentBody = await consentRes.json().catch(() => null);
        if (!consentRes.ok) {
          setError(consentBody?.error ?? "Could not save your consent. Please try again.");
          setBusy(false);
          submitStarted.current = false;
          return;
        }

        await refresh();
        requestFreshChat();
        redirected.current = true;
        setRedirecting(true);
        router.replace(postLoginDestination() === "/chat" ? "/welcome" : postLoginDestination());
      } catch {
        setError("Could not save your consent. Please try again.");
        setBusy(false);
        submitStarted.current = false;
      }
    },
    [bearerToken, name, setDisplayName, refresh, router, postLoginDestination, busy, redirecting],
  );

  function handleContinue() {
    if (redirecting || busy) return;
    setError("");
    if (step === 0) {
      if (name.trim().length < 1) {
        setError("Enter your name to continue.");
        return;
      }
      setStep(1);
      return;
    }
    if (step === 1) {
      if (!termsAccepted) { setError("Please confirm you accept the Terms of Service."); return; }
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!privacyAccepted) { setError("Please confirm you acknowledge the Privacy Policy."); return; }
      setStep(3);
      return;
    }
  }

  if (loading) {
    return (
      <main className="auth-page">
        <div className="auth-particles" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
        <div className="auth-card" style={{ maxWidth: 420 }}>
          <div className="auth-center" style={{ padding: "2rem 0" }}>
            <Loader2 className="auth-spinner auth-spinner-dark" aria-hidden style={{ margin: "0 auto" }} />
            <p className="auth-subheading" style={{ marginTop: "1rem" }}>Loading your account…</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <div className="auth-particles" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>

      <div className="auth-card" style={{ maxWidth: 560 }}>
        <div className="onboard-progress" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`dot ${step === i ? "on" : ""}`} style={{ display: "block" }} />
          ))}
        </div>

        <div className="auth-center" style={{ marginBottom: "0.9rem" }}>
          <span className="auth-brand-mark" style={{ margin: "0 auto 0.7rem", width: 44, height: 44, borderRadius: 13 }}>
            <AnvikStar size="md" className="[&_path]:!fill-white [&_circle]:!fill-white" />
          </span>
          <p className="auth-label" style={{ margin: 0 }}>Step {step + 1} of {TOTAL_STEPS}</p>
          <h1 className="auth-heading" style={{ fontSize: "1.28rem" }}>{stepLabel(step)}</h1>
        </div>

        {error && (
          <div role="alert" className="auth-error"><LockKeyhole aria-hidden /><span>{error}</span></div>
        )}

        {step === 0 && (
          <div className="onboard-step">
            <p className="auth-subheading">
              This is who everyone will see. Your verified Google name is shown automatically — you can change it later in settings.
            </p>
            <label className="auth-field">
              <span className="auth-label">Display name</span>
              <input
                className="auth-input"
                type="text"
                maxLength={80}
                autoComplete="name"
                value={name}
                onChange={(e) => { nameTouched.current = true; setName(e.target.value); }}
                aria-label="Display name"
              />
            </label>
            <div className="auth-note" style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
              <Sparkles aria-hidden className="h-4 w-4" />
              ANVIK AI greets you by name and uses it for your welcome and account.
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="onboard-step">
            <div className="onboard-body" tabIndex={0} role="region" aria-label="Terms of Service">
              <h3>Terms of Service</h3>
              <p>
                <strong>1. Who you must be.</strong> You must be 16 years or older — or have the
                consent of a parent or guardian. ANVIK AI is not a mentorship or medical, legal or
                financial service.
              </p>
              <p><strong>2. What ANVIK does.</strong> ANVIK answers questions using an AI model.
                Answers are generated, may be inaccurate, and must not be treated as professional,
                medical, legal or financial advice. Verify anything important with primary sources.</p>
              <p><strong>3. Your account.</strong> You own your conversations and consent records. You
                may update your profile, withdraw consent and delete your data at any time from your
                account settings.</p>
              <p><strong>4. Prohibited use.</strong> Do not use ANVIK to harm anyone, to defeat safety
                limits, to extract the service&rsquo;s internals, or to impersonate another person.</p>
              <p><strong>5. Availability & changes.</strong> The service may be limited, rate-limited or
                suspended for safety. Terms may change as ANVIK grows; you&rsquo;ll be asked to re-accept if
                terms get materially different.</p>
              <p><strong>6. Limitation.</strong> To the fullest extent permitted by law, ANVIK is provided
                &ldquo;as is&rdquo; without warranties. Nothing in these terms is a guarantee of model accuracy.</p>
            </div>
            <label className={`consent-row ${termsAccepted ? "checked" : ""}`}>
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                aria-label="Accept the Terms of Service"
              />
              <span>
                <span className="consent-title">I accept the Terms of Service</span>
                <p className="consent-desc">You will be asked to accept the Privacy Policy on the next step.</p>
              </span>
            </label>
          </div>
        )}

        {step === 2 && (
          <div className="onboard-step">
            <div className="onboard-body" tabIndex={0} role="region" aria-label="Privacy Policy">
              <h3>Privacy Policy</h3>
              <p><strong>What we collect.</strong> Your account email and display name, your provider
                (Google or email/password), and the conversations you send to ANVIK.</p>
              <p><strong>How conversations are processed.</strong> Messages are sent to the AI provider
                (Google Gemini) to generate an answer. They are never used for advertising.</p>
              <p><strong>What we store.</strong> Conversation history (per account), consent records
                (version, timestamps), credits (daily usage, pack balance, transaction history) and
                consent state. Credits and balances are always computed server-side.</p>
              <p><strong>Retention &amp; protection.</strong> Data is retained to provide and protect
                the service and for the as-long-as-you-use-ANVIK window. We do not sell or share your
                data. Encryption in transit and at rest; service credentials never reach the browser.</p>
              <p><strong>You control your information.</strong> You can review, edit or withdraw your
                AI-improvement consent, change your display name and delete your history at any time
                from your account settings.</p>
            </div>
            <label className={`consent-row ${privacyAccepted ? "checked" : ""}`}>
              <input
                type="checkbox"
                checked={privacyAccepted}
                onChange={(e) => setPrivacyAccepted(e.target.checked)}
                aria-label="Acknowledge the Privacy Policy"
              />
              <span>
                <span className="consent-title">I acknowledge the Privacy Policy</span>
                <p className="consent-desc">You can review anything here later in settings.</p>
              </span>
            </label>
          </div>
        )}

        {step === 3 && (
          <div className="onboard-step">
            <div className="onboard-body" tabIndex={0} role="region" aria-label="AI improvement consent">
              <h3>AI model improvement</h3>
              <p><strong>Optional — never mandatory.</strong> If you allow this, your conversations may be
                used to evaluate and improve the AI model. If you don&rsquo;t, your conversations are never
                shared for this purpose — they are only used to provide you with the service.</p>
              <p><strong>What happens with your data.</strong> If you allow this, conversations used for
                evaluation are processed under the provider&rsquo;s and our agreements, never shared with
                third parties for their own use, and never identify you in any public output. This does
                not change anything else — ANVIK works fully without this choice.</p>
              <p><strong>You can always withdraw.</strong> You can change or withdraw this choice at any
                time from your account settings — no email or form required.</p>
              <p><strong>Important — under 16.</strong> If you are under 16, please ask a parent or
                guardian to choose for you. We recommend not allowing this if you are a minor.</p>
            </div>

            <label className={`consent-row ${aiConsent ? "checked" : ""}`}>
              <input
                type="checkbox"
                checked={aiConsent}
                onChange={(e) => setAiConsent(e.target.checked)}
                aria-label="Allow AI improvement with my conversations"
              />
              <span>
                <span className="consent-title">Allow AI improvement</span>
                <p className="consent-desc">Optional, never preselected. Your conversations may be used to improve and evaluate the model. You can withdraw at any time.</p>
              </span>
            </label>
          </div>
        )}

        <div style={{ display: "flex", gap: "0.6rem", marginTop: "1.2rem" }}>
          {step > 0 && (
            <button
              type="button"
              className="auth-btn-ghost"
              style={{ width: "auto", padding: "0.82rem 1.2rem" }}
              onClick={() => { setError(""); setStep((s) => (s - 1) as Step); }}
              disabled={busy || redirecting}
            >
              <ArrowLeft aria-hidden className="h-4 w-4" /> Back
            </button>
          )}
          {step < 3 ? (
            <button
              type="button"
              className="auth-btn auth-btn-violet"
              disabled={!canContinue || busy}
              onClick={handleContinue}
            >
              Continue <ArrowRight aria-hidden className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              className="auth-btn auth-btn-violet"
              disabled={busy}
              onClick={() => void submit(aiConsent)}
            >
              {busy && <Loader2 className="auth-spinner" aria-hidden />}
              {busy ? "Saving…" : aiConsent ? "Allow & continue" : "Continue without consent"}
            </button>
          )}
        </div>

        <p className="auth-note" style={{ textAlign: "center", marginTop: "1rem" }}>
          {step === 3 ? (
            <>
              <Check aria-hidden className="inline h-3.5 w-3.5" style={{ verticalAlign: "-2px" }} />
              You may change or withdraw this later in settings.
            </>
          ) : (
            <>Skipping the AI-improvement step is always allowed — the app works without it.</>
          )}
        </p>
      </div>
    </main>
  );
}
