import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
import { requireSettingsEdit } from "@/lib/require-permission-api";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function DELETE(_: NextRequest, { params }: Ctx) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { supabase } = crm;
    const denied = await requireSettingsEdit(crm);
    if (denied) return denied;
    const id = params.id?.trim();
    if (!id) {
      return NextResponse.json({ error: "Άκυρο" }, { status: 400 });
    }
    const { error } = await supabase.from("staff_aliases").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/admin/staff-aliases id DELETE]", e);
    return nextJsonError();
  }
}
