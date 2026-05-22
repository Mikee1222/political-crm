import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { accessGrantExpiresAt, generateHourlyCode } from "@/lib/access-code";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

const ACCESS_COOKIE = "crm_access_granted";
const ACCESS_MAX_AGE = 60 * 60 * 2;

/** POST { code } — verify hourly code; grant via cookie (+ DB audit). */
export async function POST(req: NextRequest) {
  try {
    const crm = await checkCRMAccess(req);
    if (!crm.allowed) return crm.response;

    const body = (await req.json().catch(() => ({}))) as { code?: string };
    const submitted = String(body.code ?? "").trim();
    if (!/^\d{6}$/.test(submitted)) {
      return NextResponse.json({ error: "Λάθος κλειδαριθμός." }, { status: 400 });
    }

    const expected = generateHourlyCode();
    if (submitted !== expected) {
      return NextResponse.json({ error: "Λάθος κλειδαριθμός." }, { status: 400 });
    }

    const expiresAt = accessGrantExpiresAt();
    const admin = createServiceClient();
    const { error: grantErr } = await admin.from("access_code_grants").upsert(
      {
        user_id: crm.user.id,
        expires_at: expiresAt.toISOString(),
        code_used: submitted,
        granted_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (grantErr) {
      console.error("[access-code/verify] grant upsert", grantErr.message);
    }

    const response = NextResponse.json({ success: true, expires_at: expiresAt.toISOString() });
    response.cookies.set(ACCESS_COOKIE, "1", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: ACCESS_MAX_AGE,
      path: "/",
    });
    return response;
  } catch (e) {
    console.error("[api/access-code/verify POST]", e);
    return nextJsonError();
  }
}
