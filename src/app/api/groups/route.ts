import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
import { dedupeContactGroupsById, type ContactGroupRow } from "@/lib/contact-groups";
import { requireSettingsEdit } from "@/lib/require-permission-api";
export const dynamic = 'force-dynamic';

export type { ContactGroupRow } from "@/lib/contact-groups";

export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { supabase } = crm;
    const { data, error } = await supabase
      .from("contact_groups")
      .select("id, name, color, category, year, description, created_at")
      .order("category", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const rows = (data ?? []) as ContactGroupRow[];
    const unique = dedupeContactGroupsById(rows);
    return NextResponse.json({ groups: unique });
  } catch (e) {
    console.error("[api/groups GET]", e);
    return nextJsonError();
  }
}

export async function POST(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const denied = await requireSettingsEdit(crm);
    if (denied) return denied;
    const { supabase } = crm;
    const body = (await request.json()) as {
      name?: string;
      color?: string;
      year?: number | null;
      description?: string | null;
    };
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Υποχρεωτικό όνομα" }, { status: 400 });
    }
    const color = (body.color && String(body.color).trim()) || "#003476";
    const rawY = body.year as unknown;
    let year: number | null = null;
    if (rawY != null && String(rawY).trim() !== "") {
      const n = Number(rawY);
      if (Number.isFinite(n)) year = n;
    }
    const description = body.description != null && String(body.description).trim() ? String(body.description).trim() : null;
    const { data, error } = await supabase
      .from("contact_groups")
      .insert({
        name,
        color,
        year,
        description,
      })
      .select("id, name, color, category, year, description, created_at")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ group: data as ContactGroupRow });
  } catch (e) {
    console.error("[api/groups POST]", e);
    return nextJsonError();
  }
}
