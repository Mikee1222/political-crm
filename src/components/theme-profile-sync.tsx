"use client";

import { useEffect } from "react";
import { useProfile } from "@/contexts/profile-context";
import { useCrmTheme } from "@/components/theme-provider";

/** Εφαρμόζει το θέμα από το profile μετά τη φόρτωση (server-side προτιμήσεις). */
export function ThemeProfileSync() {
  const { profile, loading } = useProfile();
  const { setTheme, theme } = useCrmTheme();

  useEffect(() => {
    if (loading) return;
    const t = profile?.theme;
    if (t === "light" || t === "dark") {
      setTheme(t);
    }
  }, [loading, profile?.theme, setTheme]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const color = theme === "light" ? "#f5f0e8" : "#050d1a";
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", color);
  }, [theme]);

  return null;
}
