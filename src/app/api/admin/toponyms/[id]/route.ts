import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { nextJsonError } from "@/lib/api-resilience";
import type { ToponymRow } from "@/app/api/geo/toponyms/route";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (profile?.role !== "admin") {
      return forbidden();
    }
    const body = (await request.json()) as {
      name?: string;
      municipality_id?: string;
      electoral_district_id?: string | null;
    };
    const patch: Record<string, string | null> = {};
    if (body.name != null) {
      const n = String(body.name).trim();
      if (!n) {
        return NextResponse.json({ error: "Κενό όνομα" }, { status: 400 });
      }
      patch.name = n;
    }
    if (body.municipality_id != null) {
      const m = String(body.municipality_id).trim();
      if (!m) {
        return NextResponse.json({ error: "Άκυρος δήμος" }, { status: 400 });
      }
      patch.municipality_id = m;
    }
    if (body.electoral_district_id !== undefined) {
      patch.electoral_district_id =
        body.electoral_district_id == null || String(body.electoral_district_id).trim() === ""
          ? null
          : String(body.electoral_district_id).trim();
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Κενό" }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("toponyms")
      .update(patch)
      .eq("id", params.id)
      .select("id, name, municipality_id, electoral_district_id, created_at")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ row: data as ToponymRow });
  } catch (e) {
    console.error("[api/admin/toponyms PATCH]", e);
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
    const { error } = await supabase.from("toponyms").delete().eq("id", params.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/admin/toponyms DELETE]", e);
    return nextJsonError();
  }
}
