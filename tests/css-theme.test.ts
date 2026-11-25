import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Theme CSS regression tests (audit P1).
 *
 * The dark theme was a pile of `!important` declarations that fought Tailwind
 * and each other, with one duplicated block. The cascade now uses unlayered
 * theme rules plus semantic tokens; `!important` is reserved for reduced
 * motion, the ambient canvas and pointer-events.
 */

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("theme colours are expressed as semantic tokens", () => {
  for (const token of [
    "--theme-bg",
    "--theme-surface",
    "--theme-surface-muted",
    "--theme-border",
    "--theme-text",
    "--theme-text-secondary",
    "--theme-text-muted",
  ]) {
    assert.match(css, new RegExp(token + ":"), `${token} should be defined`);
  }
});

test("no colour, background or border declaration needs !important", () => {
  const offenders = css
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes("!important"))
    .filter((line) => /^(color|background|background-color|border|border-color|box-shadow|outline|text-shadow)\b/.test(line));

  assert.deepEqual(offenders, [], "theme colours should win through the cascade, not !important");
});

test("the duplicated dark surface block is gone", () => {
  const matches = css.match(/html\[data-theme="dark"\] :where\(\[class\*="bg-\[#F7F7F5\]"\]/g) ?? [];
  assert.equal(matches.length, 1, "the repeated bg-[#F7F7F5] override was collapsed into one rule");
});

test("broad token overrides cannot outrank component styling", () => {
  assert.match(
    css,
    /html\[data-theme="dark"\] :where\(\[class\*="text-\[#1A1A1A\]"\]\)/,
    "generic text remaps use zero-specificity :where()",
  );
  assert.match(
    css,
    /html\[data-theme="dark"\] :where\(\[class\*="bg-white"\]\)/,
    "generic surface remaps use zero-specificity :where()",
  );
  assert.doesNotMatch(
    css,
    /html\[data-theme="dark"\] \[class\*="text-\[#1A1A1A\]"\]/,
    "a bare attribute selector would beat .anvik-dark component rules",
  );
});

test("hover-only controls also appear for keyboard and touch users", () => {
  assert.match(css, /\.chat-item:focus-within \.chat-actions/);
  assert.match(css, /\.msg-row:focus-within \.msg-toolbar/);
  assert.match(css, /@media \(hover: none\) \{[\s\S]*?\.chat-item \.chat-actions/);
  assert.match(css, /@media \(hover: none\) \{[\s\S]*?\.msg-toolbar/);
});
