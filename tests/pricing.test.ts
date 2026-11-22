import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PricingPlans, PLANS } from "../app/pricing/plans";
import PricingPage from "../app/pricing/page";

function render(ui: React.ReactElement) {
  return renderToStaticMarkup(ui);
}

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2700}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}]/u;

test("prices and plan copy are verbatim from the spec", () => {
  const byId = Object.fromEntries(PLANS.map((p) => [p.id, p]));

  assert.equal(byId.free.amount, "0");
  assert.equal(byId.free.period, "/ forever");
  assert.equal(byId.free.tagline, "Your journey starts here.");
  assert.deepEqual(byId.free.features.map((f) => f.text), [
    "3 questions every day",
    "Free forever, not a temporary trial",
    "Conversation history on this device",
    "Public answer pages",
    "No credit card required",
  ]);
  assert.equal(byId.free.href, "/chat");

  assert.equal(byId.pack.amount, "19");
  assert.equal(byId.pack.period, "/ one-time");
  assert.equal(byId.pack.tagline, "More intelligence, when you need it.");
  assert.deepEqual(byId.pack.features.map((f) => f.text), [
    "25 questions",
    "One-time purchase",
    "Valid for 30 days",
    "No recurring subscription",
  ]);

  assert.equal(byId.daily.amount, "49");
  assert.equal(byId.daily.period, "/ month");
  assert.equal(byId.daily.tagline, "Your everyday intelligence companion.");
  assert.deepEqual(byId.daily.features.map((f) => f.text), [
    "50 questions every day",
    "Conversation history across devices",
    "Longer AI responses",
    "GST invoice",
  ]);

  assert.equal(byId.yearly.amount, "399");
  assert.equal(byId.yearly.period, "/ year");
  assert.equal(byId.yearly.tagline, "The complete ANVIK experience.");
  assert.deepEqual(byId.yearly.features.map((f) => f.text), [
    "Everything included in Daily",
    "50 questions every day",
    "Cross-device conversation history",
    "Longer responses",
    "GST invoice",
    "Full-year access",
    "Approximately ₹33/month",
    "Save 32% vs 12 monthly payments",
  ]);
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
  assert.match(markup, /Billed monthly/);
  assert.match(markup, /₹/);
  assert.match(markup, /399/);
  assert.match(markup, /33\/month/);
  assert.match(markup, /Save 32%/);
  assert.match(markup, /per year/i);
});

test("paid plans are honest about not being live — nothing presents as charged, booked or confirmed", () => {
  const markup = render(React.createElement(PricingPlans));
  // Paid CTAs cannot be links to a payment flow — they must be buttons.
  assert.match(markup, /<button[^>]*Get Pack[^>]*>/);
  assert.match(markup, /<button[^>]*Choose Daily[^>]*>/);
  assert.match(markup, /<button[^>]*Get Yearly[^>]*>/);
  // Every paid card carries an in-card honesty chip.
  assert.equal(markup.match(/Coming soon/g)?.length, 3);
  // No charge-sounding language or fabricated receipt/invoice claims.
  assert.doesNotMatch(markup, /charged|charged you|checkout|subscribe now|payment successful|invoice issued/i);
});

test("the free CTA is a working link to chat — and the whole page never fabricates a live payment", () => {
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

test("the honest status region is present and empty — no plan claims anything is live", () => {
  const markup = render(React.createElement(PricingPlans));
  assert.match(markup, /role="status"/);
  assert.doesNotMatch(markup, /Nothing will be charged/); // stated only after a paid CTA is pressed, not pre-claimed
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
  assert.match(markup, /Payments are not live yet/); // footer honesty
  assert.doesNotMatch(markup, /Gemini/);
  assert.doesNotMatch(markup, EMOJI_RE);
  assert.doesNotMatch(markup, /stars\.infinity|starlight|202[0-9](?!\d)/);
});
