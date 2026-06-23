import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { generateHourlyCode, getHourBounds, minutesUntil } from "@/lib/access-code";
import { nextJsonError } from "@/lib/api-resilience";
import { requireAdminOnlyPermission } from "@/lib/require-permission-api";

export const dynamic = "force-dynamic";

/** GET — current hourly code (admin only). */
export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const denied = await requireAdminOnlyPermission(crm, "access_code_view");
    if (denied) return denied;

    const now = new Date();
    const code = generateHourlyCode(now);
    const { from, until } = getHourBounds(now);

    const admin = createServiceClient();
    const { error: upsertErr } = await admin.from("access_codes").upsert(
      {
        code,
        valid_from: from.toISOString(),
        valid_until: until.toISOString(),
        created_by: crm.user.id,
      },
      { onConflict: "valid_from" },
    );
    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 400 });
    }

    return NextResponse.json({
      code,
      valid_until: until.toISOString(),
      minutes_left: minutesUntil(until),
    });
  } catch (e) {
    console.error("[api/access-code GET]", e);
    return nextJsonError();
  }
}
