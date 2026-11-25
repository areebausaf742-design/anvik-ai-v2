import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Model selector keyboard regression test (audit P1).
 *
 * The menu used to derive the next option from the selected value on every
 * keypress, so holding ArrowDown bounced between two items. Navigation must be
 * relative to the focused item, and the menu must open on the selected one.
 */

const source = readFileSync(
  new URL("../components/anvik/model-selector.tsx", import.meta.url),
  "utf8",
);

test("the model menu moves focus relative to the focused item", () => {
  const handler = source.match(/function handleMenuKeyDown[\s\S]*?\n  \}/)?.[0] ?? "";
  assert.ok(handler, "the menu key handler should exist");
  assert.match(handler, /wrapIndex\(focusedIndex, 1/);
  assert.match(handler, /wrapIndex\(focusedIndex, -1/);
  assert.doesNotMatch(
    handler,
    /findIndex\(\(item\) => item\.id === value\)/,
    "navigation must not restart from the selected value",
  );
});

test("the menu opens on the selected option and roves tabindex", () => {
  assert.match(source, /function openMenu\(index = selectedIndex\)/);
  assert.match(source, /tabIndex=\{index === focusedIndex \? 0 : -1\}/);
  assert.match(source, /aria-checked=\{active\}/);
  assert.match(source, /event\.key === "Escape"[\s\S]*?triggerRef\.current\?\.focus\(\)/);
});
