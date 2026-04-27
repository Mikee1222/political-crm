import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
import type { CampaignTypeRow } from "@/lib/campaign-types";
export const dynamic = "force-dynamic";

/** Λίστα τύπων καμπάνιας (dropdown δημιουργίας καμπάνιας — manager+). */
export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    if (!hasMinRole(crm.profile?.role, "manager")) {
      return forbidden();
    }
    const { data, error } = await crm.supabase
      .from("campaign_types")
      .select("id, name, description, retell_agent_id, color, created_at")
      .order("name", { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ types: (data ?? []) as CampaignTypeRow[] });
  } catch (e) {
    console.error("[api/campaign-types GET]", e);
    return nextJsonError();
  }
}
