import { athensDayRange } from "@/lib/athens-ranges";
import { getAppointmentCalendarUserId, getFreeBusyPrimary } from "@/lib/google-calendar";

const SLOT_MIN = 30;
const H_START = 9;
const H_END = 17;

function toMs(iso: string) {
  return new Date(iso).getTime();
}

function overlaps(a0: number, a1: number, b0: number, b1: number) {
  return a0 < b1 && a1 > b0;
}

/**
 * Διαθέσιμες θέσεις 30 λεπτών (09:00–17:00) για μία ημέρα, με βάση Google free/busy.
 */
export async function getAvailableSlotsForDate(
  dateYmd: string,
): Promise<
  { ok: true; slots: { start: string; end: string }[] } | { ok: false; code: "no_calendar" | "bad_date" }
> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
    return { ok: false, code: "bad_date" };
  }
  const uid = await getAppointmentCalendarUserId();
  if (!uid) {
    return { ok: false, code: "no_calendar" };
  }
  const { timeMin, timeMax } = athensDayRange(dateYmd);
  const fb = await getFreeBusyPrimary(uid, timeMin, timeMax);
  if (!fb.ok) {
    return { ok: false, code: "no_calendar" };
  }
  const busy = fb.busy.map((b) => ({ s: toMs(b.start), e: toMs(b.end) }));

  const slots: { start: string; end: string }[] = [];
  for (let minutes = H_START * 60; minutes < H_END * 60; minutes += SLOT_MIN) {
    const sh = Math.floor(minutes / 60);
    const sm = minutes % 60;
    const endT = minutes + SLOT_MIN;
    if (endT > H_END * 60) continue;
    const eh = Math.floor(endT / 60);
    const em = endT % 60;
    const start = `${dateYmd}T${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}:00+03:00`;
    const end = `${dateYmd}T${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}:00+03:00`;
    const s0 = toMs(start);
    const s1 = toMs(end);
    const hit = busy.some((b) => overlaps(s0, s1, b.s, b.e));
    if (!hit) {
      slots.push({ start, end });
    }
  }
  return { ok: true, slots };
}
