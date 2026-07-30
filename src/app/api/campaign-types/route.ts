import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
import type { CampaignTypeRow } from "@/lib/campaign-types";
import { formatRetellAgentDisplay } from "@/lib/campaign-retell-agent";
export const dynamic = "force-dynamic";

/** Λίστα τύπων καμπάνιας (dropdown δημιουργίας καμπάνιας — manager+). */
export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    if (!hasMinRole(crm.profile?.role, "manager")) {
      return forbidden();
    }
    const { data, error } = await crm.supabase
      .from("campaign_types")
      .select("id, name, description, retell_agent_id, color, created_at")
      .order("name", { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const rows = (data ?? []) as CampaignTypeRow[];
    const agentIds = [
      ...new Set(
        rows
          .map((r) => String(r.retell_agent_id ?? "").trim())
          .filter(Boolean),
      ),
    ];
    const nameById = new Map<string, string>();
    if (agentIds.length > 0) {
      const { data: agents } = await crm.supabase
        .from("retell_agents")
        .select("agent_id, name")
        .in("agent_id", agentIds);
      for (const a of (agents ?? []) as Array<{ agent_id: string; name: string }>) {
        if (a.agent_id && a.name?.trim()) nameById.set(a.agent_id, a.name.trim());
      }
    }

    const types: CampaignTypeRow[] = rows.map((r) => {
      const id = String(r.retell_agent_id ?? "").trim() || null;
      return {
        ...r,
        retell_agent_name: formatRetellAgentDisplay(id, id ? nameById.get(id) : null),
      };
    });

    return NextResponse.json({ types });
  } catch (e) {
    console.error("[api/campaign-types GET]", e);
    return nextJsonError();
  }
}
