"use client";

import { Download } from "lucide-react";
import type { ReactNode } from "react";
import { lux } from "@/lib/luxury-styles";
import { cn } from "@/lib/utils";

export function SearchResultsHeader({
  count,
  countLabel,
  hasSearched,
  idleTitle,
  exportButton,
  trailingActions,
  leadingActions,
  className,
}: {
  count: number;
  countLabel: string;
  hasSearched: boolean;
  idleTitle: string;
  exportButton?: { onClick: () => void; disabled?: boolean; label?: string };
  trailingActions?: ReactNode;
  leadingActions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {leadingActions}
          <h2 className="text-base font-bold text-[var(--text-primary)]">
            {hasSearched ? (
              <>
                {count.toLocaleString("el-GR")} {countLabel}
              </>
            ) : (
              idleTitle
            )}
          </h2>
        </div>
        {exportButton || trailingActions ? (
          <div className="flex items-center gap-2">
            {trailingActions}
            {exportButton ? (
              <button
                type="button"
                className={cn(lux.btnSecondary, "!h-9 !min-h-9 !rounded-lg !px-3 !py-0 text-xs")}
                onClick={exportButton.onClick}
                disabled={exportButton.disabled}
              >
                <Download className="h-3.5 w-3.5" aria-hidden />
                {exportButton.label ?? "Εξαγωγή"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="mt-3 h-px bg-[var(--border)]" aria-hidden />
    </div>
  );
}
