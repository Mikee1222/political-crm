/** Display helpers: UTC instants → Europe/Athens; calendar dates stay shift-free. */

import { formatDistanceToNow } from "date-fns";
import { el } from "date-fns/locale";

export const ATHENS_TZ = "Europe/Athens";

const HAS_TZ_OFFSET = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i;
/** e.g. Postgres/admin "2026-06-04 12:13 UTC" — not matched by HAS_TZ_OFFSET alone. */
const NAMED_UTC_SUFFIX = /\s+(?:UTC|GMT)\s*$/i;

/** Parse DB/API timestamps as UTC when no offset is present (Postgres timestamp/timestamptz). */
export function parseInstant(value: string | Date | null | undefined): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value == null || String(value).trim() === "") return null;
  const raw = String(value).trim();

  if (NAMED_UTC_SUFFIX.test(raw)) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }

  if (HAS_TZ_OFFSET.test(raw)) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const iso = raw.includes("T") ? raw : raw.replace(" ", "T");
  const asUtc = iso.endsWith("Z") ? iso : `${iso}Z`;
  const d = new Date(asUtc);
  if (!Number.isNaN(d.getTime())) return d;

  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
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

/** Call-log / last_contacted_at datetime (el-GR, Athens wall clock). */
export function formatCallLogDateTime(calledAt: string | null | undefined): string {
  return formatDateTimeAthens(calledAt, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Relative elapsed time from a UTC instant (Greek copy for very recent marks). */
export function formatRelativeAthens(value: string | Date | null | undefined): string {
  const then = parseInstant(value);
  if (!then) return "";
  const diffMs = Date.now() - then.getTime();
  if (diffMs >= 0 && diffMs < 60_000) return "λιγότερο από ένα λεπτό πριν";
  return formatDistanceToNow(then, { locale: el, addSuffix: true });
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
