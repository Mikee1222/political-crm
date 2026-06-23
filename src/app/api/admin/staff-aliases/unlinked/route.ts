import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
import { fetchUnlinkedLegacyNames } from "@/lib/staff-aliases";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
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
