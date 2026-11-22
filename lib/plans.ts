/**
 * Canonical pricing / plan configuration — the single source of truth for
 * what ANVIK sells, what it costs and what every plan includes.
 *
 * Locked contract (revised 2026-11-22):
 *   FREE  — ₹0 · 10 questions per day · free forever · device-local history
 *   PACK  — ₹49 one-time · 50 questions total · valid 30 days
 *   DAILY — ₹149/month · 50 questions per day · GST invoice · longer answers
 *   YEARLY — ₹1,299/year · 50 questions per day · ≈ ₹108/month · save ≈27%
 *           vs 12 monthly payments · GST invoice · longer answers
 *
 * Paid plans are activated by a human through WhatsApp (no online payment
 * is processed today). Enforcement happens server-side against the
 * entitlements ledger — never in the browser. Free is enforced per IP.
 *
 * Growth discipline: free is the only guaranteed, life-long entitlement.
 * Paid plans must never be priced or displayed below it, and daily-capped
 * plans must never cap below Free's daily allowance.
 */

export type PlanId = "free" | "pack" | "daily" | "yearly";

export type BillingPeriod = "forever" | "one_time" | "monthly" | "yearly";

export interface PlanSpec {
  id: PlanId;
  name: string;
  priceInr: number;
  priceDisplay: string;
  billing: BillingPeriod;
  billingPhrase: string;
  /** Human suffix shown next to the amount, e.g. "/ month". */
  pricePeriod: string;
  /** Billing line shown under the price. */
  priceSub: string;
  /** Validity in days from activation — null means forever (free). */
  validityDays: number | null;
  /** Per-IST-day cap — only for daily-capped plans (free, daily, yearly). */
  questionsPerDay: number | null;
  /** One-time total questions — only for the pack plan. */
  totalQuestions: number | null;
  /** Effective monthly figure for the yearly plan, in ₹. */
  monthlyEquivalentInr: number | null;
  /** Approximate discount vs 12 monthly payments, in whole percent. */
  savePercentVsMonthly: number | null;
  tagline: string;
  ctaLabel: string;
}

export const FREE_DAILY_LIMIT = 10;


export const PLANS: PlanSpec[] = [
  {
    id: "free",
    name: "Free",
    priceInr: 0,
    priceDisplay: "₹0",
    billing: "forever",
    billingPhrase: "free forever",
    pricePeriod: "/ forever",
    priceSub: "10 questions every day · free forever",
    validityDays: null,
    questionsPerDay: FREE_DAILY_LIMIT,
    totalQuestions: null,
    monthlyEquivalentInr: null,
    savePercentVsMonthly: null,
    tagline: "Your journey starts here.",
    ctaLabel: "Start for free",
  },
  {
    id: "pack",
    name: "Pack",
    priceInr: 49,
    priceDisplay: "₹49",
    billing: "one_time",
    billingPhrase: "one-time",
    pricePeriod: "/ one-time",
    priceSub: "50 questions · valid 30 days",
    validityDays: 30,
    questionsPerDay: null,
    totalQuestions: 50,
    monthlyEquivalentInr: null,
    savePercentVsMonthly: null,
    tagline: "More intelligence, when you need it.",
    ctaLabel: "Get Pack",
  },
  {
    id: "daily",
    name: "Daily",
    priceInr: 149,
    priceDisplay: "₹149",
    billing: "monthly",
    billingPhrase: "per month",
    pricePeriod: "/ month",
    priceSub: "50 questions every day · billed monthly",
    validityDays: 30,
    questionsPerDay: 50,
    totalQuestions: null,
    monthlyEquivalentInr: null,
    savePercentVsMonthly: null,
    tagline: "Your everyday intelligence companion.",
    ctaLabel: "Choose Daily",
  },
  {
    id: "yearly",
    name: "Yearly",
    priceInr: 1299,
    priceDisplay: "₹1,299",
    billing: "yearly",
    billingPhrase: "per year",
    pricePeriod: "/ year",
    priceSub: "50 questions every day · full-year access",
    validityDays: 365,
    questionsPerDay: 50,
    totalQuestions: null,
    monthlyEquivalentInr: 108,
    savePercentVsMonthly: 27,
    tagline: "The complete ANVIK experience.",
    ctaLabel: "Get Yearly",
  },
];

export function planById(id: PlanId): PlanSpec {
  const plan = PLANS.find((p) => p.id === id);
  if (!plan) throw new Error(`Unknown plan: ${id}`);
  return plan;
}

export function paidPlanIds(): PlanId[] {
  return PLANS.filter((p) => p.priceInr > 0).map((p) => p.id);
}

/** The WhatsApp number that answers paid-plan enquiries. */
export const WHATSAPP_NUMBER = "919044996869";

function quotaClause(id: PlanId): string {
  const plan = planById(id);
  if (plan.id === "pack") return "50 questions";
  if (plan.id === "free") return "10 questions every day";
  if (plan.monthlyEquivalentInr != null) {
    return `50 questions every day · full-year access (≈ ₹${plan.monthlyEquivalentInr}/month)`;
  }
  return "50 questions every day";
}

function billingPhrase(billing: BillingPeriod): string {
  switch (billing) {
    case "forever":
      return "free forever";
    case "one_time":
      return "one-time payment";
    case "monthly":
      return "monthly subscription";
    case "yearly":
      return "yearly subscription";
  }
}

/**
 * The pre-filled enquiry message for a paid plan. Composes the plan name,
 * price, billing period and included quota so the operator has everything
 * they need to activate the plan.
 */
export function whatsappEnquiryMessage(id: PlanId, deviceId?: string): string {
  const plan = planById(id);
  const lines = [
    `Hi ANVIK AI — I'm interested in the ${plan.name} plan.`,
    "",
    `Price: ${plan.priceDisplay}`,
    `Billing: ${billingPhrase(plan.billing)}${plan.validityDays ? ` · valid ${plan.validityDays} days` : ""}`,
    `Included: ${quotaClause(plan.id)}`,
  ];
  if (deviceId) lines.push(`My device: ${deviceId}`);
  lines.push("Please activate it for me.");
  return lines.join("\n");
}

/** Full wa.me deep-link for a paid plan enquiry. */
export function whatsappEnquiryUrl(id: PlanId, deviceId?: string): string {
  const message = whatsappEnquiryMessage(id, deviceId);
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
