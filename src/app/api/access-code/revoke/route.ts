import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

const ACCESS_COOKIE = "crm_access_granted";

/** POST — clear access grant cookie (and DB row) on logout. */
export async function POST(req: NextRequest) {
  try {
    const crm = await checkCRMAccess(req);
    if (crm.allowed) {
      const admin = createServiceClient();
      await admin.from("access_code_grants").delete().eq("user_id", crm.user.id);
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(ACCESS_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });
    return response;
  } catch (e) {
    console.error("[api/access-code/revoke POST]", e);
    return nextJsonError();
  }
}
