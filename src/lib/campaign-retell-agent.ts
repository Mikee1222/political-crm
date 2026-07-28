import type { SupabaseClient } from "@supabase/supabase-js";

/** Agent id για Retell κλήσεις: από την καμπάνια, αλλιώς RETELL_AGENT_ID. */
export async function getRetellAgentIdForCampaign(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("campaigns")
    .select("retell_agent_id")
    .eq("id", campaignId)
    .maybeSingle();
  if (error || !data) {
    return (process.env.RETELL_AGENT_ID ?? "").trim() || null;
  }
  const id = String((data as { retell_agent_id?: string | null }).retell_agent_id ?? "").trim();
  if (id) return id;
  return (process.env.RETELL_AGENT_ID ?? "").trim() || null;
}

/** Resolve display name from `retell_agents` catalog (falls back to agent id). */
export async function resolveRetellAgentName(
  supabase: SupabaseClient,
  agentId: string | null | undefined,
): Promise<{ agent_id: string | null; agent_name: string | null }> {
  const id = (agentId ?? "").trim() || null;
  if (!id) return { agent_id: null, agent_name: null };
  const { data } = await supabase
    .from("retell_agents")
    .select("agent_id, name")
    .eq("agent_id", id)
    .maybeSingle();
  const row = data as { agent_id?: string; name?: string } | null;
  if (row?.name?.trim()) {
    return { agent_id: id, agent_name: row.name.trim() };
  }
  return { agent_id: id, agent_name: id };
}

export async function getRetellAgentInfoForCampaign(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<{ agent_id: string | null; agent_name: string | null }> {
  const agentId = await getRetellAgentIdForCampaign(supabase, campaignId);
  return resolveRetellAgentName(supabase, agentId);
}
