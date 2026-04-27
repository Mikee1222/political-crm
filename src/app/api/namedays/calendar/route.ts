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
    return NextResponse.json({ days: rows });
  } catch (e) {
    console.error("[api/namedays/calendar]", e);
    return nextJsonError();
  }
}
