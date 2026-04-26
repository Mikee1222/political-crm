"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

/** Sun in Σκοτεινό (switch to Ανοιχτό); moon in Ανοιχτό (switch to Σκοτεινό). */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <span
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--accent-gold-light)]/50 bg-[var(--bg-elevated)]/40"
        aria-hidden
      />
    );
  }

  const isDark = resolvedTheme === "dark";
  const next = isDark ? "light" : "dark";
  const label = isDark ? "Ανοιχτό θέμα" : "Σκοτεινό θέμα";

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--accent-gold-light)] bg-[var(--bg-elevated)]/60 text-[var(--accent-gold-light)] shadow-sm transition hover:bg-[var(--bg-elevated)] hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-gold-light)]"
      title={label}
      aria-label={label}
    >
      {isDark ? <Sun className="h-4 w-4" strokeWidth={2} /> : <Moon className="h-4 w-4" strokeWidth={2} />}
    </button>
  );
}
