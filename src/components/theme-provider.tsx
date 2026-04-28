"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type CrmTheme = "light" | "dark";

export const CRM_THEME_STORAGE_KEY = "crm-theme";
export const THEME_CHANGE_EVENT = "theme-change";

export function readStoredTheme(): CrmTheme {
  if (typeof window === "undefined") return "dark";
  try {
    const raw = localStorage.getItem(CRM_THEME_STORAGE_KEY);
    return raw === "light" || raw === "dark" ? raw : "dark";
  } catch {
    return "dark";
  }
}

/** Persist, set `data-theme` on `<html>`, and dispatch `theme-change` (detail: `{ theme }`). */
export function applyCrmTheme(theme: CrmTheme) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CRM_THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
  document.documentElement.setAttribute("data-theme", theme);
  window.dispatchEvent(new CustomEvent<{ theme: CrmTheme }>(THEME_CHANGE_EVENT, { detail: { theme } }));
}

type ThemeContextValue = {
  theme: CrmTheme;
  setTheme: (t: CrmTheme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<CrmTheme>("dark");

  useLayoutEffect(() => {
    const t = readStoredTheme();
    document.documentElement.setAttribute("data-theme", t);
    setThemeState(t);
  }, []);

  useEffect(() => {
    const onThemeChange = (ev: Event) => {
      const ce = ev as CustomEvent<{ theme?: CrmTheme }>;
      const t = ce.detail?.theme;
      if (t === "light" || t === "dark") {
        setThemeState(t);
      }
    };
    window.addEventListener(THEME_CHANGE_EVENT, onThemeChange as EventListener);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, onThemeChange as EventListener);
  }, []);

  const setTheme = useCallback((t: CrmTheme) => {
    applyCrmTheme(t);
    setThemeState(t);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useCrmTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useCrmTheme must be used within ThemeProvider");
  }
  return ctx;
}
