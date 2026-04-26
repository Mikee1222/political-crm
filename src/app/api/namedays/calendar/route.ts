import { NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
import { getSessionWithProfile } from "@/lib/auth-helpers";
export const dynamic = 'force-dynamic';


export type NameDayRow = { month: number; day: number; names: string[] };

/**
 * Πλήρες εορτολόγιο από `name_days` (ταξινόμηση μήνας, ημέρα).
 */
export async function GET() {
  try {
    const { user, supabase } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }

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
