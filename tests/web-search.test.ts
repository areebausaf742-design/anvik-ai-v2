import test from "node:test";
import assert from "node:assert/strict";
import { shouldAutoSearch, normalizeSources, buildSearchFreshnessInstruction } from "../lib/search-grounding";
import { liveDateContext } from "../lib/prompts";

test("auto-search detects time-sensitive queries", () => {
  assert.equal(shouldAutoSearch("latest AI news today"), true);
  assert.equal(shouldAutoSearch("weather in Delhi"), true);
  assert.equal(shouldAutoSearch("who won the match"), true);
  assert.equal(shouldAutoSearch("price of bitcoin"), true);
});

test("auto-search skips pure coding prompts", () => {
  assert.equal(shouldAutoSearch("write a sorting function in python"), false);
});

test("date injection includes UTC and IST", () => {
  const instruction = buildSearchFreshnessInstruction();
  assert.match(instruction, /UTC/);
  assert.match(instruction, /IST/);
  const ctx = liveDateContext();
  assert.match(ctx, /Current date\/time/);
});

test("source extraction and deduplication", () => {
  const chunks = [
    { web: { title: "Example", uri: "https://example.com/a", domain: "example.com" } },
    { web: { title: "Example 2", uri: "https://www.example.com/a", domain: "example.com" } },
    { web: { title: "Other", uri: "https://other.com/b", domain: "other.com" } },
  ];
  const sources = normalizeSources(chunks);
  assert.equal(sources.length, 2);
});

test("fallback handling: normalizeSources empty", () => {
  const sources = normalizeSources([]);
  assert.deepEqual(sources, []);
});
