"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  CalendarCheck,
  CircleCheck,
  FileText,
  Gauge,
  Globe,
  Infinity as InfinityIcon,
  Layers,
  LockKeyhole,
  MonitorSmartphone,
  Receipt,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TrendingDown,
  Wallet,
  Zap,
  ArrowRight,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

/* ---------------------------------------------------------------------------
   Plan data — verbatim copy from the ANVIK AI product spec.
   Paid plans are NOT live: nothing in this file charges, confirms or books
   a payment. The CTAs explain the honest state when pressed.
   --------------------------------------------------------------------------- */

export type Plan = {
  id: "free" | "pack" | "daily" | "yearly";
  kicker: string;
  name: string;
  tagline: string;
  symbol: string;
  amount: string;
  period: string;
  priceSub: string;
  paid: boolean;
  features: { icon: LucideIcon; text: string }[];
  ctaLabel: string;
  href?: string;
};

export const PLANS: Plan[] = [
  {
    id: "free",
    kicker: "Free",
    name: "Free",
    tagline: "Your journey starts here.",
    symbol: "₹",
    amount: "0",
    period: "/ forever",
    priceSub: "No card required. No trial timer.",
    paid: false,
    features: [
      { icon: Sparkles, text: "3 questions every day" },
      { icon: InfinityIcon, text: "Free forever, not a temporary trial" },
      { icon: Smartphone, text: "Conversation history on this device" },
      { icon: Globe, text: "Public answer pages" },
      { icon: ShieldCheck, text: "No credit card required" },
    ],
    ctaLabel: "Start for free",
    href: "/chat",
  },
  {
    id: "pack",
    kicker: "One-time",
    name: "Pack",
    tagline: "More intelligence, when you need it.",
    symbol: "₹",
    amount: "19",
    period: "/ one-time",
    priceSub: "Valid 30 days · no recurring billing",
    paid: true,
    features: [
      { icon: Zap, text: "25 questions" },
      { icon: Wallet, text: "One-time purchase" },
      { icon: CalendarCheck, text: "Valid for 30 days" },
      { icon: BadgeCheck, text: "No recurring subscription" },
    ],
    ctaLabel: "Get Pack",
  },
  {
    id: "daily",
    kicker: "Per month",
    name: "Daily",
    tagline: "Your everyday intelligence companion.",
    symbol: "₹",
    amount: "49",
    period: "/ month",
    priceSub: "Billed monthly · GST invoice",
    paid: true,
    features: [
      { icon: Gauge, text: "50 questions every day" },
      { icon: MonitorSmartphone, text: "Conversation history across devices" },
      { icon: FileText, text: "Longer AI responses" },
      { icon: Receipt, text: "GST invoice" },
    ],
    ctaLabel: "Choose Daily",
  },
  {
    id: "yearly",
    kicker: "Per year",
    name: "Yearly",
    tagline: "The complete ANVIK experience.",
    symbol: "₹",
    amount: "399",
    period: "/ year",
    priceSub: "≈ ₹33/month · Save 32% vs monthly",
    paid: true,
    features: [
      { icon: Layers, text: "Everything included in Daily" },
      { icon: Gauge, text: "50 questions every day" },
      { icon: MonitorSmartphone, text: "Cross-device conversation history" },
      { icon: FileText, text: "Longer responses" },
      { icon: Receipt, text: "GST invoice" },
      { icon: CalendarCheck, text: "Full-year access" },
      { icon: BadgeCheck, text: "Approximately ₹33/month" },
      { icon: TrendingDown, text: "Save 32% vs 12 monthly payments" },
    ],
    ctaLabel: "Get Yearly",
  },
];

const FEATURED_ID = "yearly";

export function PricingPlans() {
  const [honestNote, setHonestNote] = useState<string | null>(null);

  return (
    <div>
      <div className="ppGridPlans" role="list" aria-label="Pricing plans">
        {PLANS.map((plan) => {
          const featured = plan.id === FEATURED_ID;
          return (
            <article
              key={plan.id}
              role="listitem"
              className={`ppCard${featured ? " ppCardFeatured" : ""}`}
              aria-label={`${plan.name} plan — ${plan.priceSub}`}
            >
              <span className="ppCardHoverGlow" aria-hidden="true" />
              {featured && (
                <span className="ppBadge">
                  <Sparkles aria-hidden="true" size={13} />
                  Best Value
                </span>
              )}
              <div className="ppCardTop">
                <span className="ppKicker">{plan.kicker}</span>
                {plan.paid && (
                  <span className="ppInCardNote">
                    <LockKeyhole aria-hidden="true" size={13} />
                    Coming soon
                  </span>
                )}
              </div>
              <h3 className="ppPlanName">{plan.name}</h3>
              <p className="ppTagline">{plan.tagline}</p>
              <div className="ppPrice" aria-label={`Price: ${plan.symbol}${plan.amount} per ${plan.id === "free" ? "forever" : plan.id === "pack" ? "one-time" : plan.id === "daily" ? "month" : "year"}`}>
                <span className="ppPriceSymbol">{plan.symbol}</span>
                <span className="ppPriceAmount">{plan.amount}</span>
                <span className="ppPricePeriod">{plan.period}</span>
              </div>
              <p className="ppPriceSub">{plan.priceSub}</p>
              <div className="ppCardDivider" aria-hidden="true" />
              <ul className="ppFeatures">
                {plan.features.map((feature) => {
                  const FeatureIcon = feature.icon;
                  return (
                    <li key={feature.text}>
                      <span className="ppFeatureIcon" aria-hidden="true">
                        <FeatureIcon size={14} strokeWidth={2.2} />
                      </span>
                      <span>{feature.text}</span>
                    </li>
                  );
                })}
              </ul>
              {plan.href ? (
                <Link href={plan.href} className="ppCta ppCta--solid" aria-label={`${plan.ctaLabel} — ${plan.name} plan`}>
                  {plan.ctaLabel}
                  <ArrowRight aria-hidden="true" size={17} />
                </Link>
              ) : (
                <button
                  type="button"
                  className={`ppCta ${featured ? "ppCta--featured" : "ppCta--ghost"}`}
                  onClick={() => setHonestNote(plan.name)}
                  aria-label={`${plan.ctaLabel} — ${plan.name} plan, not live yet`}
                >
                  {plan.ctaLabel}
                </button>
              )}
            </article>
          );
        })}
      </div>

      <div role="status" aria-live="polite">
        {honestNote && (
          <div className="ppHonest">
            <TriangleAlert aria-hidden="true" size={22} />
            <p>
              <strong>{honestNote} is not live yet.</strong> Nothing will be charged — paid packs open
              soon. Your interest is noted for when they do; the free tier is the whole product today.
            </p>
            <button type="button" className="ppHonestDismiss" onClick={() => setHonestNote(null)}>
              Dismiss
            </button>
          </div>
        )}
      </div>

      <p className="ppFootNote">
        <CircleCheck aria-hidden="true" size={14} style={{ verticalAlign: "-2px", marginRight: 8 }} />
        <span>
          <strong>Prices are in rupees, inclusive of GST.</strong> No hidden charges — the price you see
          is the price you pay.
        </span>
      </p>
    </div>
  );
}
