"use client";

import { lux } from "@/lib/luxury-styles";

type ClientPaginationBarProps = {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  className?: string;
};

export function ClientPaginationBar({ page, totalPages, onPrev, onNext, className = "" }: ClientPaginationBarProps) {
  if (totalPages <= 1) return null;

  return (
    <div
      className={[
        "flex flex-wrap items-center justify-center gap-2 border-t border-[var(--border)] pt-3",
        className,
      ].join(" ")}
    >
      <button
        type="button"
        className={lux.btnSecondary + " !py-2 text-xs"}
        disabled={page <= 1}
        onClick={onPrev}
      >
        ← Προηγούμενη
      </button>
      <span className="px-2 text-sm font-medium text-[var(--text-secondary)]">
        Σελίδα {page} από {totalPages}
      </span>
      <button
        type="button"
        className={lux.btnSecondary + " !py-2 text-xs"}
        disabled={page >= totalPages}
        onClick={onNext}
      >
        Επόμενη →
      </button>
    </div>
  );
}
