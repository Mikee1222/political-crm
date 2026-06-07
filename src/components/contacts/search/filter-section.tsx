"use client";

import { ChevronDown, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function FilterSection({
  title,
  icon: Icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon?: LucideIcon;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className={cn(
        "rounded-xl border transition-colors duration-200",
        open
          ? "border-[color-mix(in_srgb,var(--accent)_28%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_4%,var(--bg-card))]"
          : "border-[var(--border)] bg-[var(--bg-card)]",
      )}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2">
          {Icon ? (
            <Icon
              className={cn(
                "h-4 w-4 shrink-0 transition-colors",
                open ? "text-[var(--accent)]" : "text-[var(--text-muted)]",
              )}
              aria-hidden
            />
          ) : null}
          <span
            className={cn(
              "text-sm font-bold transition-colors",
              open ? "text-[var(--accent)]" : "text-[var(--text-primary)]",
            )}
          >
            {title}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform duration-300",
            open && "rotate-180 text-[var(--accent)]",
          )}
          aria-hidden
        />
      </button>

      <div
        className={cn(
          "h-px bg-[var(--border)] transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0",
        )}
        aria-hidden
      />

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-in-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-3 px-3 pb-3 pt-3">{children}</div>
        </div>
      </div>
    </div>
  );
}
