"use client";

import { cn } from "@/lib/utils";

type Option<T extends string> = { value: T; label: string };

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  size = "sm",
}: {
  options: readonly Option<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      className={cn(
        "flex w-full rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-elevated)_80%,transparent)] p-0.5",
        className,
      )}
      role="radiogroup"
    >
      {options.map((o) => {
        const selected = value === o.value;
        return (
          <button
            key={o.value || "__any"}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex-1 rounded-md font-medium transition-all duration-200",
              size === "sm" ? "px-2 py-2 text-[11px] leading-tight" : "px-3 py-2.5 text-xs",
              selected
                ? "bg-[var(--accent)] text-white shadow-sm"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
