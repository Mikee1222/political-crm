/** SLA για ανοικτά αιτήματα: πράσινο / κίτρινο (≤3 ημ.) / κόκκινο (overdue) */

export type SlaUiStatus = "on_track" | "at_risk" | "overdue";

const OPEN = new Set(["Νέο", "Σε εξέλιξη"]);

/** Κατάσταση αποθήκευσης (ίδιο set τιμών με sla_status στη βάση) */
export function computeSlaStatus(
  slaDueDate: string | null,
  status: string | null,
): SlaUiStatus | null {
  if (!slaDueDate || !status || !OPEN.has(status)) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(slaDueDate + "T12:00:00");
  due.setHours(0, 0, 0, 0);
  const daysLeft = Math.ceil((due.getTime() - now.getTime()) / 86_400_000);
  if (daysLeft < 0) return "overdue";
  if (daysLeft <= 3) return "at_risk";
  return "on_track";
}

export function addDaysYmd(createdIso: string, days: number): string {
  const d = new Date(createdIso);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
