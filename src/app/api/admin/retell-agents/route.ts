import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { nextJsonError } from "@/lib/api-resilience";
import type { RetellAgentRow } from "@/lib/retell-agents";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    if (crm.profile?.role !== "admin") {
      return forbidden();
    }
    const { data, error } = await crm.supabase
      .from("retell_agents")
      .select("id, agent_id, name, description, created_at")
      .order("name", { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ agents: (data ?? []) as RetellAgentRow[] });
  } catch (e) {
    console.error("[api/admin/retell-agents GET]", e);
    return nextJsonError();
  }
}

export async function POST(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    if (crm.profile?.role !== "admin") {
      return forbidden();
    }
    const body = (await request.json()) as {
      agent_id?: string;
      name?: string;
      description?: string | null;
    };
    const agent_id = String(body.agent_id ?? "").trim();
    const name = String(body.name ?? "").trim();
    if (!agent_id || !name) {
      return NextResponse.json({ error: "Υποχρεωτικά agent_id και όνομα" }, { status: 400 });
    }
    const description =
      body.description === undefined || body.description === null
        ? null
        : String(body.description).trim() || null;
    const { data, error } = await crm.supabase
      .from("retell_agents")
      .insert({ agent_id, name, description })
      .select("id, agent_id, name, description, created_at")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ agent: data as RetellAgentRow });
  } catch (e) {
    console.error("[api/admin/retell-agents POST]", e);
    return nextJsonError();
  }
}
