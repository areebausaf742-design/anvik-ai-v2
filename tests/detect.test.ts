import test from "node:test";
import assert from "node:assert/strict";
import { detectLanguage } from "../lib/detect";

test("Devanagari script routes to hi above the 30% threshold", () => {
  assert.equal(detectLanguage("क्रेडिट स्कोर कैसे बढ़ाएं?"), "hi");
});

test("Hinglish with Latin nouns stays hi because script ratio counts letters", () => {
  assert.equal(detectLanguage("मेरा CIBIL score कैसे बढ़ाएं"), "hi");
});

test("romanised Hindi with two distinct stopwords routes to hi-Latn", () => {
  assert.equal(detectLanguage("credit score kaise badhaye batao"), "hi-Latn");
});

test("a single stopword collision is not enough for hi-Latn", () => {
  assert.equal(detectLanguage("what is the kya brand of this table"), "en");
});

test("plain English routes to en", () => {
  assert.equal(detectLanguage("How do I link my Aadhaar with my PAN?"), "en");
});
