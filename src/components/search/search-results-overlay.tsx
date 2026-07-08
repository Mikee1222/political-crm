"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Keep previous results visible while a new fetch runs.
 * After ~500ms, shows the Greek «Αναζήτηση...» indicator.
 */
export function SearchResultsOverlay({
  active,
  slow,
  className,
  children,
}: {
  active: boolean;
  /** True when the in-flight fetch has already taken >500ms. */
  slow?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("relative min-h-0", className)}>
      <div
        className={cn(
          "min-h-0 transition-[opacity,filter] duration-150",
          active && "pointer-events-none opacity-55",
        )}
        aria-busy={active || undefined}
      >
        {children}
      </div>
      {active ? (
        <div
          className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center bg-[color-mix(in_srgb,var(--bg-primary)_35%,transparent)] pt-16 backdrop-blur-[1px]"
          role="status"
          aria-live="polite"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] shadow-[var(--card-shadow)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent-gold)]" aria-hidden />
            {slow ? "Αναζήτηση..." : "Φόρτωση..."}
          </div>
        </div>
      ) : null}
    </div>
  );
}
