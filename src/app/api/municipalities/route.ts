import { checkCRMAccess } from "@/lib/crm-api-access";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
import type { MunicipalityRow } from "@/app/api/geo/municipalities/route";

export const dynamic = "force-dynamic";

export type MunicipalityWithCountRow = MunicipalityRow & { contact_count: number };

async function loadAllMunicipalityNames(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<{ names: string[]; countByName: Map<string, number> }> {
  const [{ data: registry }, { data: counts }] = await Promise.all([
    supabase.from("municipalities").select("name").order("name", { ascending: true }),
    supabase.rpc("get_contact_municipality_counts"),
  ]);

  const countByName = new Map<string, number>();
  for (const row of (counts as { name?: string; contact_count?: number | string }[] | null) ?? []) {
    const n = String(row.name ?? "").trim();
    if (n) countByName.set(n, Number(row.contact_count ?? 0));
  }

  const names = new Set<string>();
  for (const row of (registry as { name?: string }[] | null) ?? []) {
    const n = String(row.name ?? "").trim();
    if (n) names.add(n);
  }
  for (const n of countByName.keys()) names.add(n);

  return {
    names: [...names].sort((a, b) => a.localeCompare(b, "el")),
    countByName,
  };
}

export async function GET(request: NextRequest) {
  const withCounts = request.nextUrl.searchParams.get("with_counts") === "1";

  if (withCounts) {
    try {
      const crm = await checkCRMAccess();
      if (!crm.allowed) return crm.response;
      const { supabase } = crm;

      const { names, countByName } = await loadAllMunicipalityNames(supabase);
      const municipalities: MunicipalityWithCountRow[] = names.map((name) => ({
        id: name,
        name,
        regional_unit: null,
        created_at: "",
        contact_count: countByName.get(name) ?? 0,
      }));

      return NextResponse.json({ municipalities });
    } catch (e) {
      console.error("[api/municipalities GET with_counts]", e);
      return nextJsonError();
    }
  }

  try {
    const supabase = await createClient();
    const { names } = await loadAllMunicipalityNames(supabase);
    return NextResponse.json(names);
  } catch (e) {
    console.error("[api/municipalities GET]", e);
    return NextResponse.json([]);
  }
}
