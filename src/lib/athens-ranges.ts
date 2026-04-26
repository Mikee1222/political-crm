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
