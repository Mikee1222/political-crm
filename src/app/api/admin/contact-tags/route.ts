import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { nextJsonError } from "@/lib/api-resilience";
import type { ContactTagDefinitionRow } from "@/lib/contact-tag-definitions";
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
      .from("contact_tag_definitions")
      .select("id, name, color, created_at")
      .order("name", { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ tags: (data ?? []) as ContactTagDefinitionRow[] });
  } catch (e) {
    console.error("[api/admin/contact-tags GET]", e);
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
    const body = (await request.json()) as { name?: string; color?: string };
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Υποχρεωτικό όνομα" }, { status: 400 });
    }
    const color = (body.color && String(body.color).trim()) || "#6B7280";
    if (!HEX.test(color)) {
      return NextResponse.json({ error: "Άκυρο χρώμα" }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("contact_tag_definitions")
      .insert({ name, color })
      .select("id, name, color, created_at")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ tag: data as ContactTagDefinitionRow });
  } catch (e) {
    console.error("[api/admin/contact-tags POST]", e);
    return nextJsonError();
  }
}
