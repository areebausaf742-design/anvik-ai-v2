"use client";

import { PublicChat } from "@/components/anvik/landing/public-chat";

/**
 * Landing hero. A single confident statement, one live chat bar, one primary
 * action. Guests get 10 free answers/day on the chat bar (no sign-in); after
 * that they are prompted to sign in, with the draft preserved.
 */

export function Hero() {
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
        <PublicChat />
      </div>
    </section>
  );
}
