import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
import { getNamedayCalendar, resolveNamedayNamesForDay } from "@/lib/namedays";
export const dynamic = 'force-dynamic';

export type NameDayRow = { month: number; day: number; names: string[] };

/**
 * Πλήρες εορτολόγιο από `name_days` (ταξινόμηση μήνας, ημέρα).
 * Αν η βάση είναι ελλιπής, συμπληρώνεται από το bundled εορτολόγιο.
 */
export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { supabase } = crm;

    const { data, error } = await supabase
      .from("name_days")
      .select("month, day, names")
      .order("month", { ascending: true })
      .order("day", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const rows = (data ?? []) as NameDayRow[];
    const merged = new Map<string, { month: number; day: number; names: string[] }>();

    for (const r of rows) {
      const k = `${r.month}-${r.day}`;
      merged.set(k, {
        month: r.month,
        day: r.day,
        names: resolveNamedayNamesForDay(r.names ?? [], r.month, r.day),
      });
    }

    // Ensure every calendar day is present (fallback when DB is sparse).
    for (const entry of getNamedayCalendar()) {
      const k = `${entry.month}-${entry.day}`;
      if (merged.has(k)) continue;
      if (entry.names.length === 0) continue;
      merged.set(k, {
        month: entry.month,
        day: entry.day,
        names: entry.names,
      });
    }

    const days: NameDayRow[] = [...merged.values()].sort((a, b) =>
      a.month !== b.month ? a.month - b.month : a.day - b.day,
    );
    return NextResponse.json({ days });
  } catch (e) {
    console.error("[api/namedays/calendar]", e);
    return nextJsonError();
  }
}
