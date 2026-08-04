"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type MobileFilterSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Optional sticky footer (e.g. Εφαρμογή / Κλείσιμο from SearchFilterActions). */
  footer?: ReactNode;
  className?: string;
};

/**
 * Mobile-only bottom sheet for advanced search filters.
 * Portal + backdrop + Escape; slides up from bottom with safe-area padding.
 * Hidden at `lg` so desktop keeps the sidebar.
 */
export function MobileFilterSheet({
  open,
  onClose,
  title = "Φίλτρα",
  children,
  footer,
  className,
}: MobileFilterSheetProps) {
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const t = window.setTimeout(() => setEntered(true), 10);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || !mounted || typeof document === "undefined") return null;

  return createPortal(
    <div className="lg:hidden" role="presentation">
      <button
        type="button"
        className={cn(
          "fixed inset-0 z-[60] transition-opacity duration-200 ease-out [background:var(--overlay-scrim)] backdrop-blur-[2px]",
          entered ? "opacity-100" : "opacity-0",
        )}
        aria-label="Κλείσιμο φίλτρων"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal
        aria-labelledby={titleId}
        className={cn(
          "fixed inset-x-0 bottom-0 z-[70] flex max-h-[min(92dvh,720px)] flex-col rounded-t-3xl border border-b-0 border-[var(--border)] bg-[var(--bg-card)] pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))] shadow-[0_-12px_40px_rgba(0,0,0,0.45)] transition-transform duration-200 ease-out",
          entered ? "translate-y-0" : "translate-y-full",
          className,
        )}
      >
        <div className="flex shrink-0 justify-center pt-2.5" aria-hidden>
          <div className="h-1 w-10 rounded-full bg-[var(--text-muted)]/45" />
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <h2 id={titleId} className="text-base font-semibold text-[var(--text-primary)]">
            {title}
          </h2>
          <button
            type="button"
            className="flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-primary)] active:bg-[color-mix(in_srgb,var(--accent-gold)_12%,var(--bg-elevated))]"
            onClick={onClose}
            aria-label="Κλείσιμο"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">{children}</div>
        {footer != null ? (
          <div className="shrink-0 border-t border-[var(--border)] bg-[var(--bg-elevated)]/80 px-3 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
