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
