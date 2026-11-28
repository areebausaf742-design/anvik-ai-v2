"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { PublicChat } from "@/components/anvik/landing/public-chat";
import { KineticSphere } from "@/components/anvik/landing/kinetic-sphere";

export function Hero() {
  return (
    <section className="public-hero" aria-label="Talk with ANVIK">
      <div className="public-hero-wash" aria-hidden="true" />
      <div className="public-hero-inner">
        <header className="public-masthead">
          <Link href="/" className="public-hero-brand" aria-label="ANVIK AI home">
            <span className="public-hero-mark" aria-hidden="true">◆</span>
            <span className="public-hero-name">ANVIK<span className="public-hero-ai">AI</span></span>
          </Link>
          <nav className="public-masthead-nav" aria-label="Main navigation">
            <a href="#tools">The workspace</a>
            <a href="#how-it-works">How it works</a>
            <a href="#languages">Made for your language</a>
          </nav>
          <div className="public-masthead-account">
            <Link href="/chat" className="public-masthead-link">Open workspace <ArrowUpRight aria-hidden="true" /></Link>
          </div>
        </header>

        <div className="public-hero-grid">
          <div className="public-hero-copy">
            <p className="public-hero-eyebrow"><span className="public-live-dot" /> YOUR THOUGHTS, WITH ROOM TO GO FURTHER</p>
            <h1 className="public-hero-heading">
              Start with a thought.
              <span>Leave with momentum.</span>
            </h1>
            <p className="public-hero-sub">
              A little help thinking it through. A lot more room to make it real.
              Meet your all-in-one AI workspace for chat, code, images, voice and vision.
            </p>
            <a className="public-hero-scroll" href="#tools">
              <span>Meet your new workspace</span><ArrowDownRight aria-hidden="true" />
            </a>
          </div>
          <div className="public-hero-art">
            <KineticSphere />
          </div>
        </div>

        <div className="public-hero-prompt" id="ask-anvik">
          <div className="public-prompt-heading">
            <span className="public-prompt-index">YOUR SPACE TO BEGIN</span>
            <span className="public-prompt-hint">No perfect prompt required.</span>
          </div>
          <PublicChat />
        </div>
        <div className="public-hero-rail" aria-hidden="true">
          <span>ONE SPACE TO THINK, MAKE & MOVE</span>
          <span>01 / 03</span>
        </div>
      </div>
    </section>
  );
}
