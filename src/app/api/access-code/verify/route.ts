import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { accessGrantExpiresAt, generateHourlyCode } from "@/lib/access-code";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

/** POST { code } — verify hourly code and grant CRM access for 8 hours. */
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
      return NextResponse.json({ error: grantErr.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, expires_at: expiresAt.toISOString() });
  } catch (e) {
    console.error("[api/access-code/verify POST]", e);
    return nextJsonError();
  }
}
