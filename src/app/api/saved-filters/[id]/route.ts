import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { user, profile, supabase } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    if (!hasMinRole(profile?.role, "admin")) {
      return forbidden();
    }
    const body = (await request.json()) as {
      name?: string;
      description?: string;
      filters?: unknown;
    };
    const update: Record<string, unknown> = {};
    if (body.name != null) update.name = String(body.name).trim();
    if (body.description !== undefined) {
      update.description = body.description == null || body.description === "" ? null : String(body.description);
    }
    if (body.filters != null) {
      if (typeof body.filters !== "object" || Array.isArray(body.filters)) {
        return NextResponse.json({ error: "Μη έγκυρα φίλτρα" }, { status: 400 });
      }
      update.filters = body.filters;
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Κενό αίτημα" }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("saved_filters")
      .update(update)
      .eq("id", id)
      .select("id, name, description, filters, created_at, created_by")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ saved_filter: data });
  } catch (e) {
    console.error("[api/saved-filters PATCH]", e);
    return nextJsonError();
  }
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { user, profile, supabase } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    if (!hasMinRole(profile?.role, "admin")) {
      return forbidden();
    }
    const { error } = await supabase.from("saved_filters").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/saved-filters DELETE]", e);
    return nextJsonError();
  }
}
