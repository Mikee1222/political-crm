import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
import { fetchUnlinkedLegacyNames } from "@/lib/staff-aliases";
import { requireSettingsEdit } from "@/lib/require-permission-api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { supabase } = crm;
    const denied = await requireSettingsEdit(crm);
    if (denied) return denied;
    const limit = Math.min(
      100,
      Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") || "50", 10) || 50),
    );
    const unlinked = await fetchUnlinkedLegacyNames(supabase, limit);
    return NextResponse.json({ unlinked });
  } catch (e) {
    console.error("[api/admin/staff-aliases/unlinked GET]", e);
    return nextJsonError();
  }
}
