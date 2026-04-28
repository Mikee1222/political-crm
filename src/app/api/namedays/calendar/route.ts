import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = 'force-dynamic';

export type NameDayRow = { month: number; day: number; names: string[] };

/**
 * Πλήρες εορτολόγιο από `name_days` (ταξινόμηση μήνας, ημέρα).
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
    const merged = new Map<string, { month: number; day: number; names: Set<string> }>();
    for (const r of rows) {
      const k = `${r.month}-${r.day}`;
      if (!merged.has(k)) merged.set(k, { month: r.month, day: r.day, names: new Set() });
      const b = merged.get(k)!;
      for (const n of r.names ?? []) {
        const t = String(n).trim();
        if (t) b.names.add(t);
      }
    }
    const days: NameDayRow[] = [...merged.values()]
      .map((v) => ({
        month: v.month,
        day: v.day,
        names: [...v.names].sort((a, b) => a.localeCompare(b, "el")),
      }))
      .sort((a, b) => (a.month !== b.month ? a.month - b.month : a.day - b.day));
    return NextResponse.json({ days });
  } catch (e) {
    console.error("[api/namedays/calendar]", e);
    return nextJsonError();
  }
}
