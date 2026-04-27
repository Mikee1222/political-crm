import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { nextJsonError } from "@/lib/api-resilience";
import type { RequestCategoryRow } from "@/lib/request-categories";
export const dynamic = "force-dynamic";

const HEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (profile?.role !== "admin") {
      return forbidden();
    }
    const { data, error } = await supabase
      .from("request_categories")
      .select("id, name, color, sort_order, created_at")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ categories: (data ?? []) as RequestCategoryRow[] });
  } catch (e) {
    console.error("[api/admin/request-categories GET]", e);
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
    const body = (await request.json()) as { name?: string; color?: string; sort_order?: number };
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Υποχρεωτικό όνομα" }, { status: 400 });
    }
    const color = (body.color && String(body.color).trim()) || "#6B7280";
    if (!HEX.test(color)) {
      return NextResponse.json({ error: "Άκυρο χρώμα" }, { status: 400 });
    }
    const sort_order = typeof body.sort_order === "number" && Number.isFinite(body.sort_order) ? body.sort_order : 0;
    const { data, error } = await supabase
      .from("request_categories")
      .insert({ name, color, sort_order })
      .select("id, name, color, sort_order, created_at")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ category: data as RequestCategoryRow });
  } catch (e) {
    console.error("[api/admin/request-categories POST]", e);
    return nextJsonError();
  }
}
