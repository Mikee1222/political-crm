import { parseInstant } from "@/lib/date-format";

/** Σύγκριση ημερολογιακής ημέρας Europe/Athens (για στατιστικά «σήμερα»). */
export function formatDateInEuropeAthens(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Athens",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function isSameEuropeAthensCalendarDay(isoLike: string | null | undefined): boolean {
  if (!isoLike) return false;
  const parsed = parseInstant(isoLike);
  if (!parsed) return false;
  const callDay = formatDateInEuropeAthens(parsed);
  const today = formatDateInEuropeAthens(new Date());
  return callDay === today;
}

/** Hour 0–23 in Europe/Athens, or -1 if unparseable. */
export function hourInEuropeAthens(isoLike: string | null | undefined): number {
  if (!isoLike) return -1;
  const parsed = parseInstant(isoLike);
  if (!parsed) return -1;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Athens",
    hour: "numeric",
    hour12: false,
  }).formatToParts(parsed);
  const hour = parts.find((p) => p.type === "hour")?.value;
  const n = hour != null ? parseInt(hour, 10) : NaN;
  return Number.isFinite(n) ? n % 24 : -1;
}
