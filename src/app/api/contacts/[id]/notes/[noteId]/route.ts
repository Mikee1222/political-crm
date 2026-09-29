import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; noteId: string } },
) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    // Secretaries/callers can add notes but only manager+ can delete.
    if (!hasMinRole(profile?.role, "manager", profile?.access_tier)) {
      return forbidden();
    }
    const { data: row, error: fErr } = await supabase
      .from("contact_notes")
      .select("id, user_id, contact_id")
      .eq("id", params.noteId)
      .eq("contact_id", params.id)
      .maybeSingle();
    if (fErr) {
      return NextResponse.json({ error: fErr.message }, { status: 400 });
    }
    if (!row) {
      return NextResponse.json({ error: "Δεν βρέθηκε" }, { status: 404 });
    }
    const { error: dErr } = await supabase.from("contact_notes").delete().eq("id", params.noteId);
    if (dErr) {
      return NextResponse.json({ error: dErr.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/contacts/notes/noteId DELETE]", e);
    return nextJsonError();
  }
}
