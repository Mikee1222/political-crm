import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { nextJsonError } from "@/lib/api-resilience";
import type { MunicipalityRow } from "@/app/api/geo/municipalities/route";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (profile?.role !== "admin") {
      return forbidden();
    }
    const { data, error } = await supabase
      .from("municipalities")
      .select("id, name, regional_unit, created_at")
      .order("name", { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ municipalities: (data ?? []) as MunicipalityRow[] });
  } catch (e) {
    console.error("[api/admin/municipalities GET]", e);
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
    const body = (await request.json()) as { name?: string; regional_unit?: string | null };
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Υποχρεωτικό όνομα" }, { status: 400 });
    }
    const regional_unit = body.regional_unit != null ? String(body.regional_unit).trim() || null : null;
    const { data, error } = await supabase
      .from("municipalities")
      .insert({ name, regional_unit })
      .select("id, name, regional_unit, created_at")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ row: data as MunicipalityRow });
  } catch (e) {
    console.error("[api/admin/municipalities POST]", e);
    return nextJsonError();
  }
}
