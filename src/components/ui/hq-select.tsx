"use client";

import { ChevronDown } from "lucide-react";
import clsx from "clsx";
import type { SelectHTMLAttributes } from "react";
import { lux } from "@/lib/luxury-styles";

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  /** Extra class on the wrapper */
  wrapperClassName?: string;
};

/** Themed native select with chevron (appearance-none). */
export function HqSelect({ className, wrapperClassName, children, disabled, ...rest }: Props) {
  return (
    <div className={clsx("relative min-w-0", wrapperClassName)}>
      <select
        disabled={disabled}
        className={clsx(lux.select, "appearance-none pr-10", className)}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown
        className={clsx(
          "pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]",
          disabled && "opacity-40",
        )}
        aria-hidden
      />
    </div>
  );
}
