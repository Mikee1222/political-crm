"use client";

import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { lux } from "@/lib/luxury-styles";
import { cn } from "@/lib/utils";

export function SearchFilterActions({
  onSearch,
  onClear,
  onClose,
  searchLabel = "Αναζήτηση",
  clearLabel = "Καθαρισμός",
  closeLabel = "Κλείσιμο",
  /** Mobile bottom-sheet: gold Εφαρμογή + Κλείσιμο, larger touch targets. */
  sheetMode = false,
  extraActions,
  className,
}: {
  onSearch: () => void;
  onClear: () => void;
  onClose?: () => void;
  searchLabel?: string;
  clearLabel?: string;
  closeLabel?: string;
  sheetMode?: boolean;
  extraActions?: ReactNode;
  className?: string;
}) {
  const primaryLabel = sheetMode ? "Εφαρμογή" : searchLabel;

  return (
    <div
      className={cn(
        "shrink-0 space-y-2 border-t border-[var(--border)] bg-[var(--bg-elevated)]/60 px-1 pt-3",
        sheetMode && "border-t-0 bg-transparent px-0 pt-0",
        className,
      )}
    >
      <button
        type="button"
        className={cn(
          lux.btnPrimary,
          "w-full !rounded-lg !py-0 text-sm",
          sheetMode ? "!h-12 !min-h-[48px]" : "!h-11",
        )}
        onClick={onSearch}
      >
        <Search className="h-4 w-4" aria-hidden />
        {primaryLabel}
      </button>
      {sheetMode && onClose ? (
        <button
          type="button"
          className={cn(lux.btnSecondary, "w-full !h-12 !min-h-[48px] !rounded-lg !py-0 text-sm")}
          onClick={onClose}
        >
          {closeLabel}
        </button>
      ) : null}
      <button
        type="button"
        className={cn(
          lux.btnSecondary,
          "w-full !rounded-lg !py-0 text-sm",
          sheetMode ? "!h-11 !min-h-[44px]" : "!h-10",
        )}
        onClick={onClear}
      >
        {clearLabel}
      </button>
      {extraActions}
    </div>
  );
}
