import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
import { requireSettingsEdit } from "@/lib/require-permission-api";

export const dynamic = "force-dynamic";

export type ContactSourceRow = {
  id: string;
  name: string;
};

export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { supabase } = crm;
    const denied = await requireSettingsEdit(crm);
    if (denied) return denied;
    const { data, error } = await supabase
      .from("contact_sources")
      .select("id, name")
      .order("name", { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ sources: (data ?? []) as ContactSourceRow[] });
  } catch (e) {
    console.error("[api/admin/contact-sources GET]", e);
    return nextJsonError();
  }
}

export async function POST(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { supabase } = crm;
    const denied = await requireSettingsEdit(crm);
    if (denied) return denied;
    const body = (await request.json()) as { name?: string };
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Υποχρεωτικό όνομα" }, { status: 400 });
    }
    const { data, error } = await supabase.from("contact_sources").insert({ name }).select("id, name").single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ source: data as ContactSourceRow });
  } catch (e) {
    console.error("[api/admin/contact-sources POST]", e);
    return nextJsonError();
  }
}
