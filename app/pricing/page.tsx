import type { Metadata, Viewport } from "next";
import Link from "next/link";
import React from "react";
import {
  BadgeCheck,
  CalendarCheck,
  CheckCircle2,
  Eye,
  Infinity as InfinityIcon,
  LockKeyhole,
  Receipt,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import AnvikStar from "@/components/anvik/anvik-star";
import { PricingPlans } from "./plans";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple pricing, in rupees and GST-included. Free forever: 10 questions a day. Pack ₹49 one-time · Daily ₹149/mo · Yearly ₹1,299/yr — best value. Paid plans activate via WhatsApp.",
  openGraph: {
    title: "Pricing — ANVIK AI",
    description:
      "Simple pricing, in rupees and GST-included. Free forever, then Pack ₹49 · Daily ₹149/mo · Yearly ₹1,299/yr — best value. Paid plans activate via WhatsApp.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#07060F",
  colorScheme: "dark",
};

const TRUST_ITEMS = [
  {
    icon: Eye,
    title: "Transparent pricing",
    body: "Every price is shown in rupees, inclusive of GST. What you see is exactly what you pay — no line items to decode.",
  },
  {
    icon: Wallet,
    title: "No hidden charges",
    body: "No metered usage, no surcharges, no delivery fees. The price you see is the price you pay, today and at launch.",
  },
  {
    icon: InfinityIcon,
    title: "Free forever",
    body: "The free plan is free permanently: 10 questions every day, history on this device, public answer pages.",
  },
  {
    icon: ShieldCheck,
    title: "No credit card for free",
    body: "You never need to enter payment details for the free tier — start in seconds, stay free, no trap.",
  },
  {
    icon: CalendarCheck,
    title: "One-time Pack",
    body: "A single ₹49 payment, valid 30 days. No recurring billing, no auto-renewal, no second prompt.",
  },
  {
    icon: Receipt,
    title: "Clear subscription billing",
    body: "Daily bills ₹149/month and Yearly bills ₹1,299/year, in rupees, GST included, with a GST invoice for every billing.",
  },
] as const;

const HERO_TRUST = [
  "Prices in ₹ · GST included",
  "No credit card for the free tier",
  "Free forever — no trial timer",
  "Paid plans activate via WhatsApp",
] as const;

export default function PricingPage() {
  return (
    <main className="ppPage">
      {/* atmospheric background — pure CSS, pointer-events none */}
      <div className="ppAtmosphere" aria-hidden="true">
        <div className="ppAurora" />
        <div className="ppAtmosphereGrid" />
        <div className="ppStars" />
        <div className="ppGrain" />
      </div>

      <div className="ppContent">
        {/* top bar */}
        <header className="ppTopbar">
          <Link href="/" className="ppBrand" aria-label="ANVIK AI home">
            <span className="ppBrandMark">
              <AnvikStar size="sm" spin className="anvik-star" />
            </span>
            <span>
              ANVIK<span className="ppBrandAi"> AI</span>
            </span>
          </Link>
          <span className="ppTopbarNote">
            <span className="ppTopbarLiveDot" aria-hidden="true" />
            Free tier live today
          </span>
        </header>

        {/* hero */}
        <section className="ppHero" aria-labelledby="pricing-headline">
          <p className="ppEyebrow">
            <Sparkles aria-hidden="true" size={15} />
            ANVIK AI · Pricing
          </p>
          <h1 className="ppHeadline" id="pricing-headline">
            Intelligence deserves a{" "}
            <span className="ppHeadlineAccent">better upgrade</span>.
          </h1>
          <p className="ppHeroText">
            Choose the intelligence that moves you forward. Start free, explore more and unlock the
            full potential of ANVIK AI.
          </p>
          <ul className="ppHeroTrustList" aria-label="Pricing highlights">
            {HERO_TRUST.map((item) => (
              <li key={item}>
                <CheckCircle2 aria-hidden="true" size={17} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* plans */}
        <h2 className="ppSrOnly">Pricing plans</h2>
        <div className="ppSectionLabel" aria-hidden="true">
          <span>Pricing plans</span>
        </div>
        <PricingPlans />

        {/* trust & transparency */}
        <section className="ppTrust" aria-labelledby="pricing-trust-heading">
          <p className="ppTrustKicker">
            <ShieldCheck aria-hidden="true" size={14} />
            Trust &amp; transparency
          </p>
          <h2 className="ppTrustHeading" id="pricing-trust-heading">
            Transparent pricing, by design.
          </h2>
          <p className="ppTrustSub">
            No hidden charges, no metered usage, no fine print beyond the plan itself. Free is free
            forever; subscriptions are disclosed in plain words — in rupees, GST included.
          </p>
          <div className="ppTrustGrid">
            {TRUST_ITEMS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="ppTrustCell">
                <span className="ppTrustIcon" aria-hidden="true">
                  <Icon size={19} strokeWidth={2.1} />
                </span>
                <div>
                  <h3 className="ppTrustTitle">{title}</h3>
                  <p className="ppTrustBody">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* footer */}
        <footer className="ppFooter">
          <span className="ppFooterBrand">
            <AnvikStar size="sm" spin className="anvik-star" />
            ANVIK AI
          </span>
          <p className="ppFooterNote">
            Payments are not processed online — paid plans are activated after a WhatsApp enquiry
            from your device. Prices are in rupees, inclusive of GST.
          </p>
          <nav className="ppFooterLinks" aria-label="Footer">
            <Link href="/about">About</Link>
            <Link href="/chat">Ask a question</Link>
          </nav>
        </footer>
      </div>
    </main>
  );
}
