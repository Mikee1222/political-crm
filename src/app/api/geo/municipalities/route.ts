import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

export type MunicipalityRow = {
  id: string;
  name: string;
  regional_unit: string | null;
  created_at: string;
};

export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { supabase } = crm;
    const { data, error } = await supabase
      .from("municipalities")
      .select("id, name, regional_unit, created_at")
      .order("name", { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ municipalities: (data ?? []) as MunicipalityRow[] });
  } catch (e) {
    console.error("[api/geo/municipalities GET]", e);
    return nextJsonError();
  }
}
