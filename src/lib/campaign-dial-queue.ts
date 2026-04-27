import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Next assigned contact in campaign order that has no row in `calls` for this campaign.
 */
export async function getNextUncalledContactId(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<{ contactId: string | null; error: string | null }> {
  const { data: assigned, error: aErr } = await supabase
    .from("campaign_contacts")
    .select("contact_id")
    .eq("campaign_id", campaignId)
    .order("added_at", { ascending: true });
  if (aErr) return { contactId: null, error: aErr.message };
  const ordered = (assigned ?? [])
    .map((r: { contact_id: string }) => r.contact_id)
    .filter(Boolean) as string[];
  if (ordered.length === 0) {
    return { contactId: null, error: "Η καμπάνια δεν έχει ανατεθειμένες επαφές" };
  }

  const { data: callRows, error: cErr } = await supabase
    .from("calls")
    .select("contact_id")
    .eq("campaign_id", campaignId);
  if (cErr) return { contactId: null, error: cErr.message };
  const called = new Set(
    (callRows ?? [])
      .map((r: { contact_id: string | null }) => r.contact_id)
      .filter(Boolean) as string[],
  );

  for (const id of ordered) {
    if (!called.has(id)) {
      return { contactId: id, error: null };
    }
  }
  return { contactId: null, error: null };
}
