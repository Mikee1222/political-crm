import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { nextJsonError } from "@/lib/api-resilience";
import type { ContactGroupRow } from "@/lib/contact-groups";
export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export async function PUT(request: NextRequest, { params }: Ctx) {
  try {
    const { user, profile, supabase } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    if (profile?.role !== "admin") {
      return forbidden();
    }
    const id = params.id;
    if (!id) {
      return NextResponse.json({ error: "Άκυρο" }, { status: 400 });
    }
    const body = (await request.json()) as {
      name?: string;
      color?: string;
      year?: number | null;
      description?: string | null;
    };
    const patch: Record<string, unknown> = {};
    if (body.name != null) patch.name = String(body.name).trim();
    if (patch.name === "") {
      return NextResponse.json({ error: "Άκυρο όνομα" }, { status: 400 });
    }
    if (body.color != null) patch.color = String(body.color).trim() || "#003476";
    if (body.description !== undefined) {
      patch.description = body.description != null && String(body.description).trim() ? String(body.description).trim() : null;
    }
    if (body.year !== undefined) {
      if (body.year == null || body.year === ("" as unknown)) patch.year = null;
      else {
        const y = Number(body.year);
        patch.year = Number.isFinite(y) ? y : null;
      }
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Κενό" }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("contact_groups")
      .update(patch)
      .eq("id", id)
      .select("id, name, color, year, description, created_at")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ group: data as ContactGroupRow });
  } catch (e) {
    console.error("[api/groups/id PUT]", e);
    return nextJsonError();
  }
}

export async function DELETE(_: NextRequest, { params }: Ctx) {
  try {
    const { user, profile, supabase } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    if (profile?.role !== "admin") {
      return forbidden();
    }
    const id = params.id;
    if (!id) {
      return NextResponse.json({ error: "Άκυρο" }, { status: 400 });
    }
    const { error } = await supabase.from("contact_groups").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/groups/id DELETE]", e);
    return nextJsonError();
  }
}
