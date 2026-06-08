export function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Μία ημέρα (Europe/Athens offset +03:00) για Google Calendar timeMin/timeMax. */
export function athensDayRange(ymd: string): { timeMin: string; timeMax: string } {
  return {
    timeMin: `${ymd}T00:00:00+03:00`,
    timeMax: `${ymd}T23:59:59+03:00`,
  };
}

/** Εβδομάδα Δευ–Κυρ που περιέχει την ημερομηνία. */
export function athensWeekRange(ymd: string): { timeMin: string; timeMax: string } {
  const p = ymd.split("-").map((x) => parseInt(x, 10));
  if (p.length !== 3 || p.some((n) => !Number.isFinite(n))) return athensDayRange(ymd);
  const [Y, M, D] = p as [number, number, number];
  const local = new Date(Y, M - 1, D);
  const day = local.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(local);
  mon.setDate(local.getDate() + diff);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const a = `${mon.getFullYear()}-${pad2(mon.getMonth() + 1)}-${pad2(mon.getDate())}`;
  const b = `${sun.getFullYear()}-${pad2(sun.getMonth() + 1)}-${pad2(sun.getDate())}`;
  return { timeMin: `${a}T00:00:00+03:00`, timeMax: `${b}T23:59:59+03:00` };
}

export function todayYmdAthens(): string {
  const t = new Date();
  return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
}

/** Europe/Athens UTC offset for a calendar date (DST-aware), e.g. +02:00 or +03:00 */
export function athensOffsetForYmd(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return "+03:00";
  const probe = new Date(`${ymd}T12:00:00Z`);
  if (!Number.isFinite(probe.getTime())) return "+03:00";
  const tzPart = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Athens",
    timeZoneName: "longOffset",
  })
    .formatToParts(probe)
    .find((p) => p.type === "timeZoneName")?.value;
  const off = tzPart?.match(/GMT([+-]\d{2}):(\d{2})/);
  return off ? `${off[1]}:${off[2]}` : "+03:00";
}

/** Format parsed instant as due_date: YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS (Europe/Athens). */
export function formatAthensDueDate(d: Date, includeTime: boolean): string {
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: "Europe/Athens",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(includeTime
      ? { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }
      : {}),
  };
  const parts = new Intl.DateTimeFormat("en-US", opts).formatToParts(d);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  const base = `${get("year")}-${get("month")}-${get("day")}`;
  if (!includeTime) return base;
  return `${base}T${get("hour")}:${get("minute")}:${get("second") || "00"}`;
}
