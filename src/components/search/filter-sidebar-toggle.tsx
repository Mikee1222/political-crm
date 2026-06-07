"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function FilterSidebarToggle({
  open,
  onClick,
  className,
  "aria-label": ariaLabel,
}: {
  open: boolean;
  onClick: () => void;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel ?? (open ? "Σύμπτυξη φίλτρων" : "Ανάπτυξη φίλτρων")}
      className={cn(
        "absolute top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-md transition-all duration-300 hover:scale-105 hover:brightness-110 active:scale-95",
        open ? "-right-4" : "left-0",
        className,
      )}
    >
      {open ? <ChevronLeft className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
    </button>
  );
}
