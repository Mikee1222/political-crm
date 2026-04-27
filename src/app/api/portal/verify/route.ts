import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { token?: string };
    const token = String(body.token ?? "").trim();
    if (!token) {
      return NextResponse.json({ error: "Λείπει token" }, { status: 400 });
    }
    const admin = createServiceClient();
    const { data: row, error: findE } = await admin
      .from("portal_users")
      .select("auth_user_id, id")
      .eq("verification_token", token)
      .maybeSingle();
    if (findE || !row) {
      return NextResponse.json({ error: "Άκυρο ή ληγμένο link" }, { status: 400 });
    }
    const authUserId = (row as { auth_user_id: string }).auth_user_id;
    const { error: upE } = await admin
      .from("portal_users")
      .update({ verified: true, verification_token: null } as never)
      .eq("id", (row as { id: string }).id);
    if (upE) {
      return NextResponse.json({ error: upE.message }, { status: 400 });
    }
    await admin.auth.admin.updateUserById(authUserId, { email_confirm: true });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return nextJsonError();
  }
}
