import type { SupabaseClient } from "@supabase/supabase-js";

/** Μετά από επιτυχημένη εκκίνηση Retell για καμπάνια, ώστε getNextUndalled να μην ξαναδιαλέγει την ίδια επαφή. */
export function insertPendingCampaignCall(
  supabase: SupabaseClient,
  contactId: string,
  campaignId: string,
) {
  return supabase.from("calls").insert({
    contact_id: contactId,
    campaign_id: campaignId,
    called_at: new Date().toISOString(),
    outcome: "Pending",
    duration_seconds: null,
    transferred_to_politician: false,
    notes: null,
  });
}
