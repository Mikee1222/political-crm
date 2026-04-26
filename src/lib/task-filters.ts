import { endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek, isValid } from "date-fns";

export type TaskTabFilter = "all" | "today" | "week" | "overdue";

/** YYYY-MM-DD in Europe/Athens if no client anchor. */
export function defaultAnchorYmd() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Athens" });
}

function parseYmd(ymd: string): Date {
  const d = parseISO(ymd.length >= 10 ? ymd.slice(0, 10) : ymd);
  if (!isValid(d)) {
    return new Date();
  }
  return d;
}

export function weekRangeYmd(anchor: string): { from: string; to: string } {
  const d = parseYmd(anchor);
  const s = startOfWeek(d, { weekStartsOn: 1 });
  const e = endOfWeek(d, { weekStartsOn: 1 });
  return { from: format(s, "yyyy-MM-dd"), to: format(e, "yyyy-MM-dd") };
}

export function monthRangeYmd(year: number, month1to12: number): { from: string; to: string } {
  const d = new Date(year, month1to12 - 1, 1);
  const s = startOfMonth(d);
  const e = endOfMonth(d);
  return { from: format(s, "yyyy-MM-dd"), to: format(e, "yyyy-MM-dd") };
}

/** Inclusive: days from first day of month. */
export function listDaysInMonth(year: number, month1to12: number): string[] {
  const s = new Date(year, month1to12 - 1, 1);
  const e = endOfMonth(s);
  const out: string[] = [];
  for (let t = s.getTime(); t <= e.getTime(); t += 86400000) {
    out.push(format(new Date(t), "yyyy-MM-dd"));
  }
  return out;
}

/**
 * @param m Add days for heatmap: key yyyy-mm-dd, count tasks.
 */
export function addDaysInMonthCounts(
  rows: { due_date: string | null }[],
  y: number,
  m1: number,
): Record<string, number> {
  const { from, to } = monthRangeYmd(y, m1);
  const initial: Record<string, number> = {};
  for (const d of listDaysInMonth(y, m1)) initial[d] = 0;
  for (const row of rows) {
    const d = row.due_date;
    if (!d || d < from || d > to) continue;
    if (d in initial) initial[d] += 1;
  }
  return initial;
}

export function ymdToNextMonth(y: number, m1: number) {
  if (m1 === 12) return { y: y + 1, m: 1 };
  return { y, m: m1 + 1 };
}

export function ymdToPrevMonth(y: number, m1: number) {
  if (m1 === 1) return { y: y - 1, m: 12 };
  return { y, m: m1 - 1 };
}
