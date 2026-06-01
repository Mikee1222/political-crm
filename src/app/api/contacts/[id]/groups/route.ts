import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
import { addContactGroupMembership } from "@/lib/contact-group-members";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }

    const body = (await request.json()) as { group_id?: string };
    const groupId = String(body.group_id ?? "").trim();
    if (!groupId) {
      return NextResponse.json({ error: "Απαιτείται group_id" }, { status: 400 });
    }

    const { data: group, error: groupError } = await supabase
      .from("contact_groups")
      .select("id, name, color, description, year")
      .eq("id", groupId)
      .single();

    if (groupError) {
      return NextResponse.json({ error: groupError.message }, { status: 400 });
    }

    const allGroups = await addContactGroupMembership(supabase, params.id, groupId);
    return NextResponse.json({ group, all_groups: allGroups });
  } catch (e) {
    console.error("[api/contacts/id/groups POST]", e);
    return nextJsonError();
  }
}
