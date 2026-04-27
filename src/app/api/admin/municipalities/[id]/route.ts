import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { nextJsonError } from "@/lib/api-resilience";
import type { MunicipalityRow } from "@/app/api/geo/municipalities/route";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (profile?.role !== "admin") {
      return forbidden();
    }
    const body = (await request.json()) as { name?: string; regional_unit?: string | null };
    const patch: Record<string, string | null> = {};
    if (body.name != null) patch.name = String(body.name).trim();
    if (patch.name === "") {
      return NextResponse.json({ error: "Κενό όνομα" }, { status: 400 });
    }
    if (body.regional_unit !== undefined) {
      patch.regional_unit = body.regional_unit == null || String(body.regional_unit).trim() === "" ? null : String(body.regional_unit).trim();
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Κενό" }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("municipalities")
      .update(patch)
      .eq("id", params.id)
      .select("id, name, regional_unit, created_at")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ row: data as MunicipalityRow });
  } catch (e) {
    console.error("[api/admin/municipalities PATCH]", e);
    return nextJsonError();
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (profile?.role !== "admin") {
      return forbidden();
    }
    const { error } = await supabase.from("municipalities").delete().eq("id", params.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/admin/municipalities DELETE]", e);
    return nextJsonError();
  }
}
