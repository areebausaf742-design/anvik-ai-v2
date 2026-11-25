"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  APPEARANCE_STORAGE_KEY,
  THEME_COLOR,
  readStoredAppearance,
  resolveTheme,
  type AppearanceMode,
  type ResolvedTheme,
} from "@/lib/theme";

export type { AppearanceMode } from "@/lib/theme";

type AppearanceContextValue = {
  appearance: AppearanceMode;
  resolvedTheme: ResolvedTheme;
  setAppearance: (mode: AppearanceMode) => void;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  // The first render must match the server (dark). The inline script in
  // app/layout.tsx has already painted the stored theme, and the effect below
  // mirrors that choice into React state without a second flash.
  const [appearance, setAppearanceState] = useState<AppearanceMode>("dark");
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>("dark");
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    setAppearanceState(readStoredAppearance());

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemTheme(media.matches ? "dark" : "light");
    update();
    media.addEventListener("change", update);
    setSynced(true);
    return () => media.removeEventListener("change", update);
  }, []);

  const resolvedTheme: ResolvedTheme = resolveTheme(appearance, systemTheme === "dark");

  useEffect(() => {
    // The head script already painted the stored theme. Writing the default
    // state here before the storage read lands would undo that fix and flash
    // dark for light-theme visitors, so wait for the sync above.
    if (!synced) return;
    const root = document.documentElement;
    root.dataset.appearance = appearance;
    root.dataset.theme = resolvedTheme;
    root.style.colorScheme = resolvedTheme;
    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (themeColor) themeColor.content = THEME_COLOR[resolvedTheme];
  }, [synced, appearance, resolvedTheme]);

  const setAppearance = useCallback((mode: AppearanceMode) => {
    setAppearanceState(mode);
    try {
      localStorage.setItem(APPEARANCE_STORAGE_KEY, mode);
    } catch {
      // Appearance remains active for this session when storage is unavailable.
    }
  }, []);

  const value = useMemo(
    () => ({ appearance, resolvedTheme, setAppearance }),
    [appearance, resolvedTheme, setAppearance],
  );
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error("useAppearance must be used inside AppearanceProvider");
  return value;
}
