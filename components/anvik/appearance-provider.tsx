"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type AppearanceMode = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";
type AppearanceContextValue = {
  appearance: AppearanceMode;
  resolvedTheme: ResolvedTheme;
  setAppearance: (mode: AppearanceMode) => void;
};

const STORAGE_KEY = "anvik-appearance";
const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearanceState] = useState<AppearanceMode>("dark");
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>("dark");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "light" || stored === "dark" || stored === "system") setAppearanceState(stored);
    } catch {
      // Private browsing can disable localStorage; this session still works.
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemTheme(media.matches ? "dark" : "light");
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const resolvedTheme: ResolvedTheme = appearance === "system" ? systemTheme : appearance;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.appearance = appearance;
    root.dataset.theme = resolvedTheme;
    root.style.colorScheme = resolvedTheme;
    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (themeColor) themeColor.content = resolvedTheme === "dark" ? "#07080c" : "#f7f7f5";
  }, [appearance, resolvedTheme]);

  const setAppearance = useCallback((mode: AppearanceMode) => {
    setAppearanceState(mode);
    try { localStorage.setItem(STORAGE_KEY, mode); } catch {
      // Appearance remains active for this session when storage is unavailable.
    }
  }, []);

  const value = useMemo(() => ({ appearance, resolvedTheme, setAppearance }), [appearance, resolvedTheme, setAppearance]);
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error("useAppearance must be used inside AppearanceProvider");
  return value;
}
