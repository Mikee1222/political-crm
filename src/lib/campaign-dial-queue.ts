import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Επόμενες N ανατεθειμένες επαφές χωρίς εγγραφή σε `calls` για αυτή την καμπάνια.
 */
export async function getNextUncalledContactIds(
  supabase: SupabaseClient,
  campaignId: string,
  limit: number,
): Promise<{ contactIds: string[]; error: string | null }> {
  const cap = Math.min(50, Math.max(1, Math.floor(limit)));
  const { data: assigned, error: aErr } = await supabase
    .from("campaign_contacts")
    .select("contact_id")
    .eq("campaign_id", campaignId)
    .order("added_at", { ascending: true });
  if (aErr) return { contactIds: [], error: aErr.message };
  const ordered = (assigned ?? [])
    .map((r: { contact_id: string }) => r.contact_id)
    .filter(Boolean) as string[];
  if (ordered.length === 0) {
    return { contactIds: [], error: "Η καμπάνια δεν έχει ανατεθειμένες επαφές" };
  }

  const { data: callRows, error: cErr } = await supabase
    .from("calls")
    .select("contact_id")
    .eq("campaign_id", campaignId);
  if (cErr) return { contactIds: [], error: cErr.message };
  const called = new Set(
    (callRows ?? [])
      .map((r: { contact_id: string | null }) => r.contact_id)
      .filter(Boolean) as string[],
  );

  const out: string[] = [];
  for (const id of ordered) {
    if (!called.has(id)) {
      out.push(id);
      if (out.length >= cap) break;
    }
  }
  return { contactIds: out, error: null };
}

/**
 * Next assigned contact in campaign order that has no row in `calls` for this campaign.
 */
export async function getNextUncalledContactId(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<{ contactId: string | null; error: string | null }> {
  const { contactIds, error } = await getNextUncalledContactIds(supabase, campaignId, 1);
  return { contactId: contactIds[0] ?? null, error };
}
