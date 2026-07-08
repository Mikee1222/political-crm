"use client";

import { History, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function RestoredSearchBanner({
  onDismiss,
  className,
}: {
  onDismiss: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-3 flex items-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--accent)_28%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_8%,var(--bg-elevated))] px-3 py-2 text-xs text-[var(--text-secondary)]",
        className,
      )}
      role="status"
    >
      <History className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" aria-hidden />
      <span className="min-w-0 flex-1">Αποτελέσματα από προηγούμενη αναζήτηση</span>
      <button
        type="button"
        onClick={onDismiss}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]"
        aria-label="Καθαρισμός προηγούμενης αναζήτησης"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}
