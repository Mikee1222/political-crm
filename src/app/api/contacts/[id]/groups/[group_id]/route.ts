import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
import { removeContactGroupMembership } from "@/lib/contact-group-members";

export const dynamic = "force-dynamic";

export async function DELETE(_: NextRequest, { params }: { params: { id: string; group_id: string } }) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }

    const groupId = String(params.group_id ?? "").trim();
    if (!groupId) {
      return NextResponse.json({ error: "Απαιτείται group_id" }, { status: 400 });
    }

    const allGroups = await removeContactGroupMembership(supabase, params.id, groupId);
    return NextResponse.json({ ok: true, all_groups: allGroups });
  } catch (e) {
    console.error("[api/contacts/id/groups/group_id DELETE]", e);
    return nextJsonError();
  }
}
