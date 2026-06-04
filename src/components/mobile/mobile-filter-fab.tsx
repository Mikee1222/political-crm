"use client";

import { Filter } from "lucide-react";
import { cn } from "@/lib/utils";

type MobileFilterFabProps = {
  onClick: () => void;
  label?: string;
  className?: string;
};

/** Fixed filter toggle above bottom nav (mobile search pages). */
export function MobileFilterFab({ onClick, label = "Φίλτρα", className }: MobileFilterFabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "crm-mobile-filter-fab hq-press-mobile fixed z-40 flex h-12 min-h-12 w-12 min-w-12 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[var(--card-shadow-hover)] lg:hidden",
        className,
      )}
      aria-label={label}
      title={label}
    >
      <Filter className="h-5 w-5 shrink-0" aria-hidden />
    </button>
  );
}
