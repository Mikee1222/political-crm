import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { nextJsonError } from "@/lib/api-resilience";
import type { RequestCategoryRow } from "@/lib/request-categories";
export const dynamic = "force-dynamic";

const HEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

type Ctx = { params: { id: string } };

export async function PUT(request: NextRequest, { params }: Ctx) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (profile?.role !== "admin") {
      return forbidden();
    }
    const id = params.id;
    if (!id) {
      return NextResponse.json({ error: "Άκυρο" }, { status: 400 });
    }
    const body = (await request.json()) as { name?: string; color?: string; sort_order?: number | null };
    const patch: Record<string, unknown> = {};
    if (body.name != null) {
      const n = String(body.name).trim();
      if (!n) {
        return NextResponse.json({ error: "Υποχρεωτικό όνομα" }, { status: 400 });
      }
      patch.name = n;
    }
    if (body.color != null) {
      const c = String(body.color).trim() || "#6B7280";
      if (!HEX.test(c)) {
        return NextResponse.json({ error: "Άκυρο χρώμα" }, { status: 400 });
      }
      patch.color = c;
    }
    if (body.sort_order !== undefined) {
      patch.sort_order = body.sort_order == null ? 0 : Number(body.sort_order);
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Κενό" }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("request_categories")
      .update(patch)
      .eq("id", id)
      .select("id, name, color, sort_order, created_at")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ category: data as RequestCategoryRow });
  } catch (e) {
    console.error("[api/admin/request-categories id PUT]", e);
    return nextJsonError();
  }
}

export async function DELETE(_: NextRequest, { params }: Ctx) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (profile?.role !== "admin") {
      return forbidden();
    }
    const id = params.id;
    if (!id) {
      return NextResponse.json({ error: "Άκυρο" }, { status: 400 });
    }
    const { error } = await supabase.from("request_categories").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/admin/request-categories id DELETE]", e);
    return nextJsonError();
  }
}
