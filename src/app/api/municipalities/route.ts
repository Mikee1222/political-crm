import { checkCRMAccess } from "@/lib/crm-api-access";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
import type { MunicipalityRow } from "@/app/api/geo/municipalities/route";

export const dynamic = "force-dynamic";

export type MunicipalityWithCountRow = MunicipalityRow & { contact_count: number };

export async function GET(request: NextRequest) {
  const withCounts = request.nextUrl.searchParams.get("with_counts") === "1";

  if (withCounts) {
    try {
      const crm = await checkCRMAccess();
      if (!crm.allowed) return crm.response;
      const { supabase } = crm;

      const { data: counts, error } = await supabase.rpc("get_contact_municipality_counts");
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      const municipalities: MunicipalityWithCountRow[] = (
        (counts as { name?: string; contact_count?: number | string }[] | null) ?? []
      ).map((row) => {
        const name = String(row.name ?? "").trim();
        return {
          id: name,
          name,
          regional_unit: null,
          created_at: "",
          contact_count: Number(row.contact_count ?? 0),
        };
      });

      return NextResponse.json({ municipalities });
    } catch (e) {
      console.error("[api/municipalities GET with_counts]", e);
      return nextJsonError();
    }
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_distinct_municipalities");

  if (error) {
    return NextResponse.json([]);
  }

  const municipalities = (data as { municipality: string }[])
    .map((r) => r.municipality)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "el"));

  return NextResponse.json(municipalities);
}
