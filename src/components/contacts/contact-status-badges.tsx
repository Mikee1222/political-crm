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
      "border-amber-500/45 bg-amber-950/85 text-amber-100 [data-theme='light']:border-amber-600/35 [data-theme='light']:bg-amber-100 [data-theme='light']:text-amber-950",
  },
  {
    key: "noLandline" as const,
    label: "Χωρίς σταθερό",
    className:
      "border-yellow-500/45 bg-yellow-950/85 text-yellow-100 [data-theme='light']:border-yellow-600/35 [data-theme='light']:bg-yellow-100 [data-theme='light']:text-yellow-950",
  },
  {
    key: "noEmail" as const,
    label: "Χωρίς email",
    className:
      "border-blue-500/45 bg-blue-950/85 text-blue-100 [data-theme='light']:border-blue-600/35 [data-theme='light']:bg-blue-100 [data-theme='light']:text-blue-950",
  },
  {
    key: "deceased" as const,
    label: "Απεβίωσε",
    className:
      "border-zinc-500/45 bg-zinc-950/90 text-zinc-100 [data-theme='light']:border-zinc-500/40 [data-theme='light']:bg-zinc-800 [data-theme='light']:text-zinc-50",
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
