"use client";

import { useTheme } from "next-themes";
import { useEffect } from "react";
import { useProfile } from "@/contexts/profile-context";

/** Εφαρμόζει το θέμα από το profile μετά τη φόρτωση (server-side προτιμήσεις). */
export function ThemeProfileSync() {
  const { profile, loading } = useProfile();
  const { setTheme } = useTheme();

  useEffect(() => {
    if (loading) return;
    const t = profile?.theme;
    if (t === "light" || t === "dark") {
      setTheme(t);
      try {
        localStorage.setItem("crm-theme", t);
      } catch {
        // ignore
      }
    }
  }, [loading, profile?.theme, setTheme]);

  return null;
}
