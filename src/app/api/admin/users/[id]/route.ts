import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { createServiceClient } from "@/lib/supabase/admin";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = 'force-dynamic';

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
  const crm = await checkCRMAccess();
  if (!crm.allowed) return crm.response;
  const { user, profile } = crm;
  if (profile?.role !== "admin") return forbidden();
  if (params.id === user.id) {
    return NextResponse.json({ error: "Δεν μπορείς να αλλάξεις το δικό σου ρόλο εδώ" }, { status: 400 });
  }
  const body = (await request.json()) as { role: string };
  const roleName = String(body.role ?? "").trim();
  if (!roleName) {
    return NextResponse.json({ error: "Άκυρος ρόλος" }, { status: 400 });
  }
  const admin = createServiceClient();
  const { data: roleOk } = await admin.from("roles").select("name").eq("name", roleName).maybeSingle();
  if (!roleOk) {
    return NextResponse.json({ error: "Ο ρόλος δεν υπάρχει στο σύστημα" }, { status: 400 });
  }
  const { error } = await admin.from("profiles").update({ role: roleName }).eq("id", params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/admin/users/id PUT]", e);
    return nextJsonError();
  }
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
  const crm = await checkCRMAccess();
  if (!crm.allowed) return crm.response;
  const { user, profile } = crm;
  if (profile?.role !== "admin") return forbidden();
  if (params.id === user.id) {
    return NextResponse.json({ error: "Δεν μπορείτε να διαγράψετε τον εαυτό σας" }, { status: 400 });
  }
  const admin = createServiceClient();
  const { error } = await admin.auth.admin.deleteUser(params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/admin/users/id DELETE]", e);
    return nextJsonError();
  }
}
