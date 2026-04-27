import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { nextJsonError } from "@/lib/api-resilience";
import type { ToponymRow } from "@/app/api/geo/toponyms/route";

export const dynamic = "force-dynamic";

export type ToponymAdminRow = ToponymRow & {
  municipality_name?: string | null;
  electoral_district_name?: string | null;
};

export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (profile?.role !== "admin") {
      return forbidden();
    }
    const { data, error } = await supabase
      .from("toponyms")
      .select("id, name, municipality_id, electoral_district_id, created_at")
      .order("name", { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const { data: munis } = await supabase.from("municipalities").select("id, name");
    const { data: eds } = await supabase.from("electoral_districts").select("id, name");
    const mMap = new Map((munis as { id: string; name: string }[] | null)?.map((m) => [m.id, m.name]) ?? []);
    const dMap = new Map((eds as { id: string; name: string }[] | null)?.map((m) => [m.id, m.name]) ?? []);
    const rows = (data as ToponymRow[] | null)?.map((r) => ({
      ...r,
      municipality_name: mMap.get(r.municipality_id) ?? null,
      electoral_district_name: r.electoral_district_id ? dMap.get(r.electoral_district_id) ?? null : null,
    })) ?? [];
    return NextResponse.json({ toponyms: rows as ToponymAdminRow[] });
  } catch (e) {
    console.error("[api/admin/toponyms GET]", e);
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
    const body = (await request.json()) as { name?: string; municipality_id?: string; electoral_district_id?: string | null };
    const name = String(body.name ?? "").trim();
    const municipality_id = String(body.municipality_id ?? "").trim();
    if (!name || !municipality_id) {
      return NextResponse.json({ error: "Υποχρεωτικό όνομα και δήμος" }, { status: 400 });
    }
    const electoral_district_id =
      body.electoral_district_id != null && String(body.electoral_district_id).trim() !== ""
        ? String(body.electoral_district_id).trim()
        : null;
    const { data, error } = await supabase
      .from("toponyms")
      .insert({ name, municipality_id, electoral_district_id })
      .select("id, name, municipality_id, electoral_district_id, created_at")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ row: data as ToponymRow });
  } catch (e) {
    console.error("[api/admin/toponyms POST]", e);
    return nextJsonError();
  }
}
