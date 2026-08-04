import type { SupabaseClient } from "@supabase/supabase-js";
import { RETELL_OUTCOME_NO_ANSWER } from "@/lib/retell-call-outcomes";

export type PendingCallInsertResult = {
  id: string | null;
  error: { message: string } | null;
};

/**
 * Insert a campaign call row as Pending **before** Retell create-phone-call
 * so dial-queue / webhooks can track the attempt even if Retell fails mid-flight.
 */
export async function insertPendingCampaignCall(
  supabase: SupabaseClient,
  contactId: string,
  campaignId: string,
  opts?: { retellCallId?: string | null },
): Promise<PendingCallInsertResult> {
  const { data, error } = await supabase
    .from("calls")
    .insert({
      contact_id: contactId,
      campaign_id: campaignId,
      called_at: new Date().toISOString(),
      outcome: "Pending",
      duration_seconds: null,
      transferred_to_politician: false,
      notes: null,
      retell_call_id: opts?.retellCallId ?? null,
    })
    .select("id")
    .single();

  if (error) {
    return { id: null, error: { message: error.message } };
  }
  const id = data && typeof (data as { id?: unknown }).id === "string" ? (data as { id: string }).id : null;
  return { id, error: null };
}

export async function attachRetellCallIdToPending(
  supabase: SupabaseClient,
  callRowId: string,
  retellCallId: string,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase
    .from("calls")
    .update({ retell_call_id: retellCallId })
    .eq("id", callRowId);
  return { error: error ? { message: error.message } : null };
}

/** Retell failed after Pending insert — do not leave the row stuck in Αναμονή. */
export async function markPendingCallFailed(
  supabase: SupabaseClient,
  callRowId: string,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase
    .from("calls")
    .update({
      outcome: RETELL_OUTCOME_NO_ANSWER,
      retell_call_id: null,
    })
    .eq("id", callRowId);
  return { error: error ? { message: error.message } : null };
}
