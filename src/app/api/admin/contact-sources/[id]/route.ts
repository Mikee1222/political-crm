import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
import type { ContactSourceRow } from "../route";
import { requireSettingsEdit } from "@/lib/require-permission-api";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function PUT(request: NextRequest, { params }: Ctx) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { supabase } = crm;
    const denied = await requireSettingsEdit(crm);
    if (denied) return denied;
    const id = params.id;
    if (!id) {
      return NextResponse.json({ error: "Άκυρο" }, { status: 400 });
    }
    const body = (await request.json()) as { name?: string };
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Υποχρεωτικό όνομα" }, { status: 400 });
    }
    const { data, error } = await supabase.from("contact_sources").update({ name }).eq("id", id).select("id, name").single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ source: data as ContactSourceRow });
  } catch (e) {
    console.error("[api/admin/contact-sources id PUT]", e);
    return nextJsonError();
  }
}

export async function DELETE(_: NextRequest, { params }: Ctx) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { supabase } = crm;
    const denied = await requireSettingsEdit(crm);
    if (denied) return denied;
    const id = params.id;
    if (!id) {
      return NextResponse.json({ error: "Άκυρο" }, { status: 400 });
    }
    await supabase.from("contact_source_members").delete().eq("source_id", id);
    const { error } = await supabase.from("contact_sources").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/admin/contact-sources id DELETE]", e);
    return nextJsonError();
  }
}
