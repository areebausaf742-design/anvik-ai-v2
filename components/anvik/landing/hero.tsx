"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { PublicChatbar } from "@/components/anvik/landing/chatbar";

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
        <Link
          href="/login"
          className="public-hero-cta inline-flex items-center gap-2 rounded-xl border border-[#343842] bg-[#0b0d12] px-5 py-2.5 text-sm font-medium text-[#dce1e9] hover:bg-[#121827] hover:border-[#5d6673] transition-colors"
          prefetch={false}
        >
          Sign in to continue <span className="text-[#949ca9]" aria-hidden>→</span>
        </Link>
      </div>
    </section>
  );
}
