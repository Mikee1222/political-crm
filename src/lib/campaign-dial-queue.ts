import type { SupabaseClient } from "@supabase/supabase-js";
import { contactHasAnyCampaignPhone } from "@/lib/campaign-contact-phone";
import { isNoAnswerRetellOutcome } from "@/lib/retell-call-outcomes";
import { fetchAllCampaignContactPhoneRows } from "@/lib/campaign-stats";
import { fetchRowsInBatches } from "@/lib/supabase-batch";

type AssignedPhoneRow = {
  contact_id: string;
  contacts:
    | { phone: string | null; phone2: string | null; landline: string | null }
    | { phone: string | null; phone2: string | null; landline: string | null }[]
    | null;
};

function unwrapContact(
  c: AssignedPhoneRow["contacts"],
): { phone: string | null; phone2: string | null; landline: string | null } | null {
  if (!c) return null;
  return Array.isArray(c) ? c[0] ?? null : c;
}

async function fetchAllCampaignCallOutcomes(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<{ rows: Array<{ contact_id: string | null; outcome: string | null }>; error: string | null }> {
  return fetchRowsInBatches((from, to) =>
    supabase
      .from("calls")
      .select("contact_id, outcome")
      .eq("campaign_id", campaignId)
      .order("id", { ascending: true })
      .range(from, to),
  );
}

/**
 * Επόμενες N ανατεθειμένες επαφές χωρίς εγγραφή σε `calls` για αυτή την καμπάνια.
 * Παραλείπει επαφές χωρίς phone/phone2/landline.
 *
 * `redialNoAnswer`: συμπεριλαμβάνει επαφές των οποίων όλες οι κλήσεις είναι «Δεν απάντησε»
 * (ώστε να ξανακληθούν μετά από Επανεκκίνηση χωρίς διαγραφή ιστορικού).
 */
export async function getNextUncalledContactIds(
  supabase: SupabaseClient,
  campaignId: string,
  limit: number,
  opts?: { redialNoAnswer?: boolean },
): Promise<{ contactIds: string[]; error: string | null }> {
  const cap = Math.min(50, Math.max(1, Math.floor(limit)));
  const redialNoAnswer = opts?.redialNoAnswer === true;

  const { rows: assigned, error: aErr } = await fetchAllCampaignContactPhoneRows(supabase, campaignId);
  if (aErr) return { contactIds: [], error: aErr };

  const orderedWithPhone: string[] = [];
  for (const row of assigned) {
    const id = row.contact_id;
    if (!id) continue;
    const contact = unwrapContact(row.contacts);
    if (!contactHasAnyCampaignPhone(contact)) continue;
    orderedWithPhone.push(id);
  }

  if (orderedWithPhone.length === 0) {
    return { contactIds: [], error: "Η καμπάνια δεν έχει ανατεθειμένες επαφές με αριθμό" };
  }

  const { rows: callRows, error: cErr } = await fetchAllCampaignCallOutcomes(supabase, campaignId);
  if (cErr) return { contactIds: [], error: cErr };

  const byContact = new Map<string, string[]>();
  for (const r of callRows) {
    if (!r.contact_id) continue;
    const list = byContact.get(r.contact_id) ?? [];
    list.push(r.outcome ?? "");
    byContact.set(r.contact_id, list);
  }

  const isEligible = (contactId: string): boolean => {
    const outcomes = byContact.get(contactId);
    if (!outcomes || outcomes.length === 0) return true;
    if (outcomes.some((o) => o === "Pending" || o === "Αναμονή")) return false;
    if (redialNoAnswer) {
      // Eligible if every concluded outcome is no-answer (no positive/negative yet)
      return outcomes.every((o) => isNoAnswerRetellOutcome(o));
    }
    return false;
  };

  const out: string[] = [];
  for (const id of orderedWithPhone) {
    if (isEligible(id)) {
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

/** Contact IDs in campaign whose latest/all outcomes are no-answer (with phone). */
export async function getNoAnswerContactIds(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<{ contactIds: string[]; error: string | null }> {
  const { rows: assigned, error: aErr } = await fetchAllCampaignContactPhoneRows(supabase, campaignId);
  if (aErr) return { contactIds: [], error: aErr };

  const withPhone = new Set<string>();
  for (const row of assigned) {
    if (!row.contact_id) continue;
    if (contactHasAnyCampaignPhone(unwrapContact(row.contacts))) {
      withPhone.add(row.contact_id);
    }
  }

  const { rows: callRows, error: cErr } = await fetchAllCampaignCallOutcomes(supabase, campaignId);
  if (cErr) return { contactIds: [], error: cErr };

  const byContact = new Map<string, string[]>();
  for (const r of callRows) {
    if (!r.contact_id || !withPhone.has(r.contact_id)) continue;
    const list = byContact.get(r.contact_id) ?? [];
    list.push(r.outcome ?? "");
    byContact.set(r.contact_id, list);
  }

  const out: string[] = [];
  for (const [cid, outcomes] of byContact) {
    if (outcomes.some((o) => o === "Pending" || o === "Αναμονή")) continue;
    if (outcomes.length > 0 && outcomes.every((o) => isNoAnswerRetellOutcome(o))) {
      out.push(cid);
    }
  }
  return { contactIds: out, error: null };
}
