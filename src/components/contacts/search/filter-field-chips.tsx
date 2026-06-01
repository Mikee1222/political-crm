"use client";

import { X } from "lucide-react";

export function FilterFieldChips({
  items,
  onRemove,
}: {
  items: { key: string; label: string }[];
  onRemove: (key: string) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item.key}
          className="inline-flex max-w-full items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--accent-gold)_42%,var(--border))] bg-[color-mix(in_srgb,var(--accent-gold)_10%,var(--bg-elevated))] py-0.5 pl-2.5 pr-1 text-[11px] font-medium text-[var(--text-primary)]"
        >
          <span className="truncate">{item.label}</span>
          <button
            type="button"
            className="rounded-full p-0.5 text-[var(--text-muted)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]"
            onClick={() => onRemove(item.key)}
            aria-label={`Αφαίρεση ${item.label}`}
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
        </span>
      ))}
    </div>
  );
}
