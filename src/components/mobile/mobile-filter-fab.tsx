"use client";

import { Filter } from "lucide-react";
import { cn } from "@/lib/utils";

type MobileFilterFabProps = {
  onClick: () => void;
  label?: string;
  className?: string;
  /** Active filter count badge (gold). */
  badgeCount?: number;
};

/** Fixed filter toggle above bottom nav (mobile search pages). */
export function MobileFilterFab({
  onClick,
  label = "Φίλτρα",
  className,
  badgeCount,
}: MobileFilterFabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "crm-mobile-filter-fab hq-press-mobile fixed z-40 flex h-12 min-h-12 w-12 min-w-12 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[var(--card-shadow-hover)] lg:hidden",
        className,
      )}
      aria-label={badgeCount && badgeCount > 0 ? `${label} (${badgeCount})` : label}
      title={label}
    >
      <Filter className="h-5 w-5 shrink-0" aria-hidden />
      {badgeCount != null && badgeCount > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent-gold)] px-1 text-[10px] font-bold text-[#0a0f1a]">
          {badgeCount > 99 ? "99+" : badgeCount}
        </span>
      ) : null}
    </button>
  );
}
