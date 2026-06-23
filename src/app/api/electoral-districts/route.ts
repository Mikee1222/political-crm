import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
import type { ElectoralDistrictRow } from "@/app/api/geo/electoral-districts/route";

export const dynamic = "force-dynamic";

export type ElectoralDistrictListRow = ElectoralDistrictRow & {
  municipality_name?: string | null;
  contact_count?: number;
};

export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { supabase } = crm;

    const { data: counts, error } = await supabase.rpc("get_contact_electoral_district_counts");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const districts: ElectoralDistrictListRow[] = (
      (counts as { name?: string; contact_count?: number | string }[] | null) ?? []
    ).map((row) => {
      const name = String(row.name ?? "").trim();
      return {
        id: name,
        name,
        municipality_id: "",
        created_at: "",
        municipality_name: null,
        contact_count: Number(row.contact_count ?? 0),
      };
    });

    return NextResponse.json({ districts });
  } catch (e) {
    console.error("[api/electoral-districts GET]", e);
    return nextJsonError();
  }
}
