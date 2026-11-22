"use client";

import React from "react";
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
  MessagesSquare,
  MonitorSmartphone,
  Receipt,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TrendingDown,
  Wallet,
  Zap,
  ArrowRight,
  Smartphone as PhoneIcon,
  type LucideIcon,
} from "lucide-react";
import { readDeviceId } from "@/lib/client-key";
import {
  whatsappEnquiryUrl,
  type PlanId,
} from "@/lib/plans";

/* ---------------------------------------------------------------------------
   Plan data — verbatim copy from the ANVIK AI pricing spec (2026-11-22).
   Paid plans activate through WhatsApp enquiry — no online payment is
   processed. The free CTA is a working link to the chat.
   --------------------------------------------------------------------------- */

export type Plan = {
  id: PlanId;
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
    priceSub: "10 questions every day · free forever",
    paid: false,
    features: [
      { icon: Sparkles, text: "10 questions every day" },
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
    amount: "49",
    period: "/ one-time",
    priceSub: "50 questions · valid 30 days",
    paid: true,
    features: [
      { icon: Zap, text: "50 questions" },
      { icon: Wallet, text: "One-time purchase" },
      { icon: CalendarCheck, text: "Valid 30 days" },
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
    amount: "149",
    period: "/ month",
    priceSub: "50 questions every day · billed monthly",
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
    amount: "1,299",
    period: "/ year",
    priceSub: "≈ ₹108/month · Save ~27% vs 12 monthly payments",
    paid: true,
    features: [
      { icon: Layers, text: "Everything included in Daily" },
      { icon: Gauge, text: "50 questions every day" },
      { icon: MonitorSmartphone, text: "Cross-device conversation history" },
      { icon: FileText, text: "Longer responses" },
      { icon: Receipt, text: "GST invoice" },
      { icon: CalendarCheck, text: "Full-year access" },
      { icon: BadgeCheck, text: "Approximately ₹108/month" },
      { icon: TrendingDown, text: "Save ~27% vs 12 monthly payments" },
    ],
    ctaLabel: "Get Yearly",
  },
];

const FEATURED_ID = "yearly";

/**
 * Horizontal WhatsApp CTA. The href is the static enquiry URL (SSR-safe);
 * the click handler attaches this device's id so the operator can activate
 * the right plan without a second round-trip.
 */
function WhatsAppCta({ plan, ctaLabel, featured }: { plan: Plan; ctaLabel: string; featured: boolean }) {
  const [href, setHref] = React.useState(() => whatsappEnquiryUrl(plan.id));
  return (
    <a
      className={`ppCta ${featured ? "ppCta--featured" : "ppCta--ghost"}`}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${ctaLabel} — ${plan.name} plan, opens WhatsApp`}
      onClick={(event) => {
        const withDevice = whatsappEnquiryUrl(plan.id, readDeviceId());
        setHref(withDevice);
        event.currentTarget.href = withDevice;
      }}
    >
      {ctaLabel}
      <PhoneIcon aria-hidden="true" size={17} />
    </a>
  );
}

export function PricingPlans() {
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
                    <MessagesSquare aria-hidden="true" size={13} />
                    Activates via WhatsApp
                  </span>
                )}
              </div>
              <h3 className="ppPlanName">{plan.name}</h3>
              <p className="ppTagline">{plan.tagline}</p>
              <div
                className="ppPrice"
                aria-label={`Price: ${plan.symbol}${plan.amount} per ${plan.id === "free" ? "forever" : plan.id === "pack" ? "one-time" : plan.id === "daily" ? "month" : "year"}`}
              >
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
                <Link
                  href={plan.href}
                  className="ppCta ppCta--solid"
                  aria-label={`${plan.ctaLabel} — ${plan.name} plan`}
                >
                  {plan.ctaLabel}
                  <ArrowRight aria-hidden="true" size={17} />
                </Link>
              ) : (
                <WhatsAppCta plan={plan} ctaLabel={plan.ctaLabel} featured={featured} />
              )}
            </article>
          );
        })}
      </div>

      <p className="ppFootNote">
        <CircleCheck aria-hidden="true" size={14} style={{ verticalAlign: "-2px", marginRight: 8 }} />
        <span>
          <strong>Prices are in rupees, inclusive of GST.</strong> No online payment is processed —
          paid plans activate after a WhatsApp enquiry from you to ANVIK.
        </span>
      </p>
    </div>
  );
}
