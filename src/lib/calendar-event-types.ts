export const CAL_EVENT_TYPE_KEYS = ["meeting", "event", "campaign", "other"] as const;
export type CalendarEventType = (typeof CAL_EVENT_TYPE_KEYS)[number];

/** Week grid: solid + white text (legible in light and dark mode). */
export const SCHEDULE_EVENT_COLORS: Record<CalendarEventType, string> = {
  meeting: "#003476",
  event: "#C9A84C",
  campaign: "#DC2626",
  other: "#6B7280",
};

/**
 * If API type is `other`, infer from title; otherwise keep the stored type.
 */
export function resolveEventType(
  type: CalendarEventType,
  title: string | null | undefined,
): CalendarEventType {
  if (type && type !== "other") return type;
  return inferTypeFromTitle(title);
}

export function inferTypeFromTitle(title: string | null | undefined): CalendarEventType {
  if (!title || !String(title).trim()) return "other";
  const t = title.toLowerCase();
  if (/\bσυνάντηση|συνάντη|meeting|zoom|teams|call|κλήση|τηλεδιάσκέ|video\s*call\b/i.test(t)) {
    return "meeting";
  }
  if (/\bεκδ[ίι]λωσ|event|gala|δεξ[ίι]ωση|party|reception|φεστιβά|concert|έναρξη|λήξη\b/i.test(t)) {
    return "event";
  }
  if (/\b(προεκλογ|εκλογ|campaign|καν[ίι]β|door|stand|πρόοδ|χαιρετισμ|door\s*to\s*door)\b/i.test(t)) {
    return "campaign";
  }
  return "other";
}

export function getScheduleEventSurface(
  type: CalendarEventType,
  title: string | null | undefined,
): { resolved: CalendarEventType; color: string } {
  const r = resolveEventType(type, title);
  return { resolved: r, color: SCHEDULE_EVENT_COLORS[r] };
}

export const CALENDAR_EVENT_TYPES: Record<
  CalendarEventType,
  {
    label: string;
    /** Legacy list/table */
    color: string;
    /** Other surfaces (alerts) — not the week grid */
    block: string;
  }
> = {
  meeting: {
    label: "Συνάντηση",
    color: "bg-blue-100 border-blue-200 text-blue-800",
    block:
      "bg-blue-500/20 text-blue-100 ring-1 ring-inset ring-blue-400/30 shadow-[0_0_12px_rgba(59,130,246,0.12)]",
  },
  event: {
    label: "Εκδήλωση",
    color: "bg-amber-100 border-amber-200 text-amber-900",
    block:
      "bg-amber-500/15 text-amber-50 ring-1 ring-inset ring-[var(--accent-gold)]/45 shadow-[0_0_16px_rgba(201,168,76,0.12)]",
  },
  campaign: {
    label: "Προεκλογικό",
    color: "bg-red-100 border-red-200 text-red-800",
    block:
      "bg-red-500/20 text-red-100 ring-1 ring-inset ring-red-400/35 shadow-[0_0_12px_rgba(239,68,68,0.1)]",
  },
  other: {
    label: "Άλλο",
    color: "bg-zinc-100 border-zinc-200 text-zinc-700",
    block: "bg-zinc-600/25 text-[#E2E8F0] ring-1 ring-inset ring-zinc-500/35",
  },
};

export function calendarTypeBlockClass(type: CalendarEventType): string {
  return CALENDAR_EVENT_TYPES[type]?.block ?? CALENDAR_EVENT_TYPES.other.block;
}
