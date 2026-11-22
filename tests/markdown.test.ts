import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "../components/anvik/markdown";

function render(text: string) {
  return renderToStaticMarkup(React.createElement(Markdown, { text }));
}

test("renders Markdown emphasis, lists, tables, and inline and block math", () => {
  const markup = render(
    [
      "## Refractive index",
      "",
      "**Definition:** the ratio of light speeds.",
      "",
      "The formula is $n = \\frac{c}{v}$ and light speed is $3 \\times 10^8$.",
      "",
      "$$",
      "n = \\frac{c}{v}",
      "$$",
      "",
      "- Vacuum: 1",
      "- Water: 1.33",
      "",
      "| Medium | Index |",
      "| --- | ---: |",
      "| Water | 1.33 |",
    ].join("\n"),
  );

  assert.match(markup, /<h2>Refractive index<\/h2>/);
  assert.match(markup, /<strong>Definition:<\/strong>/);
  assert.match(markup, /class="katex-display"/);
  assert.match(markup, /class="mfrac"/);
  assert.match(markup, /<ul class="md-ul">/);
  assert.match(markup, /<table class="md-table">/);
  assert.doesNotMatch(markup, /<code[^>]*>[^<]*\\frac/);
});

test("renders fenced code with syntax colors and a Copy button", () => {
  const markup = render("```python\ndef add(a, b):\n    return a + b\n```");

  assert.match(markup, /overflow-hidden/);
  assert.match(markup, /class="tok-kw"/);
  assert.match(markup, />Copy<\/button>/);
  assert.match(markup, /tok-fn\">add<\/span>\(a, b\):/);
});

test("a complete comparison table keeps every row and cell", () => {
  const text = [
    "## Comparison of laptops",
    "",
    "| Laptop | CPU | GPU | RAM |",
    "| --- | --- | --- | --- |",
    "| MacBook Air 2026 | M5 | Apple | 16GB |",
    "| Dell Inspiron | Core Ultra | RTX 5060 | 32GB |",
    "| Lenovo Yoga | Ryzen 9 | Radeon | 16GB |",
    "| ThinkPad T14 | Core i7 | Iris | 32GB |",
  ].join("\n");
  const markup = render(text);
  assert.match(markup, /<table class="md-table">/);
  assert.match(markup, /<th>Laptop<\/th>/);
  assert.match(markup, /<th>GPU<\/th>/);
  assert.match(markup, /MacBook Air 2026/);
  assert.match(markup, /Dell Inspiron/);
  assert.match(markup, /Lenovo Yoga/);
  assert.match(markup, /ThinkPad T14/);
  // Every data row is present — the table is never truncated at render time.
  assert.equal((markup.match(/<tr>/g) ?? []).length, 5);
});
