import type { SupabaseClient } from "@supabase/supabase-js";

type OutcomeStats = { total: number; positive: number; negative: number; noAnswer: number };

export function tallyOutcomes(
  callRows: Array<{ outcome: string | null; contact_id?: string }>,
): OutcomeStats {
  const total = callRows.length;
  const positive = callRows.filter((c) => c.outcome === "Positive").length;
  const negative = callRows.filter((c) => c.outcome === "Negative").length;
  const noAnswer = callRows.filter((c) => c.outcome === "No Answer").length;
  return { total, positive, negative, noAnswer };
}

export async function getCampaignRollup(
  supabase: SupabaseClient,
  campaignId: string,
) {
  const { data: callRows } = await supabase
    .from("calls")
    .select("outcome, contact_id")
    .eq("campaign_id", campaignId);
  const calls = (callRows ?? []) as Array<{ outcome: string | null; contact_id: string }>;
  const stats = tallyOutcomes(calls);
  const distinctContactIds = new Set(calls.map((c) => c.contact_id).filter(Boolean));
  const callsMade = distinctContactIds.size;

  const { count: assigned, error: assignErr } = await supabase
    .from("campaign_contacts")
    .select("contact_id", { count: "exact", head: true })
    .eq("campaign_id", campaignId);
  if (assignErr) {
    return { stats, callsMade, assignedCount: 0, progress: 0 };
  }
  const assignedCount = assigned ?? 0;
  const progress =
    assignedCount > 0 ? Math.min(100, (callsMade / assignedCount) * 100) : 0;
  return { stats, callsMade, assignedCount, progress };
}
