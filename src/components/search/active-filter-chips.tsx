"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type FilterChip = { key: string; label: string };

export function ActiveFilterChips({
  chips,
  onDismiss,
  onClearAll,
  className,
  /** Horizontal scroll on narrow screens (search pages). */
  scrollOnMobile = false,
}: {
  chips: FilterChip[];
  onDismiss: (key: string) => void;
  onClearAll?: () => void;
  className?: string;
  scrollOnMobile?: boolean;
}) {
  if (!chips.length) return null;

  return (
    <div
      className={cn(
        "mb-4 flex items-center gap-2",
        scrollOnMobile ? "crm-filter-chips-row mb-3 flex-nowrap" : "flex-wrap",
        className,
      )}
    >
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex max-w-full items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--accent)_35%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_12%,var(--bg-elevated))] py-1.5 pl-2.5 pr-1 text-xs font-medium text-[var(--text-primary)]"
        >
          <span className="truncate">{chip.label}</span>
          <button
            type="button"
            className="inline-flex h-8 w-8 min-h-[32px] min-w-[32px] shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)] active:bg-[var(--bg-card)]"
            onClick={() => onDismiss(chip.key)}
            aria-label={`Αφαίρεση ${chip.label}`}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </span>
      ))}
      {onClearAll ? (
        <button
          type="button"
          onClick={onClearAll}
          className="shrink-0 whitespace-nowrap px-1 text-xs font-semibold text-[var(--accent)] transition-colors hover:text-[var(--accent-gold-light)] hover:underline"
        >
          Καθαρισμός όλων
        </button>
      ) : null}
    </div>
  );
}
