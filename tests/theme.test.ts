import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Theme flash regression tests (audit P0).
 *
 * The stored appearance lives in localStorage, so the server always renders
 * dark. The fix is a synchronous head script; these tests pin the script's
 * contract and the layout wiring that makes it run before the body paints.
 */

test("resolveTheme respects an explicit choice and follows the OS for system", async () => {
  const { resolveTheme } = await import("../lib/theme");
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
});

test("stored appearance accepts only the three real modes", async () => {
  const { APPEARANCE_STORAGE_KEY, readStoredAppearance } = await import("../lib/theme");
  const storage = (value: string | null) => ({
    getItem: (key: string) => (key === APPEARANCE_STORAGE_KEY ? value : null),
  });

  assert.equal(readStoredAppearance(storage("light")), "light");
  assert.equal(readStoredAppearance(storage("dark")), "dark");
  assert.equal(readStoredAppearance(storage("system")), "system");
  assert.equal(readStoredAppearance(storage("sepia")), "dark", "unknown values fall back to the product default");
  assert.equal(readStoredAppearance(storage(null)), "dark");
  assert.equal(readStoredAppearance(null), "dark", "unavailable storage never throws");
});

test("the pre-paint script reads the same key and sets both root datasets", async () => {
  const { APPEARANCE_STORAGE_KEY, THEME_INIT_SCRIPT } = await import("../lib/theme");
  assert.match(THEME_INIT_SCRIPT, new RegExp(APPEARANCE_STORAGE_KEY));
  assert.match(THEME_INIT_SCRIPT, /dataset\.appearance/);
  assert.match(THEME_INIT_SCRIPT, /dataset\.theme/);
  assert.match(THEME_INIT_SCRIPT, /prefers-color-scheme: dark/);
  assert.match(THEME_INIT_SCRIPT, /colorScheme/);
  assert.match(THEME_INIT_SCRIPT, /theme-color/);
});

test("the root layout runs the theme script in the head, before the body", () => {
  const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /THEME_INIT_SCRIPT/);
  assert.match(layout, /suppressHydrationWarning/);
  assert.match(layout, /<script[^>]*dangerouslySetInnerHTML/);

  const scriptAt = layout.indexOf("THEME_INIT_SCRIPT");
  const bodyAt = layout.indexOf("<body");
  assert.ok(scriptAt >= 0 && bodyAt > scriptAt, "the inline script must precede the body");
});

test("the provider waits for the storage read before touching the root theme", () => {
  const provider = readFileSync(
    new URL("../components/anvik/appearance-provider.tsx", import.meta.url),
    "utf8",
  );
  assert.match(provider, /if \(!synced\) return;/, "the default state must not repaint the root");
  assert.match(provider, /readStoredAppearance\(\)/);
  assert.match(provider, /dataset\.theme = resolvedTheme/);
});
