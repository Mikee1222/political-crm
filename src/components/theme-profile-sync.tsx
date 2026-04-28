"use client";

import { useEffect } from "react";
import { useProfile } from "@/contexts/profile-context";
import { useCrmTheme } from "@/components/theme-provider";

/** Εφαρμόζει το θέμα από το profile μετά τη φόρτωση (server-side προτιμήσεις). */
export function ThemeProfileSync() {
  const { profile, loading } = useProfile();
  const { setTheme } = useCrmTheme();

  useEffect(() => {
    if (loading) return;
    const t = profile?.theme;
    if (t === "light" || t === "dark") {
      setTheme(t);
    }
  }, [loading, profile?.theme, setTheme]);

  return null;
}
