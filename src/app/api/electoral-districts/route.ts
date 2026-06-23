import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
import type { ElectoralDistrictRow } from "@/app/api/geo/electoral-districts/route";

export const dynamic = "force-dynamic";

export type ElectoralDistrictListRow = ElectoralDistrictRow & { municipality_name?: string | null };

export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { supabase } = crm;

    const { data, error } = await supabase
      .from("electoral_districts")
      .select("id, name, municipality_id, created_at")
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const { data: munis } = await supabase.from("municipalities").select("id, name");
    const mMap = new Map((munis as { id: string; name: string }[] | null)?.map((m) => [m.id, m.name]) ?? []);

    const districts = ((data ?? []) as ElectoralDistrictRow[]).map((r) => ({
      ...r,
      municipality_name: mMap.get(r.municipality_id) ?? null,
    }));

    return NextResponse.json({ districts: districts as ElectoralDistrictListRow[] });
  } catch (e) {
    console.error("[api/electoral-districts GET]", e);
    return nextJsonError();
  }
}
