import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasPermissionFlexible } from "@/lib/permission-check";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

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

    const { data: row, error: fErr } = await supabase
      .from("calls")
      .select("id, contact_id, called_at")
      .eq("id", params.logId)
      .eq("contact_id", params.id)
      .maybeSingle();
    if (fErr) {
      return NextResponse.json({ error: fErr.message }, { status: 400 });
    }
    if (!row) {
      return NextResponse.json({ error: "Δεν βρέθηκε" }, { status: 404 });
    }

    const { error: dErr } = await supabase.from("calls").delete().eq("id", params.logId);
    if (dErr) {
      return NextResponse.json({ error: dErr.message }, { status: 400 });
    }

    const { data: latest } = await supabase
      .from("calls")
      .select("called_at")
      .eq("contact_id", params.id)
      .order("called_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextLast = (latest as { called_at: string } | null)?.called_at ?? null;
    await supabase
      .from("contacts")
      .update({
        last_contacted_at: nextLast,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      })
      .eq("id", params.id);

    return NextResponse.json({ ok: true, last_contacted_at: nextLast });
  } catch (e) {
    console.error("[api/contacts/call-logs/logId DELETE]", e);
    return nextJsonError();
  }
}
