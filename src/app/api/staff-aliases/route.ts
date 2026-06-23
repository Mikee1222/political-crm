import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
import { fetchStaffAliasesWithProfiles } from "@/lib/staff-aliases";

export const dynamic = "force-dynamic";

/** Read staff aliases for display resolution (all CRM users). */
export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { supabase } = crm;
    const { aliases } = await fetchStaffAliasesWithProfiles(supabase);
    return NextResponse.json({ aliases });
  } catch (e) {
    console.error("[api/staff-aliases GET]", e);
    return nextJsonError();
  }
}
