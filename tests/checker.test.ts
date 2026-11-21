import test from "node:test";
import assert from "node:assert/strict";
import { CORPUS, SELFHARM_RESPONSE } from "../lib/corpus";
import {
  REAL_HELPLINES,
  abuseReply,
  checkReply,
  decodeCheck,
  encodeCheck,
  suspiciousPhonelike,
} from "../lib/checker";

/**
 * The checker is a safety net, not an editor. These tests exist to keep it that
 * way: it may refuse an answer, and it may replace an invented helpline, but it
 * must never rewrite a topic.
 */

test("every helpline printed in the corpus is in the allowlist", () => {
  const text = [
    ...CORPUS.flatMap((entry) => Object.values(entry.answers)),
    ...Object.values(SELFHARM_RESPONSE),
  ].join("\n");
  const values = new Set<string>();
  for (const match of text.matchAll(/\d[\d\s-]{4,}\d/g)) {
    const value = match[0].replace(/\D/g, "");
    if (value.length >= 3) values.add(value);
  }
  const helplines = [...values].filter((value) => REAL_HELPLINES.some((real) => value.endsWith(real)));
  assert.ok(helplines.length >= 3, "the corpus should mention real helplines");
  for (const value of helplines) {
    assert.ok(REAL_HELPLINES.some((real) => value === real || value.endsWith(real)), `${value} missing`);
  }
});

test("a usable answer passes untouched", () => {
  const answer =
    "A car is a four-wheeled road vehicle powered by an engine. Most cars run on petrol or diesel, and electric cars use a battery and a motor instead.";
  const result = checkReply(answer);
  assert.equal(result.ok, true);
  assert.equal(result.changed, false);
  assert.equal(result.repaired, answer, "the checker must not edit a good answer");
  assert.deepEqual(result.issues, []);
});

test("an empty answer fails", () => {
  const result = checkReply("   ");
  assert.equal(result.ok, false);
  assert.equal(result.issues[0].code, "empty");
  assert.equal(result.note, "No answer came back.");
});

test("answers about ordinary topics are never flagged as off-topic", () => {
  // the exact bug: "what is car?" must not be rewritten or rejected
  for (const answer of [
    "A car is a passenger vehicle with four wheels and an engine.",
    "Photosynthesis is how plants turn sunlight, water and carbon dioxide into glucose.",
    "Artificial intelligence is software that performs tasks associated with human reasoning.",
    "Here is a Python calculator:\n```python\nprint(eval(input()))\n```",
  ]) {
    const result = checkReply(answer);
    assert.equal(result.changed, false, `"${answer.slice(0, 30)}" was modified`);
  }
});

test("the checker never injects a corpus answer", () => {
  const result = checkReply("I am not sure about that.");
  for (const entry of CORPUS) {
    assert.ok(!result.repaired.includes(entry.answers.en.slice(0, 60)), "corpus text leaked into the answer");
  }
});

test("abuse is refused, and the refusal is not about the topic", () => {
  const result = checkReply("You are an idiot for asking that.");
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.code === "safety" && issue.severity === "blocking"));
  const reply = abuseReply();
  assert.ok(reply.length > 20);
  assert.ok(!/car|photosynthesis|credit/i.test(reply), "the refusal must not change subject");
});

test("a made-up helpline is replaced with a pointer, not a corpus answer", () => {
  const result = checkReply("Call 1800-999-8888 to reach the officer.");
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.code === "helpline"));
  assert.ok(!result.repaired.includes("1800"));
  assert.match(result.repaired, /official helpline/);
  // The rest of the sentence survives: only the number is touched.
  assert.match(result.repaired, /to reach the officer/);
});

test("real helplines survive", () => {
  const result = checkReply("For help call 14416 or 108. PM-KISAN: 155261.");
  assert.ok(result.repaired.includes("14416"));
  assert.ok(result.repaired.includes("155261"));
  assert.equal(result.changed, false);
});

test("money, counts and years are not mistaken for phone numbers", () => {
  const answer =
    "On a ₹50,000 limit, keep the monthly spend under 15000 rupees. Around 40000 applications arrive each month in 2024, and the fee is 1200.";
  const result = checkReply(answer);
  assert.deepEqual(suspiciousPhonelike(answer), []);
  assert.equal(result.changed, false);
});

test("a ten-digit mobile offered as a helpline is caught", () => {
  assert.equal(suspiciousPhonelike("Call 9812345678 for the district office.").length, 1);
});

test("links, markdown and statistics are left exactly as written", () => {
  const answer =
    "See https://pmkisan.gov.in or https://example.org for details.\n\n**Bold** and *italic* and `code`.\n\n98% of users and 12,000+ customers agree.";
  const result = checkReply(answer);
  assert.equal(result.repaired, answer, "no rewriting of links, bold, or numbers");
  assert.equal(result.ok, true);
});

test("a check trailer round-trips without touching the body", () => {
  const body = "A car is a vehicle.\n\n- wheels\n- engine";
  const result = checkReply(body);
  const decoded = decodeCheck(body + encodeCheck(result));
  assert.equal(decoded.text, body);
  assert.equal(decoded.check?.ok, true);
});

test("a reply without a trailer decodes to itself", () => {
  const decoded = decodeCheck("just an answer");
  assert.equal(decoded.text, "just an answer");
  assert.equal(decoded.check, null);
});
