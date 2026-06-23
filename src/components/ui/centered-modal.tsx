"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { X } from "lucide-react";

/** CRM standard dialog layer: above nav/sheets, below command palette (400). */
const MODAL_OVERLAY_CLASS =
  "fixed inset-0 z-[9998] flex items-center justify-center bg-[var(--overlay-scrim)] p-0 backdrop-blur-sm max-sm:items-stretch max-sm:justify-stretch sm:p-4";

export type ModalShellProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Classes on the panel wrapper (click does not close). */
  className?: string;
  /** Extra classes merged onto the overlay (backdrop) row. */
  overlayClassName?: string;
  /** If false, backdrop clicks do not close (default true). */
  closeOnBackdrop?: boolean;
};

/**
 * Primitive: portal to document.body, dark scrim, backdrop click, Escape.
 * Use for custom panels; prefer CenteredModal for title + body + footer.
 */
export function ModalShell({
  open,
  onClose,
  children,
  className,
  overlayClassName,
  closeOnBackdrop = true,
}: ModalShellProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !mounted || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className={clsx(MODAL_OVERLAY_CLASS, overlayClassName)}
      role="presentation"
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className={clsx(
          "pointer-events-auto flex max-h-full w-full min-h-0 min-w-0 flex-row items-center justify-center outline-none",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

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
  overlayClassName?: string;
  closeOnBackdrop?: boolean;
  /** On small screens: bottom sheet style (slide-up, full width, large touch targets). */
  sheetOnMobile?: boolean;
};

/**
 * Standard CRM modal: same shell as ModalShell + visible X, header, scroll body, optional footer.
 */
export function CenteredModal({
  open,
  onClose,
  title,
  children,
  footer,
  className,
  bodyClassName,
  ariaLabel,
  overlayClassName,
  closeOnBackdrop,
  sheetOnMobile,
}: CenteredModalProps) {
  const titleId = useId();

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      overlayClassName={clsx(
        sheetOnMobile &&
          "max-sm:flex max-sm:flex-col max-sm:items-stretch max-sm:justify-end max-sm:p-0 sm:items-center sm:justify-center",
        overlayClassName,
      )}
      closeOnBackdrop={closeOnBackdrop}
    >
      <div
        role="dialog"
        aria-modal
        aria-labelledby={titleId}
        {...(ariaLabel ? { "aria-label": ariaLabel } : {})}
        className={clsx(
          "relative flex max-h-[min(90dvh,90vh)] w-[min(680px,calc(100vw-2rem))] max-w-full flex-col overflow-hidden rounded-none border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl sm:rounded-2xl sm:border",
          sheetOnMobile
            ? "max-sm:mt-auto max-sm:max-h-[min(95dvh,95vh)] max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none max-sm:rounded-t-3xl max-sm:border-x-0 max-sm:border-b-0"
            : "max-sm:fixed max-sm:inset-0 max-sm:z-[9999] max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-full max-sm:max-w-none max-sm:rounded-none max-sm:border-0",
          className,
        )}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm transition hover:border-[color-mix(in_srgb,var(--accent-gold)_60%,var(--border))] hover:bg-[color-mix(in_srgb,var(--accent-gold)_15%,transparent)] hover:text-[var(--accent-gold)]"
          aria-label="Κλείσιμο"
        >
          <X className="h-5 w-5" aria-hidden strokeWidth={2.25} />
        </button>

        <header
          className={clsx(
            "shrink-0 border-b border-[var(--border)] px-4 py-3 pr-14 pt-3 sm:px-6 sm:py-4 sm:pr-16",
            sheetOnMobile && "max-sm:px-5 max-sm:py-4 max-sm:pr-16",
          )}
        >
          <h2 id={titleId} className="text-lg font-bold text-[var(--text-primary)]">
            {title}
          </h2>
        </header>

        <div
          className={clsx(
            "min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-4",
            sheetOnMobile && "max-sm:px-5 max-sm:py-4",
            bodyClassName,
          )}
        >
          {children}
        </div>

        {footer != null ? (
          <footer
            className={clsx(
              "flex shrink-0 flex-col gap-2 border-t border-[var(--border)] px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:px-6 sm:py-4",
              sheetOnMobile && "max-sm:gap-3 max-sm:px-5 max-sm:py-4 [&_button]:min-h-12 [&_a]:min-h-12",
            )}
          >
            {footer}
          </footer>
        ) : null}
      </div>
    </ModalShell>
  );
}

/** Alias for imports that prefer the name AppModal. */
export const AppModal = CenteredModal;
