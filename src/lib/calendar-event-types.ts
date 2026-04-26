export const CAL_EVENT_TYPE_KEYS = ["meeting", "event", "campaign", "other"] as const;
export type CalendarEventType = (typeof CAL_EVENT_TYPE_KEYS)[number];

export const CALENDAR_EVENT_TYPES: Record<
  CalendarEventType,
  {
    label: string;
    /** Legacy light (unused in dark week grid) */
    color: string;
    /** Dark luxury week grid card */
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
    block: "bg-zinc-600/25 text-zinc-200 ring-1 ring-inset ring-zinc-500/35",
  },
};

export function calendarTypeBlockClass(type: CalendarEventType): string {
  return CALENDAR_EVENT_TYPES[type]?.block ?? CALENDAR_EVENT_TYPES.other.block;
}
