"use client";

import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { lux } from "@/lib/luxury-styles";
import { cn } from "@/lib/utils";

export function SearchFilterActions({
  onSearch,
  onClear,
  searchLabel = "Αναζήτηση",
  clearLabel = "Καθαρισμός",
  extraActions,
  className,
}: {
  onSearch: () => void;
  onClear: () => void;
  searchLabel?: string;
  clearLabel?: string;
  extraActions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("shrink-0 space-y-2 border-t border-[var(--border)] bg-[var(--bg-elevated)]/60 px-1 pt-3", className)}>
      <button
        type="button"
        className={cn(lux.btnPrimary, "w-full !h-11 !rounded-lg !py-0 text-sm")}
        onClick={onSearch}
      >
        <Search className="h-4 w-4" aria-hidden />
        {searchLabel}
      </button>
      <button type="button" className={cn(lux.btnSecondary, "w-full !h-10 !rounded-lg !py-0 text-sm")} onClick={onClear}>
        {clearLabel}
      </button>
      {extraActions}
    </div>
  );
}
