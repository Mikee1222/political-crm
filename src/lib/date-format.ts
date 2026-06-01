/** Display helpers: UTC instants → Europe/Athens; calendar dates stay shift-free. */

export const ATHENS_TZ = "Europe/Athens";

function parseInstant(value: string | Date | null | undefined): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value == null || String(value).trim() === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Format a UTC instant as datetime in Europe/Athens (el-GR). */
export function formatDateTimeAthens(
  value: string | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = parseInstant(value);
  if (!d) return "—";
  return d.toLocaleString("el-GR", { timeZone: ATHENS_TZ, ...options });
}

/** Format a UTC instant as date in Europe/Athens (el-GR). */
export function formatDateAthens(
  value: string | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = parseInstant(value);
  if (!d) return "—";
  return d.toLocaleDateString("el-GR", { timeZone: ATHENS_TZ, ...options });
}

/** Format a UTC instant as time in Europe/Athens (el-GR). */
export function formatTimeAthens(
  value: string | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = parseInstant(value);
  if (!d) return "—";
  return d.toLocaleTimeString("el-GR", { timeZone: ATHENS_TZ, ...options });
}

/** Admin-style datetime (en-GB ordering, Athens wall clock). */
export function formatDateTimeEnGb(value: string | null | undefined): string {
  const d = parseInstant(value);
  if (!d) return "—";
  return d.toLocaleString("en-GB", {
    timeZone: ATHENS_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Calendar date (YYYY-MM-DD) without timezone shift — birthdays, due dates, name days.
 * Uses UTC noon for the calendar parts so the displayed day/month never drift.
 */
export function formatCalendarDateOnly(
  value: string | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (value == null || String(value).trim() === "") return "—";
  const ymd = String(value).trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (m) {
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
    return d.toLocaleDateString("el-GR", { timeZone: "UTC", ...options });
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("el-GR", options);
}

/** Call-log datetime (el-GR, Athens). */
export function formatCallLogDateTime(calledAt: string | null | undefined): string {
  return formatDateTimeAthens(calledAt, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Compact chat / activity timestamp. */
export function formatChatTime(iso: string): string {
  const d = parseInstant(iso);
  if (!d) return "";
  return d.toLocaleString("el-GR", {
    timeZone: ATHENS_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Live clock / “today” label in Athens. */
export function formatNowAthens(options?: Intl.DateTimeFormatOptions): string {
  return new Date().toLocaleString("el-GR", { timeZone: ATHENS_TZ, ...options });
}

/** Long-form today label (weekday + date) in Athens. */
export function formatTodayLabelAthens(options?: Intl.DateTimeFormatOptions): string {
  return formatNowAthens({
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    ...options,
  });
}

/** YYYY-MM-DD for “today” in Europe/Athens (internal comparisons / exports). */
export function todayYmdAthens(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: ATHENS_TZ });
}
