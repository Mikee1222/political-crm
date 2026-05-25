import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { supabase } = crm;

    const { data } = await supabase
      .from("contacts")
      .select("municipality")
      .not("municipality", "is", null)
      .order("municipality")
      .range(0, 999)

    const unique = [...new Set(data?.map(r => r.municipality).filter(Boolean))].sort()

    return NextResponse.json(unique);
  } catch (e) {
    console.error("[api/municipalities GET]", e);
    return nextJsonError();
  }
}
