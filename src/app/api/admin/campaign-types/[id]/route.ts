import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { nextJsonError } from "@/lib/api-resilience";
import type { CampaignTypeRow } from "@/lib/campaign-types";
export const dynamic = "force-dynamic";

const HEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

type Ctx = { params: { id: string } };

export async function PUT(request: NextRequest, { params }: Ctx) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    if (crm.profile?.role !== "admin") {
      return forbidden();
    }
    const id = params.id;
    if (!id) {
      return NextResponse.json({ error: "Άκυρο" }, { status: 400 });
    }
    const body = (await request.json()) as {
      name?: string;
      description?: string | null;
      retell_agent_id?: string | null;
      color?: string;
    };
    const patch: Record<string, unknown> = {};
    if (body.name != null) {
      const n = String(body.name).trim();
      if (!n) {
        return NextResponse.json({ error: "Υποχρεωτικό όνομα" }, { status: 400 });
      }
      patch.name = n;
    }
    if (body.description !== undefined) {
      patch.description =
        body.description === null ? null : String(body.description).trim() || null;
    }
    if (body.retell_agent_id !== undefined) {
      patch.retell_agent_id =
        body.retell_agent_id === null ? null : String(body.retell_agent_id).trim() || null;
    }
    if (body.color != null) {
      const c = String(body.color).trim() || "#003476";
      if (!HEX.test(c)) {
        return NextResponse.json({ error: "Άκυρο χρώμα" }, { status: 400 });
      }
      patch.color = c;
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Κενό" }, { status: 400 });
    }
    const { data, error } = await crm.supabase
      .from("campaign_types")
      .update(patch)
      .eq("id", id)
      .select("id, name, description, retell_agent_id, color, created_at")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ type: data as CampaignTypeRow });
  } catch (e) {
    console.error("[api/admin/campaign-types id PUT]", e);
    return nextJsonError();
  }
}

export async function DELETE(_: NextRequest, { params }: Ctx) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    if (crm.profile?.role !== "admin") {
      return forbidden();
    }
    const id = params.id;
    if (!id) {
      return NextResponse.json({ error: "Άκυρο" }, { status: 400 });
    }
    const { error } = await crm.supabase.from("campaign_types").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/admin/campaign-types id DELETE]", e);
    return nextJsonError();
  }
}
