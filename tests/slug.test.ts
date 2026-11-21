import test from "node:test";
import assert from "node:assert/strict";
import { slugify, transliterate } from "../lib/transliterate";

test("Devanagari transliterates to readable ASCII", () => {
  assert.equal(transliterate("किसान सम्मान निधि"), "kisan samman nidhi");
});

test("matras and anusvara survive", () => {
  assert.equal(transliterate("क्रेडिट स्कोर"), "kredit skor");
});

test("slugs are lowercase ASCII, dash-separated, bounded", () => {
  const s = slugify("GST नोटिस आया है, क्या करूं?");
  assert.match(s, /^[a-z0-9-]+$/);
  assert.ok(s.length <= 60);
});

test("latin text passes through with punctuation folded", () => {
  assert.equal(slugify("How do I improve my credit score?"), "how-do-i-improve-my-credit-score");
});
