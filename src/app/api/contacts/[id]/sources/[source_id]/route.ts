import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

export async function DELETE(_: NextRequest, { params }: { params: { id: string; source_id: string } }) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }

    const sourceId = String(params.source_id ?? "").trim();
    if (!sourceId) {
      return NextResponse.json({ error: "Απαιτείται source_id" }, { status: 400 });
    }

    const { error } = await supabase
      .from("contact_source_members")
      .delete()
      .eq("contact_id", params.id)
      .eq("source_id", sourceId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/contacts/id/sources/source_id DELETE]", e);
    return nextJsonError();
  }
}
