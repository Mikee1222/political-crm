import { NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { buildNdByMuniMap, computeScoreForContact } from "@/lib/predicted-score";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const { user, profile, supabase } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }

    const nd = await buildNdByMuniMap(supabase, 2023);
    const { data: withCalls } = await supabase.from("calls").select("contact_id");
    const hasCall = new Set((withCalls ?? []).map((c) => (c as { contact_id: string }).contact_id).filter(Boolean));

    const { data: contacts, error } = await supabase
      .from("contacts")
      .select("id, call_status, political_stance, phone, age, influence, municipality");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const rows = contacts ?? [];
    let updated = 0;
    for (const c of rows) {
      const r = c as {
        id: string;
        call_status: string | null;
        political_stance: string | null;
        phone: string | null;
        age: number | null;
        influence: boolean | null;
        municipality: string | null;
      };
      const has = hasCall.has(r.id);
      const score = computeScoreForContact(r, has, nd);
      const { error: uErr } = await supabase.from("contacts").update({ predicted_score: score }).eq("id", r.id);
      if (!uErr) {
        updated += 1;
      }
    }
    return NextResponse.json({ success: true, total: rows.length, updated });
  } catch (e) {
    console.error("[api/contacts/calculate-scores]", e);
    return nextJsonError();
  }
}
