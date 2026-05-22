import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

/** POST — clear access grant on logout. */
export async function POST(req: NextRequest) {
  try {
    const crm = await checkCRMAccess(req);
    if (!crm.allowed) {
      return NextResponse.json({ ok: true });
    }

    const admin = createServiceClient();
    await admin.from("access_code_grants").delete().eq("user_id", crm.user.id);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/access-code/revoke POST]", e);
    return nextJsonError();
  }
}
