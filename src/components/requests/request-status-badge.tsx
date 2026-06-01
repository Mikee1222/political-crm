"use client";

import {
  getRequestStatusBadgeClasses,
  normalizeRequestStatus,
  REQUEST_STATUS_OPEN,
} from "@/lib/request-statuses";
import { cn } from "@/lib/utils";

const SIZE_CLASSES = {
  xs: "px-2 py-0.5 text-[10px]",
  sm: "px-2.5 py-0.5 text-xs",
  md: "px-4 py-1.5 text-sm",
} as const;

export function RequestStatusBadge({
  status,
  className,
  size = "sm",
  withDot,
  bold,
}: {
  status: string | null | undefined;
  className?: string;
  size?: keyof typeof SIZE_CLASSES;
  withDot?: boolean;
  bold?: boolean;
}) {
  const label = normalizeRequestStatus(status ?? REQUEST_STATUS_OPEN);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-semibold transition-colors duration-200",
        getRequestStatusBadgeClasses(status),
        SIZE_CLASSES[size],
        bold && "font-bold",
        className,
      )}
    >
      {withDot ? (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-80 [animation:hq-pulse-dot_2.4s_ease-in-out_infinite]"
          aria-hidden
        />
      ) : null}
      {label}
    </span>
  );
}
