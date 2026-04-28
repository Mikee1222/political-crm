import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { nextJsonError } from "@/lib/api-resilience";
import { getNamedaySeedRows } from "@/lib/nameday-seed";
export const dynamic = "force-dynamic";

/**
 * Replaces all rows in `name_days` with merged seed data (admin only).
 */
export async function POST() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (profile?.role !== "admin") {
      return forbidden();
    }
    const rows = getNamedaySeedRows();
    const { error: delErr } = await supabase.from("name_days").delete().not("id", "is", null);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 400 });
    }
    const batch = rows.map((r) => ({ month: r.month, day: r.day, names: r.names }));
    const CHUNK = 80;
    for (let i = 0; i < batch.length; i += CHUNK) {
      const part = batch.slice(i, i + CHUNK);
      const { error: insErr } = await supabase.from("name_days").insert(part);
      if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 400 });
      }
    }
    return NextResponse.json({ ok: true, inserted: rows.length });
  } catch (e) {
    console.error("[api/admin/nameday-sync]", e);
    return nextJsonError();
  }
}
