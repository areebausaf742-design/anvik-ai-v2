"use client";

/**
 * Personalized welcome — the first screen of the ANVIK experience.
 *
 * "Hello, {name}." + "Welcome to ANVIK AI." + "Your intelligence companion is
 * ready." — full-screen, centered typography, animated gradient lighting,
 * ambient particles, refined entrance animations, smooth transition to chat.
 * Reduced-motion users get a calm, static version.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Sparkles } from "lucide-react";
import AnvikStar from "@/components/anvik/anvik-star";
import { useSession } from "@/components/anvik/session-provider";

const PARTICLES = [
  { left: "18%", top: "24%", size: 5, delay: 0 },
  { left: "34%", top: "66%", size: 4, delay: 2.1 },
  { left: "50%", top: "18%", size: 6, delay: 4.0 },
  { left: "68%", top: "58%", size: 5, delay: 1.4 },
  { left: "82%", top: "26%", size: 4, delay: 5.2 },
  { left: "28%", top: "84%", size: 5, delay: 3.3 },
] as const;

export default function WelcomeScreen() {
  const router = useRouter();
  const { loading, session, profile, consent } = useSession();
  const autoAdvanced = useRef(false);
  const [autoText, setAutoText] = useState("");

  const name = useMemo(() => {
    const raw = profile?.name?.trim();
    if (raw) return raw;
    const email = profile?.email ?? "";
    const local = email.split("@")[0] ?? "";
    return local ? local.slice(0, 24) : "friend";
  }, [profile?.name, profile?.email]);

  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // Guard: signed out → login; incomplete onboarding → back to onboarding.
  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    if (!consent?.hasAccepted) {
      router.replace("/onboarding");
    }
  }, [loading, session, consent, router]);

  // Auto-advance: a calm, in-page motion toward the chat — skipped when the
  // user prefers reduced motion or has already continued manually.
  useEffect(() => {
    if (!loading && session && consent?.hasAccepted && !reducedMotion && !autoAdvanced.current) {
      const timer = window.setTimeout(() => {
        if (autoAdvanced.current) return;
        autoAdvanced.current = true;
        router.replace("/chat");
      }, 6500);
      return () => window.clearTimeout(timer);
    }
    if (!reducedMotion) {
      setAutoText("");
    }
  }, [loading, session, consent?.hasAccepted, reducedMotion, router]);

  const continueToChat = () => {
    autoAdvanced.current = true;
    router.replace("/chat");
  };

  return (
    <main className="welcome-shell">
      <div className="welcome-glow" aria-hidden="true" />
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className="welcome-particle"
          aria-hidden="true"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            animationDelay: `${p.delay}s`,
            display: reducedMotion ? "none" : undefined,
          }}
        />
      ))}

      <div className="welcome-mark welcome-enter">
        <AnvikStar size="lg" />
      </div>

      <h1 className="welcome-name welcome-enter d1">
        Hello, <span style={{ color: "#5b4bf0" }}>{name}</span>.
      </h1>
      <p className="welcome-title welcome-enter d2">Welcome to ANVIK AI.</p>
      <p className="welcome-tagline welcome-enter d2">
        {autoText || "Your intelligence companion is ready."}
      </p>

      <button type="button" className="welcome-btn" onClick={continueToChat} style={{ display: "inline-flex", alignItems: "center", gap: "0.6rem" }}>
        <Sparkles aria-hidden className="h-4 w-4" />
        Enter ANVIK AI
        <ArrowRight aria-hidden className="h-4 w-4" />
      </button>
    </main>
  );
}
