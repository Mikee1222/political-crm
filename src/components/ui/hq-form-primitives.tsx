"use client";

import clsx from "clsx";
import type { ReactNode } from "react";

export function HqLabel({ children, htmlFor, required, className }: { children: ReactNode; htmlFor?: string; required?: boolean; className?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className={clsx(
        "mb-1.5 block text-[12px] font-medium uppercase tracking-[0.08em] text-[var(--text-label)]",
        className,
      )}
    >
      {children}
      {required && (
        <span className="ml-0.5 text-red-500" aria-hidden>
          *
        </span>
      )}
    </label>
  );
}

export function HqFieldError({ id, children }: { id?: string; children: ReactNode | null | undefined }) {
  if (children == null || children === "") return null;
  return (
    <p id={id} className="mt-1 text-xs text-red-400" role="alert">
      {children}
    </p>
  );
}
