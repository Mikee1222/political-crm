"use client";

import { useEffect } from "react";
import clsx from "clsx";

type Props = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
};

/**
 * Viewport-centered dialog: panel uses fixed + translate(-50%,-50%) so it stays
 * centered regardless of page scroll. Panel scrolls internally if content is tall.
 */
export function CenteredModal({ open, onClose, children, className, ariaLabel }: Props) {
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
      className="fixed inset-0 z-[200] overflow-y-auto overflow-x-hidden [background:var(--overlay-scrim)] backdrop-blur-[8px]"
      role="dialog"
      aria-modal
      aria-label={ariaLabel}
      onClick={onClose}
    >
      <div
        className={clsx(
          "max-h-[min(90dvh,900px)] w-[min(680px,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl",
          className,
        )}
        style={{
          position: "fixed",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          maxHeight: "min(90dvh, 900px)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
