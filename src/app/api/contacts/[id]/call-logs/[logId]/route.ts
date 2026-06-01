import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasPermissionFlexible } from "@/lib/permission-check";
import { nextJsonError } from "@/lib/api-resilience";
import { resolveContactId } from "@/lib/resolve-entity-id";

export const dynamic = "force-dynamic";

/** Admin clears manual last-contacted fields on contacts (logId is contact id). */
export async function DELETE(
  _: NextRequest,
  { params }: { params: { id: string; logId: string } },
) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { user, profile, supabase } = crm;

    if (profile?.role !== "admin") {
      return forbidden();
    }
    const canDelete = await hasPermissionFlexible(user.id, "communication_logs_delete", true);
    if (!canDelete) {
      return forbidden();
    }

    const contactId = await resolveContactId(supabase, params.id);
    if (!contactId) {
      return NextResponse.json({ error: "Δεν βρέθηκε" }, { status: 404 });
    }
    if (params.logId !== contactId) {
      return NextResponse.json({ error: "Δεν βρέθηκε" }, { status: 404 });
    }

    const { data: row, error: fErr } = await supabase
      .from("contacts")
      .select("id, last_contacted_at")
      .eq("id", contactId)
      .maybeSingle();
    if (fErr) {
      return NextResponse.json({ error: fErr.message }, { status: 400 });
    }
    if (!row?.last_contacted_at) {
      return NextResponse.json({ error: "Δεν βρέθηκε" }, { status: 404 });
    }

    const now = new Date().toISOString();
    const { error: upErr } = await supabase
      .from("contacts")
      .update({
        last_contacted_at: null,
        last_contacted_by: null,
        updated_at: now,
        updated_by: user.id,
      })
      .eq("id", contactId);
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, last_contacted_at: null });
  } catch (e) {
    console.error("[api/contacts/call-logs/logId DELETE]", e);
    return nextJsonError();
  }
}
