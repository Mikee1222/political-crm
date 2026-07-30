import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { getCampaignAnalytics } from "@/lib/campaign-stats";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }

    const analytics = await getCampaignAnalytics(supabase, params.id);
    return NextResponse.json({ analytics });
  } catch (e) {
    console.error("[api/campaigns/id/analytics GET]", e);
    return nextJsonError();
  }
}
