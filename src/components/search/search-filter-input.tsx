"use client";

import { Search } from "lucide-react";
import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const searchFilterInputClass =
  "h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--input-bg)] text-sm text-[var(--text-input)] placeholder:text-[var(--text-placeholder)] transition-shadow focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50";

type SearchFilterInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  className?: string;
  withSearchIcon?: boolean;
};

export function SearchFilterInput({
  className,
  withSearchIcon = false,
  ...props
}: SearchFilterInputProps) {
  if (!withSearchIcon) {
    return <input className={cn(searchFilterInputClass, "px-3", className)} {...props} />;
  }

  return (
    <div className={cn("relative", className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
        aria-hidden
      />
      <input className={cn(searchFilterInputClass, "pl-9 pr-3")} {...props} />
    </div>
  );
}
