/**
 * Appearance is a first-paint concern, not a React concern.
 *
 * The theme is stored in localStorage, which the server cannot read. Rendering
 * the default (dark) and correcting it in an effect causes a flash of the wrong
 * theme — the P0 finding in the frontend audit. `THEME_INIT_SCRIPT` runs in the
 * document head, before the body paints, and applies the stored choice to the
 * root element. `AppearanceProvider` then mirrors that decision in React state.
 */

export type AppearanceMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const APPEARANCE_STORAGE_KEY = "anvik-appearance";
export const DEFAULT_APPEARANCE: AppearanceMode = "dark";

export const THEME_COLOR: Record<ResolvedTheme, string> = {
  dark: "#07080c",
  light: "#f7f7f5",
};

export function isAppearanceMode(value: unknown): value is AppearanceMode {
  return value === "light" || value === "dark" || value === "system";
}

/** Resolve an explicit choice, or ask the OS when the choice is "system". */
export function resolveTheme(appearance: AppearanceMode, prefersDark: boolean): ResolvedTheme {
  if (appearance === "system") return prefersDark ? "dark" : "light";
  return appearance;
}

/** Read the saved appearance without throwing when storage is unavailable. */
export function readStoredAppearance(
  storage?: Pick<Storage, "getItem"> | null,
): AppearanceMode {
  try {
    const target = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
    const stored = target?.getItem(APPEARANCE_STORAGE_KEY);
    return isAppearanceMode(stored) ? stored : DEFAULT_APPEARANCE;
  } catch {
    // Private browsing and blocked storage must not break the page.
    return DEFAULT_APPEARANCE;
  }
}

/**
 * Synchronous, dependency-free script injected into <head>.
 *
 * Keep this string small: it runs before every other byte of the app and it is
 * the only thing standing between a returning light-theme user and a dark
 * flash. It deliberately mirrors `resolveTheme` and `readStoredAppearance`
 * rather than importing them, because this code has to be inline.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var k=${JSON.stringify(APPEARANCE_STORAGE_KEY)};var s=window.localStorage.getItem(k);var m=s==="light"||s==="dark"||s==="system"?s:"dark";var d=!!window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches;var t=m==="system"?(d?"dark":"light"):m;var r=document.documentElement;r.dataset.appearance=m;r.dataset.theme=t;r.style.colorScheme=t;var meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute("content",t==="dark"?"${THEME_COLOR.dark}":"${THEME_COLOR.light}");}catch(e){var h=document.documentElement;h.dataset.appearance="dark";h.dataset.theme="dark";h.style.colorScheme="dark";}})();`;
