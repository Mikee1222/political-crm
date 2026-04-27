import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { nextJsonError } from "@/lib/api-resilience";
import type { ElectoralDistrictRow } from "@/app/api/geo/electoral-districts/route";

export const dynamic = "force-dynamic";

export type ElectoralDistrictAdminRow = ElectoralDistrictRow & { municipality_name?: string | null };

export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (profile?.role !== "admin") {
      return forbidden();
    }
    const { data, error } = await supabase
      .from("electoral_districts")
      .select("id, name, municipality_id, created_at")
      .order("name", { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const { data: munis } = await supabase.from("municipalities").select("id, name");
    const mMap = new Map((munis as { id: string; name: string }[] | null)?.map((m) => [m.id, m.name]) ?? []);
    const rows = (data as ElectoralDistrictRow[] | null)?.map((r) => ({
      ...r,
      municipality_name: mMap.get(r.municipality_id) ?? null,
    })) ?? [];
    return NextResponse.json({ districts: rows as ElectoralDistrictAdminRow[] });
  } catch (e) {
    console.error("[api/admin/electoral-districts GET]", e);
    return nextJsonError();
  }
}

export async function POST(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (profile?.role !== "admin") {
      return forbidden();
    }
    const body = (await request.json()) as { name?: string; municipality_id?: string };
    const name = String(body.name ?? "").trim();
    const municipality_id = String(body.municipality_id ?? "").trim();
    if (!name || !municipality_id) {
      return NextResponse.json({ error: "Υποχρεωτικό όνομα και δήμος" }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("electoral_districts")
      .insert({ name, municipality_id })
      .select("id, name, municipality_id, created_at")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ row: data as ElectoralDistrictRow });
  } catch (e) {
    console.error("[api/admin/electoral-districts POST]", e);
    return nextJsonError();
  }
}
