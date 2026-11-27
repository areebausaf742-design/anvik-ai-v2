"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { PublicChatbar } from "@/components/anvik/landing/chatbar";
import { Button } from "@/components/anvik/ui";

/**
 * Landing hero. A single confident statement, one live chat bar, one primary
 * action. No gradient text, no glass cards, no ornament — scale and spacing do
 * the work. Pressing send in the bar preserves the draft and hands off to
 * sign-in, which restores and sends it from /chat.
 */

export function Hero() {
  const router = useRouter();
  return (
    <section className="public-hero" aria-label="Hero">
      <div className="public-hero-inner">
        <div className="public-hero-brand flex items-center gap-2">
          <span className="public-hero-mark" aria-hidden="true">◆</span>
          <span className="public-hero-name">ANVIK<span className="public-hero-ai">AI</span></span>
        </div>
        <h1 className="public-hero-heading">
          Ask anything.<br />
          Get instant, intelligent answers.
        </h1>
        <p className="public-hero-sub">
          A calm, confident workspace for questions, code, images and vision —
          in English, Hindi or Hinglish. Ten free questions a day; sign in to
          keep your history, credits and consent.
        </p>
        <PublicChatbar onSend={(draft) => {
          void router.push("/login");
        }} />
        <p className="public-hero-note">
          Pressing send opens sign-in with your draft preserved — no account
          needed to try, an account to keep going.
        </p>
        <Button asChild variant="outline" className="public-hero-cta">
          <Link href="/login" prefetch={false}>
            Sign in to continue <span className="text-[var(--theme-text-secondary)]" aria-hidden>→</span>
          </Link>
        </Button>
      </div>
    </section>
  );
}
