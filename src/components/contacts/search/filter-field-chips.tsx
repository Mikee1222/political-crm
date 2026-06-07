"use client";

import { X } from "lucide-react";

export function FilterFieldChips({
  items,
  onRemove,
}: {
  items: { key: string; label: string; color?: string }[];
  onRemove: (key: string) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item.key}
          className="inline-flex max-w-full items-center gap-1 rounded-full py-1 pl-2.5 pr-1 text-[11px] font-medium text-white shadow-sm"
          style={{
            background: item.color ?? "var(--accent)",
          }}
        >
          <span className="truncate">{item.label}</span>
          <button
            type="button"
            className="rounded-full p-0.5 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
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
