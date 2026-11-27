"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { PublicChat } from "@/components/anvik/landing/public-chat";
import { ElectricWavesShader } from "@/components/ui/colorful-wave-pattern-1";

export function Hero() {
  return (
    <section className="public-hero" aria-label="Talk with ANVIK">
      <ElectricWavesShader className="public-hero-waves" />
      <div className="public-hero-inner">
        <header className="public-masthead">
          <Link href="/" className="public-hero-brand" aria-label="ANVIK AI home">
            <span className="public-hero-mark" aria-hidden="true">◆</span>
            <span className="public-hero-name">ANVIK<span className="public-hero-ai">AI</span></span>
          </Link>
          <nav className="public-masthead-account" aria-label="Account">
            <span>Already have an account?</span>
            <Link href="/login" className="public-masthead-link">
              Sign in <ArrowUpRight aria-hidden="true" />
            </Link>
          </nav>
        </header>

        <div className="public-hero-copy">
          <p className="public-hero-eyebrow">YOUR PERSONAL WORKSPACE</p>
          <h1 className="public-hero-heading">
            Ask anything.
            <span>Find your next step.</span>
          </h1>
          <p className="public-hero-sub">
            A calm, capable workspace for answers, code, images and vision —
            in English, Hindi or Hinglish.
          </p>
        </div>
        <PublicChat />
      </div>
    </section>
  );
}
