"use client";

import { Skull } from "lucide-react";
import {
  getContactAutoFlags,
  type ContactForAutoFlags,
} from "@/lib/get-contact-auto-flags";
import { cn } from "@/lib/utils";

const BADGE_DEFS = [
  {
    key: "noMobile" as const,
    label: "Χωρίς κινητό",
    className:
      "border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-200",
  },
  {
    key: "noLandline" as const,
    label: "Χωρίς σταθερό",
    className:
      "border-yellow-500/40 bg-yellow-500/15 text-yellow-900 dark:text-yellow-100",
  },
  {
    key: "noEmail" as const,
    label: "Χωρίς email",
    className:
      "border-blue-500/40 bg-blue-500/15 text-blue-900 dark:text-blue-100",
  },
  {
    key: "deceased" as const,
    label: "Απεβίωσε",
    className:
      "border-zinc-700/50 bg-zinc-900/90 text-zinc-100 dark:border-zinc-500/40 dark:bg-zinc-950/90",
  },
] as const;

export function ContactStatusBadges({
  contact,
  className,
  size = "sm",
}: {
  contact: ContactForAutoFlags;
  className?: string;
  size?: "sm" | "xs";
}) {
  const flags = getContactAutoFlags(contact);
  const active = BADGE_DEFS.filter((b) => flags[b.key]);
  if (!active.length) return null;

  const pillClass =
    size === "xs"
      ? "px-1.5 py-0.5 text-[10px] gap-0.5"
      : "px-2 py-0.5 text-[11px] gap-1";

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {active.map((b) => (
        <span
          key={b.key}
          className={cn(
            "inline-flex items-center rounded-full border font-semibold",
            pillClass,
            b.className,
          )}
        >
          {b.key === "deceased" ? (
            <Skull className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
          ) : null}
          {b.label}
        </span>
      ))}
    </div>
  );
}
