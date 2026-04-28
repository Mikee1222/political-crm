import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Lightweight counts for the contacts page war-room header (RLS applies).
 */
export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { supabase } = crm;

    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const monthStartIso = start.toISOString();

    const [totalR, positiveR, pendingR, monthR] = await Promise.all([
      supabase.from("contacts").select("id", { count: "exact", head: true }),
      supabase.from("contacts").select("id", { count: "exact", head: true }).eq("call_status", "Positive"),
      supabase
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .or("call_status.eq.Pending,call_status.is.null"),
      supabase.from("contacts").select("id", { count: "exact", head: true }).gte("created_at", monthStartIso),
    ]);

    const err = totalR.error ?? positiveR.error ?? pendingR.error ?? monthR.error;
    if (err) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }

    return NextResponse.json({
      total: totalR.count ?? 0,
      positive: positiveR.count ?? 0,
      pending: pendingR.count ?? 0,
      this_month: monthR.count ?? 0,
    });
  } catch (e) {
    console.error("[api/contacts/summary-stats]", e);
    return NextResponse.json({ error: "Σφάλμα διακομιστή" }, { status: 500 });
  }
}
