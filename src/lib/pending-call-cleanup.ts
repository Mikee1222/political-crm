import type { SupabaseClient } from "@supabase/supabase-js";
import {
  RETELL_CALL_STATUS_NO_ANSWER,
  RETELL_OUTCOME_NO_ANSWER,
} from "@/lib/retell-call-outcomes";

export const PENDING_CALL_OUTCOMES = ["Pending", "Αναμονή"] as const;

export const PENDING_CONTACT_STATUSES = ["Pending", "Αναμονή"] as const;

/** Auto-resolve stuck pending when loading call history. */
export const PENDING_AUTO_CLEANUP_MS = 2 * 60 * 60 * 1000;

/** Admin «Καθαρισμός Pending» threshold. */
export const PENDING_ADMIN_CLEANUP_MS = 60 * 60 * 1000;

export type PendingCleanupResult = {
  cleaned: number;
  callIds: string[];
  contactCallStatusUpdated: boolean;
};

function isoOlderThan(ms: number, now = Date.now()): string {
  return new Date(now - ms).toISOString();
}

/**
 * Mark contact calls with Pending/Αναμονή older than `olderThanMs` as «Δεν απάντησε».
 * Updates contact `call_status` → «Δεν Απάντησε» when appropriate (Retell mapping).
 */
export async function cleanupStuckPendingCalls(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  contactId: string,
  olderThanMs: number,
  now = Date.now(),
): Promise<PendingCleanupResult> {
  const cutoff = isoOlderThan(olderThanMs, now);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from("calls")
    .select("id, called_at, outcome")
    .eq("contact_id", contactId)
    .in("outcome", [...PENDING_CALL_OUTCOMES])
    .lt("called_at", cutoff);

  const { data: rows, error } = await q;
  if (error) {
    throw new Error(error.message);
  }

  const list = (rows ?? []) as Array<{ id: string; called_at: string | null; outcome: string | null }>;
  if (!list.length) {
    return { cleaned: 0, callIds: [], contactCallStatusUpdated: false };
  }

  const callIds = list.map((r) => r.id);
  const { error: upErr } = await supabase
    .from("calls")
    .update({ outcome: RETELL_OUTCOME_NO_ANSWER })
    .in("id", callIds);
  if (upErr) {
    throw new Error(upErr.message);
  }

  const contactUpdated = await maybeUpdateContactCallStatusAfterCleanup(supabase, contactId);
  return { cleaned: callIds.length, callIds, contactCallStatusUpdated: contactUpdated };
}

/**
 * If contact is still Pending/Αναμονή and no pending calls remain → Δεν Απάντησε.
 */
export async function maybeUpdateContactCallStatusAfterCleanup(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  contactId: string,
): Promise<boolean> {
  const { data: contact, error: cErr } = await supabase
    .from("contacts")
    .select("id, call_status")
    .eq("id", contactId)
    .maybeSingle();
  if (cErr || !contact) return false;

  const st = String((contact as { call_status?: string | null }).call_status ?? "");
  if (!PENDING_CONTACT_STATUSES.includes(st as (typeof PENDING_CONTACT_STATUSES)[number])) {
    return false;
  }

  const { data: stillPending, error: pErr } = await supabase
    .from("calls")
    .select("id")
    .eq("contact_id", contactId)
    .in("outcome", [...PENDING_CALL_OUTCOMES])
    .limit(1);
  if (pErr) return false;
  if ((stillPending ?? []).length > 0) return false;

  const now = new Date().toISOString();
  const { error: uErr } = await supabase
    .from("contacts")
    .update({ call_status: RETELL_CALL_STATUS_NO_ANSWER, updated_at: now })
    .eq("id", contactId);
  return !uErr;
}
