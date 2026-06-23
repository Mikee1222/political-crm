"use client";

import clsx from "clsx";
import { Moon, Sun } from "lucide-react";
import { applyCrmTheme, useCrmTheme } from "@/components/theme-provider";
import { fetchWithTimeout, CLIENT_FETCH_TIMEOUT_MS } from "@/lib/client-fetch";

type ModeToggleProps = {
  /** Icon-only 32×32 for mobile header toolbar */
  compact?: boolean;
  className?: string;
};

export function ModeToggle({ compact = false, className }: ModeToggleProps) {
  const { theme } = useCrmTheme();
  const dark = theme === "dark";
  const next = dark ? "light" : "dark";
  const label = dark ? "Ανοιχτό θέμα" : "Σκοτεινό θέμα";

  return (
    <button
      type="button"
      onClick={() => {
        applyCrmTheme(next);
        void fetchWithTimeout("/api/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ theme: next }),
          timeoutMs: CLIENT_FETCH_TIMEOUT_MS,
          credentials: "same-origin",
        }).catch(() => {
          /* ignore */
        });
      }}
      className={clsx(
        compact
          ? "hq-press-mobile inline-flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/60 text-[var(--accent-gold-light)] transition hover:text-[var(--accent-gold)]"
          : "rounded-md border border-[var(--border)] px-3 py-2 text-sm text-foreground",
        className,
      )}
      title={label}
      aria-label={label}
    >
      {dark ? <Sun className="h-4 w-4" strokeWidth={2} /> : <Moon className="h-4 w-4" strokeWidth={2} />}
    </button>
  );
}
