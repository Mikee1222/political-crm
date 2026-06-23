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

      const [{ data: munis, error: mErr }, { data: counts, error: cErr }] = await Promise.all([
        supabase.from("municipalities").select("id, name, regional_unit, created_at").order("name", { ascending: true }),
        supabase.rpc("get_contact_municipality_counts"),
      ]);

      if (mErr) {
        return NextResponse.json({ error: mErr.message }, { status: 400 });
      }
      if (cErr) {
        return NextResponse.json({ error: cErr.message }, { status: 400 });
      }

      const countMap = new Map(
        ((counts as { name?: string; contact_count?: number | string }[] | null) ?? []).map((r) => [
          String(r.name ?? "").trim(),
          Number(r.contact_count ?? 0),
        ]),
      );

      const municipalities = ((munis ?? []) as MunicipalityRow[]).map((m) => ({
        ...m,
        contact_count: countMap.get(m.name.trim()) ?? 0,
      }));

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
