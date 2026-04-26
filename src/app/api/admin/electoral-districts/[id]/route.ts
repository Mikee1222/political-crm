import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { nextJsonError } from "@/lib/api-resilience";
import type { ElectoralDistrictRow } from "@/app/api/geo/electoral-districts/route";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { user, profile, supabase } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    if (profile?.role !== "admin") {
      return forbidden();
    }
    const body = (await request.json()) as { name?: string; municipality_id?: string };
    const patch: Record<string, string> = {};
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
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Κενό" }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("electoral_districts")
      .update(patch)
      .eq("id", params.id)
      .select("id, name, municipality_id, created_at")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ row: data as ElectoralDistrictRow });
  } catch (e) {
    console.error("[api/admin/electoral-districts PATCH]", e);
    return nextJsonError();
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { user, profile, supabase } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    if (profile?.role !== "admin") {
      return forbidden();
    }
    const { error } = await supabase.from("electoral_districts").delete().eq("id", params.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/admin/electoral-districts DELETE]", e);
    return nextJsonError();
  }
}
