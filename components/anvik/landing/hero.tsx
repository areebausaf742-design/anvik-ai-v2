"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Menu, MoveUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { PublicChat } from "@/components/anvik/landing/public-chat";

const KineticSphere = dynamic(
  () => import("@/components/anvik/landing/kinetic-sphere").then((module) => module.KineticSphere),
  {
    ssr: false,
    loading: () => <div className="landing-orbit-fallback" aria-hidden="true" />,
  },
);

const CONNECTORS = ["Chat", "Code", "Image", "Voice", "Vision"];

export function Hero() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <section className="public-hero" aria-label="Talk with ANVIK">
      <div className="public-hero-wash" aria-hidden="true" />
      <div className="public-hero-inner">
        <header className={`public-masthead ${scrolled ? "public-masthead-scrolled" : ""}`}>
          <Link href="/" className="public-hero-brand" aria-label="ANVIK AI home">
            <span className="public-hero-mark" aria-hidden="true">◆</span>
            <span className="public-hero-name">ANVIK<span className="public-hero-ai">AI</span></span>
          </Link>
          <nav className={`public-masthead-nav ${menuOpen ? "public-masthead-nav-open" : ""}`} aria-label="Main navigation">
            <a href="#tools" onClick={() => setMenuOpen(false)}>Capabilities</a>
            <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a>
            <a href="#languages" onClick={() => setMenuOpen(false)}>Languages</a>
          </nav>
          <div className="public-masthead-account">
            <Link href="/chat" className="public-masthead-link">Open workspace <ArrowUpRight aria-hidden="true" /></Link>
            <button
              type="button"
              className="public-masthead-menu"
              aria-label={menuOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <Menu aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="public-hero-grid">
          <div className="public-hero-copy">
            <p className="public-hero-eyebrow"><span className="public-live-dot" /> ONE INTELLIGENCE / MANY SURFACES</p>
            <h1 className="public-hero-heading">
              Start with a thought.
              <span>Leave with momentum.</span>
            </h1>
            <p className="public-hero-sub">
              A calm, capable workspace for chat, code, images, voice and vision. Bring the rough idea. ANVIK helps you find what comes next.
            </p>
            <div className="public-hero-actions">
              <a className="public-hero-cta" href="#ask-anvik">Start with ANVIK <MoveUpRight aria-hidden="true" /></a>
              <a className="public-hero-scroll" href="#tools">
                <span>Explore the surfaces</span><ArrowDownRight aria-hidden="true" />
              </a>
            </div>
            <div className="public-connect-row" aria-label="ANVIK capabilities">
              <span className="public-connect-label">Connect with</span>
              {CONNECTORS.map((connector) => <span key={connector} className="public-connect-chip">{connector}</span>)}
            </div>
          </div>
          <div className="public-hero-art">
            <KineticSphere />
          </div>
        </div>

        <div className="public-hero-prompt" id="ask-anvik">
          <div className="public-prompt-heading">
            <span className="public-prompt-index">LIVE ANVIK CHAT</span>
            <span className="public-prompt-hint">No perfect prompt required.</span>
          </div>
          <PublicChat />
        </div>
        <div className="public-hero-rail" aria-hidden="true">
          <span>ONE SPACE TO THINK, MAKE &amp; MOVE</span>
          <span>01 / 05</span>
        </div>
      </div>
    </section>
  );
}
