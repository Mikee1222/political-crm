import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

export type ElectoralDistrictRow = {
  id: string;
  name: string;
  municipality_id: string;
  created_at: string;
};

export async function GET(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { supabase } = crm;
    const muniId = request.nextUrl.searchParams.get("municipality_id")?.trim();
    if (!muniId) {
      return NextResponse.json({ error: "Υποχρεωτικό municipality_id" }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("electoral_districts")
      .select("id, name, municipality_id, created_at")
      .eq("municipality_id", muniId)
      .order("name", { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ districts: (data ?? []) as ElectoralDistrictRow[] });
  } catch (e) {
    console.error("[api/geo/electoral-districts GET]", e);
    return nextJsonError();
  }
}
