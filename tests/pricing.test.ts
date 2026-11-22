import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PricingPlans, PLANS } from "../app/pricing/plans";
import PricingPage from "../app/pricing/page";
import {
  PLANS as CANONICAL_PLANS,
  whatsappEnquiryMessage,
  whatsappEnquiryUrl,
  planById,
} from "../lib/plans";

function render(ui: React.ReactElement) {
  return renderToStaticMarkup(ui);
}

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2700}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}]/u;
const WA_NUMBER = "919044996869";

test("prices and plan copy are verbatim from the spec", () => {
  const byId = Object.fromEntries(PLANS.map((p) => [p.id, p]));

  assert.equal(byId.free.amount, "0");
  assert.equal(byId.free.period, "/ forever");
  assert.equal(byId.free.tagline, "Your journey starts here.");
  assert.deepEqual(byId.free.features.map((f) => f.text), [
    "10 questions every day",
    "Free forever, not a temporary trial",
    "Conversation history on this device",
    "Public answer pages",
    "No credit card required",
  ]);
  assert.equal(byId.free.href, "/chat");

  assert.equal(byId.pack.amount, "49");
  assert.equal(byId.pack.period, "/ one-time");
  assert.equal(byId.pack.tagline, "More intelligence, when you need it.");
  assert.deepEqual(byId.pack.features.map((f) => f.text), [
    "50 questions",
    "One-time purchase",
    "Valid 30 days",
    "No recurring subscription",
  ]);

  assert.equal(byId.daily.amount, "149");
  assert.equal(byId.daily.period, "/ month");
  assert.equal(byId.daily.tagline, "Your everyday intelligence companion.");
  assert.deepEqual(byId.daily.features.map((f) => f.text), [
    "50 questions every day",
    "Conversation history across devices",
    "Longer AI responses",
    "GST invoice",
  ]);

  assert.equal(byId.yearly.amount, "1,299");
  assert.equal(byId.yearly.period, "/ year");
  assert.equal(byId.yearly.tagline, "The complete ANVIK experience.");
  assert.deepEqual(byId.yearly.features.map((f) => f.text), [
    "Everything included in Daily",
    "50 questions every day",
    "Cross-device conversation history",
    "Longer responses",
    "GST invoice",
    "Full-year access",
    "Approximately ₹108/month",
    "Save ~27% vs 12 monthly payments",
  ]);
});

test("canonical plan spec matches the pricing display verbatim", () => {
  const displayById = Object.fromEntries(PLANS.map((p) => [p.id, p]));
  for (const spec of CANONICAL_PLANS) {
    const display = displayById[spec.id];
    assert.ok(display, `missing display plan for ${spec.id}`);
    assert.equal(display.name, spec.name);
    assert.equal(Number(display.amount.replaceAll(",", "")), spec.priceInr);
    assert.equal(display.period, spec.pricePeriod);
    if (spec.id === "pack") {
      assert.equal(spec.totalQuestions, 50);
      assert.equal(spec.validityDays, 30);
    } else if (spec.id === "daily") {
      assert.equal(spec.questionsPerDay, 50);
      assert.equal(spec.validityDays, 30);
    } else if (spec.id === "yearly") {
      assert.equal(spec.questionsPerDay, 50);
      assert.equal(spec.validityDays, 365);
      assert.equal(spec.monthlyEquivalentInr, 108);
      assert.equal(spec.savePercentVsMonthly, 27);
    } else {
      assert.equal(spec.questionsPerDay, 10);
      assert.equal(spec.validityDays, null);
    }
  }
});

test("rendered pricing grid shows every plan with its verbatim copy", () => {
  const markup = render(React.createElement(PricingPlans));

  for (const plan of PLANS) {
    assert.match(markup, new RegExp(plan.name, "i"));
    assert.match(markup, new RegExp(plan.tagline.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(markup, new RegExp(plan.symbol + plan.amount));
    assert.match(markup, new RegExp(plan.period.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    for (const feature of plan.features) {
      assert.match(markup, new RegExp(feature.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  }

  assert.match(markup, /Best Value/);
  assert.match(markup, /Start for free/);
  assert.match(markup, /Get Pack/);
  assert.match(markup, /Choose Daily/);
  assert.match(markup, /Get Yearly/);
});

test("one-time Pack is clearly one-time; subscriptions are clearly disclosed", () => {
  const markup = render(React.createElement(PricingPlans));
  assert.match(markup, /one-time/i);
  assert.match(markup, /Valid 30 days/);
  assert.match(markup, /billed monthly/i);
  assert.match(markup, /₹/);
  assert.match(markup, /1,299/);
  assert.match(markup, /108\/month/);
  assert.match(markup, /Save ~27%/);
  assert.match(markup, /per year/i);
});

test("every paid CTA opens the WhatsApp enquiry link with the pre-filled message", () => {
  const markup = render(React.createElement(PricingPlans));
  const waHrefs = [...markup.matchAll(/href="(https:\/\/wa\.me\/[^"]+)"/g)].map(([, href]) =>
    href.replace(/&#x27;/g, "'"),
  );
  assert.equal(waHrefs.length, 3);
  for (const plan of PLANS.filter((p) => p.paid)) {
    const expected = whatsappEnquiryUrl(plan.id);
    const expectedEncoded = encodeURIComponent(whatsappEnquiryMessage(plan.id));
    const match = waHrefs.find((href) => {
      const expectedPrefix = `https://wa.me/${WA_NUMBER}?text=${expectedEncoded}`;
      return href === expectedPrefix || href === expected;
    });
    assert.ok(match, `missing enquiry URL with pre-filled message for ${plan.name}`);
    assert.ok(match.startsWith(`https://wa.me/${WA_NUMBER}?text=`), "missing wa.me CTA");
    // The decoded message must carry the plan name, price, billing and quota.
    const decoded = decodeURIComponent(match.split("?text=")[1]).replace(/\+/g, " ");
    assert.match(decoded, new RegExp(plan.name));
    assert.match(decoded, new RegExp(`Price: ${plan.symbol}${plan.amount}`));
    assert.match(decoded, /Billing:/);
    assert.match(decoded, /Included:/);
  }
  assert.match(
    markup,
    /<a[^>]*aria-label="Get Pack — Pack plan, opens WhatsApp"/,
  );
  assert.match(
    markup,
    /<a[^>]*aria-label="Choose Daily — Daily plan, opens WhatsApp"/,
  );
  assert.match(
    markup,
    /<a[^>]*aria-label="Get Yearly — Yearly plan, opens WhatsApp"/,
  );
  // Free stays a chat link, never a WhatsApp CTA.
  assert.doesNotMatch(markup, /Start for free[^>]*wa\.me/);
});

test("the WhatsApp enquiry message carries plan name, price, billing period and quota", () => {
  for (const id of ["pack", "daily", "yearly"] as const) {
    const spec = planById(id);
    const message = whatsappEnquiryMessage(id);
    assert.match(message, new RegExp(spec.name));
    assert.match(message, new RegExp(spec.priceDisplay));
    assert.match(message, /Billing:/);
    assert.match(message, /Included:/);
  }
  assert.match(whatsappEnquiryMessage("pack"), /50 questions/);
  assert.match(whatsappEnquiryMessage("pack"), /one-time/);
  assert.match(whatsappEnquiryMessage("pack"), /valid 30 days/);
  assert.match(whatsappEnquiryMessage("daily"), /50 questions every day/);
  assert.match(whatsappEnquiryMessage("daily"), /monthly subscription/);
  assert.match(whatsappEnquiryMessage("daily"), /valid 30 days/);
  assert.match(whatsappEnquiryMessage("yearly"), /50 questions every day/);
  assert.match(whatsappEnquiryMessage("yearly"), /yearly subscription/);
  assert.match(whatsappEnquiryMessage("yearly"), /valid 365 days/);
  assert.match(whatsappEnquiryMessage("yearly"), /108\/month/);
});

test("paid plans never present as charged or live — they activate via WhatsApp", () => {
  const markup = render(React.createElement(PricingPlans));
  assert.doesNotMatch(markup, /Coming soon/i);
  assert.doesNotMatch(markup, /charged|checkout|subscribe now|payment successful|invoice issued|Coming soon/i);
  assert.match(markup, /activate/i);
  assert.match(markup, /WhatsApp/);
});

test("the free CTA is a working link to chat — and the page never fabricates a live payment flow", () => {
  const markup = render(React.createElement(PricingPlans));
  assert.match(markup, /<a[^>]*href="\/chat"[^>]*>[\s\S]*?Start for free/);
  assert.doesNotMatch(markup, /href="\/(checkout|pay|subscribe|billing|invoice)/i);
});

test("prices include GST and honor the rupees-only market — never a bare $ or USD figure", () => {
  const markup = render(React.createElement(PricingPlans));
  assert.match(markup, /GST invoice/);
  assert.match(markup, /inclusive of GST/);
  assert.doesNotMatch(markup, /\$|USD|\b1[0-9]{2}\b\s?(?=USD|\$)/);
});

test("the page renders the hero copy verbatim, with no fabricated dates, logos, or emoji", () => {
  const markup = render(React.createElement(PricingPage));
  assert.match(markup, /Intelligence deserves a/);
  assert.match(markup, /better upgrade/);
  assert.match(markup, /Choose the intelligence that moves you forward/);
  assert.match(markup, /Start free, explore more and unlock the full potential of ANVIK AI/);
  assert.match(markup, /Transparent pricing/);
  assert.match(markup, /Free forever/);
  assert.match(markup, /One-time Pack/);
  assert.match(markup, /Clear subscription billing/);
  assert.match(markup, /GST/);
  assert.match(markup, /WhatsApp/);
  assert.doesNotMatch(markup, /Gemini/);
  assert.doesNotMatch(markup, EMOJI_RE);
  assert.doesNotMatch(markup, /stars\.infinity|starlight|202[0-9](?!\d)/);
});

test("pricing page copy is honest about payment state", () => {
  const markup = render(React.createElement(PricingPage));
  assert.match(markup, /Payments are not processed online/);
  assert.match(markup, /WhatsApp enquiry/);
  assert.doesNotMatch(markup, /Coming soon/);
  assert.doesNotMatch(markup, /Nothing will be charged today/);
});
