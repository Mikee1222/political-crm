"use client";

import { useEffect, useId, type ReactNode } from "react";
import clsx from "clsx";
import { X } from "lucide-react";

export type CenteredModalProps = {
  open: boolean;
  onClose: () => void;
  /** Shown in the header (always visible next to X). */
  title: ReactNode;
  /** Scrollable body (max height is panel 90vh minus header/footer). */
  children: ReactNode;
  /** Action row (e.g. Άκυρο + Αποθήκευση). Omit for content-only dialogs. */
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Optional dialog label when title is not plain text. */
  ariaLabel?: string;
};

/**
 * Modal: backdrop z-[9998] bg-black/50 (click to close), panel z-[9999] max-h 90vh,
 * header (title) + absolute X (gold hover), scrollable body, optional footer.
 * Escape closes the modal.
 */
export function CenteredModal({ open, onClose, title, children, footer, className, bodyClassName, ariaLabel }: CenteredModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal
        aria-labelledby={titleId}
        {...(ariaLabel ? { "aria-label": ariaLabel } : {})}
        className={clsx(
          "relative z-[9999] flex max-h-[90vh] w-[min(680px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent text-[var(--text-muted)] transition-colors hover:border-[#C9A84C]/50 hover:text-[#C9A84C]"
          aria-label="Κλείσιμο"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>

        <header className="shrink-0 border-b border-[var(--border)] px-5 py-4 pr-14 sm:px-6">
          <h2 id={titleId} className="text-lg font-bold text-[var(--text-primary)]">
            {title}
          </h2>
        </header>

        <div className={clsx("min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6", bodyClassName)}>{children}</div>

        {footer != null ? (
          <footer className="shrink-0 border-t border-[var(--border)] px-5 py-4 sm:px-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
