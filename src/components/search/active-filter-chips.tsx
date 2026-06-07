"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type FilterChip = { key: string; label: string };

export function ActiveFilterChips({
  chips,
  onDismiss,
  onClearAll,
  className,
}: {
  chips: FilterChip[];
  onDismiss: (key: string) => void;
  onClearAll?: () => void;
  className?: string;
}) {
  if (!chips.length) return null;

  return (
    <div className={cn("mb-4 flex flex-wrap items-center gap-2", className)}>
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex max-w-full items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--accent)_35%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_12%,var(--bg-elevated))] py-1 pl-2.5 pr-1 text-xs font-medium text-[var(--text-primary)]"
        >
          <span className="truncate">{chip.label}</span>
          <button
            type="button"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]"
            onClick={() => onDismiss(chip.key)}
            aria-label={`Αφαίρεση ${chip.label}`}
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
        </span>
      ))}
      {onClearAll ? (
        <button
          type="button"
          onClick={onClearAll}
          className="text-xs font-semibold text-[var(--accent)] transition-colors hover:text-[var(--accent-gold-light)] hover:underline"
        >
          Καθαρισμός όλων
        </button>
      ) : null}
    </div>
  );
}
