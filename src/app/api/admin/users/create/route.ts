import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { forbidden } from "@/lib/auth-helpers";
import { createServiceClient } from "@/lib/supabase/admin";
import type { Role } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().min(1),
  role: z.enum(["caller", "manager", "admin"]),
});

export async function POST(request: NextRequest) {
  try {
  const crm = await checkCRMAccess();
  if (!crm.allowed) return crm.response;
  const { profile } = crm;
  if (profile?.role !== "admin") return forbidden();

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Άκυρα δεδομένα" }, { status: 400 });
  }
  const { email, password, full_name, role } = parsed.data as {
    email: string;
    password: string;
    full_name: string;
    role: Role;
  };

  const admin = createServiceClient();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });
  if (createErr || !created.user) {
    return NextResponse.json({ error: createErr?.message ?? "Αποτυχία δημιουργίας" }, { status: 400 });
  }

  const { error: upErr } = await admin
    .from("profiles")
    .update({ full_name, role })
    .eq("id", created.user.id);
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 400 });
  }

  return NextResponse.json({ user_id: created.user.id, email: created.user.email ?? email });
  } catch (e) {
    console.error("[api/admin/users/create]", e);
    return nextJsonError();
  }
}
