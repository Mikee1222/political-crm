import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { nextJsonError } from "@/lib/api-resilience";
import type { CampaignTypeRow } from "@/lib/campaign-types";
export const dynamic = "force-dynamic";

const HEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

export async function POST(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    if (crm.profile?.role !== "admin") {
      return forbidden();
    }
    const body = (await request.json()) as {
      name?: string;
      description?: string | null;
      retell_agent_id?: string | null;
      color?: string;
    };
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Υποχρεωτικό όνομα" }, { status: 400 });
    }
    const color = (body.color && String(body.color).trim()) || "#003476";
    if (!HEX.test(color)) {
      return NextResponse.json({ error: "Άκυρο χρώμα" }, { status: 400 });
    }
    const description =
      body.description === undefined || body.description === null
        ? null
        : String(body.description).trim() || null;
    const retell_agent_id =
      body.retell_agent_id === undefined || body.retell_agent_id === null
        ? null
        : String(body.retell_agent_id).trim() || null;

    const { data, error } = await crm.supabase
      .from("campaign_types")
      .insert({ name, description, retell_agent_id, color })
      .select("id, name, description, retell_agent_id, color, created_at")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ type: data as CampaignTypeRow });
  } catch (e) {
    console.error("[api/admin/campaign-types POST]", e);
    return nextJsonError();
  }
}
