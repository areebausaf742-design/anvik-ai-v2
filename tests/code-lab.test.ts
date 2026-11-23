import assert from "node:assert/strict";
import test from "node:test";
import {
  CODE_LAB_LANGUAGES,
  extractCodeBlock,
  getCodeFenceLanguage,
  normalizeCodeLanguage,
} from "../lib/code-lab";

const fence = String.fromCharCode(96).repeat(3);
const lines = (...items: string[]) => items.join(String.fromCharCode(10));

test("Java is supported and uses the java fence", () => {
  assert.ok(CODE_LAB_LANGUAGES.includes("Java"));
  assert.equal(getCodeFenceLanguage("Java"), "java");
});

test("normalizes common fence aliases", () => {
  assert.equal(normalizeCodeLanguage("js"), "javascript");
  assert.equal(normalizeCodeLanguage("jsx"), "javascript");
  assert.equal(normalizeCodeLanguage("ts"), "typescript");
  assert.equal(normalizeCodeLanguage("py"), "python");
  assert.equal(getCodeFenceLanguage("HTML/CSS"), "html");
});

test("selects Java even when an HTML block appears first", () => {
  const result = extractCodeBlock(
    lines(fence + "html", "<div>wrong block</div>", fence, "", fence + "java", "public class Main {}", fence),
    "Java",
  );
  assert.equal(result.matchesExpected, true);
  assert.equal(result.lang, "java");
  assert.equal(result.code, "public class Main {}");
});

test("does not treat an HTML block as Java", () => {
  const result = extractCodeBlock(lines(fence + "html", "<div>wrong</div>", fence), "Java");
  assert.equal(result.matchesExpected, false);
  assert.equal(result.lang, "html");
});

test("supports an incomplete matching block while the stream is arriving", () => {
  const result = extractCodeBlock(lines(fence + "java", "public class Main {"), "Java");
  assert.equal(result.matchesExpected, true);
  assert.equal(result.code, "public class Main {");
});

test("returns a mismatch for output without a code fence", () => {
  const result = extractCodeBlock("Here is a calculator.", "Java");
  assert.equal(result.matchesExpected, false);
  assert.equal(result.lang, "");
  assert.equal(result.code, "Here is a calculator.");
});

test("keeps JavaScript containing HTML strings classified as JavaScript", () => {
  const result = extractCodeBlock(
    lines(fence + "javascript", "const html = '<div>Hello</div>'; ", fence),
    "JavaScript",
  );
  assert.equal(result.matchesExpected, true);
  assert.equal(result.lang, "javascript");
});
