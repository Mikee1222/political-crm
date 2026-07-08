"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Single dismissible summary chip above search results.
 * Clears all filters when × is clicked (separate from RestoredSearchBanner).
 */
export function ActiveFilterSummaryChip({
  label,
  onClear,
  className,
}: {
  label: string;
  onClear: () => void;
  className?: string;
}) {
  if (!label.trim()) return null;

  return (
    <div className={cn("mb-3 flex flex-wrap items-center gap-2", className)}>
      <span
        className="inline-flex max-w-full items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--accent-gold)_42%,var(--border))] bg-[color-mix(in_srgb,var(--accent-gold)_12%,var(--bg-elevated))] py-1 pl-2.5 pr-1 text-xs font-medium text-[var(--text-primary)]"
      >
        <span className="truncate font-semibold text-[var(--accent-gold)]">{label}</span>
        <button
          type="button"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--accent-gold)]/70 transition-colors hover:bg-[var(--bg-card)] hover:text-[var(--accent-gold)]"
          onClick={onClear}
          aria-label="Καθαρισμός όλων των φίλτρων"
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      </span>
    </div>
  );
}
