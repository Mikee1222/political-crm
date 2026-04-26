import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { createServiceClient } from "@/lib/supabase/admin";
import type { Role } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = 'force-dynamic';

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
  const { user, profile } = await getSessionWithProfile();
  if (!user) return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  if (profile?.role !== "admin") return forbidden();
  if (params.id === user.id) {
    return NextResponse.json({ error: "Δεν μπορείς να αλλάξεις το δικό σου ρόλο εδώ" }, { status: 400 });
  }
  const body = (await request.json()) as { role: Role };
  if (!["caller", "manager", "admin"].includes(body.role)) {
    return NextResponse.json({ error: "Άκυρος ρόλος" }, { status: 400 });
  }
  const admin = createServiceClient();
  const { error } = await admin.from("profiles").update({ role: body.role }).eq("id", params.id);
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
  const { user, profile } = await getSessionWithProfile();
  if (!user) return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
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
