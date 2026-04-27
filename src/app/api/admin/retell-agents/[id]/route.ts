import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { nextJsonError } from "@/lib/api-resilience";
import type { RetellAgentRow } from "@/lib/retell-agents";
export const dynamic = "force-dynamic";

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
      agent_id?: string;
      name?: string;
      description?: string | null;
    };
    const patch: Record<string, unknown> = {};
    if (body.agent_id != null) {
      const a = String(body.agent_id).trim();
      if (!a) {
        return NextResponse.json({ error: "Άκυρο agent_id" }, { status: 400 });
      }
      patch.agent_id = a;
    }
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
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Κενό" }, { status: 400 });
    }
    const { data, error } = await crm.supabase
      .from("retell_agents")
      .update(patch)
      .eq("id", id)
      .select("id, agent_id, name, description, created_at")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ agent: data as RetellAgentRow });
  } catch (e) {
    console.error("[api/admin/retell-agents id PUT]", e);
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
    const { error } = await crm.supabase.from("retell_agents").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/admin/retell-agents id DELETE]", e);
    return nextJsonError();
  }
}
