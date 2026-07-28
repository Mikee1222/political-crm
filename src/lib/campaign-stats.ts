import type { SupabaseClient } from "@supabase/supabase-js";
import { contactHasAnyCampaignPhone } from "@/lib/campaign-contact-phone";
import {
  isNegativeRetellOutcome,
  isNoAnswerRetellOutcome,
  isPositiveRetellOutcome,
} from "@/lib/retell-call-outcomes";
import { fetchRowsInBatches } from "@/lib/supabase-batch";

type OutcomeStats = { total: number; positive: number; negative: number; noAnswer: number };

export function tallyOutcomes(
  callRows: Array<{ outcome: string | null; contact_id?: string }>,
): OutcomeStats {
  const total = callRows.length;
  const positive = callRows.filter((c) => isPositiveRetellOutcome(c.outcome)).length;
  const negative = callRows.filter((c) => isNegativeRetellOutcome(c.outcome)).length;
  const noAnswer = callRows.filter((c) => isNoAnswerRetellOutcome(c.outcome)).length;
  return { total, positive, negative, noAnswer };
}

export type CampaignPhoneTotals = {
  withPhone: number;
  withoutPhone: number;
  assignedCount: number;
};

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

/** Load all campaign_contacts (+ nested phone fields), paginated past PostgREST 1000 cap. */
export async function fetchAllCampaignContactPhoneRows(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<{ rows: AssignedPhoneRow[]; error: string | null }> {
  return fetchRowsInBatches<AssignedPhoneRow>((from, to) =>
    supabase
      .from("campaign_contacts")
      .select("contact_id, contacts ( phone, phone2, landline )")
      .eq("campaign_id", campaignId)
      .order("added_at", { ascending: true })
      .order("contact_id", { ascending: true })
      .range(from, to),
  );
}

export async function getCampaignPhoneTotals(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<CampaignPhoneTotals> {
  const { rows: assigned, error } = await fetchAllCampaignContactPhoneRows(supabase, campaignId);
  if (error) {
    return { withPhone: 0, withoutPhone: 0, assignedCount: 0 };
  }
  let withPhone = 0;
  let withoutPhone = 0;
  for (const row of assigned) {
    if (contactHasAnyCampaignPhone(unwrapContact(row.contacts))) withPhone += 1;
    else withoutPhone += 1;
  }
  return {
    withPhone,
    withoutPhone,
    assignedCount: withPhone + withoutPhone,
  };
}

export async function getCampaignRollup(
  supabase: SupabaseClient,
  campaignId: string,
) {
  const { rows: callRows, error: callErr } = await fetchRowsInBatches<{
    outcome: string | null;
    contact_id: string;
    duration_seconds: number | null;
  }>((from, to) =>
    supabase
      .from("calls")
      .select("outcome, contact_id, duration_seconds")
      .eq("campaign_id", campaignId)
      .order("id", { ascending: true })
      .range(from, to),
  );
  const calls = callErr ? [] : callRows;
  const stats = tallyOutcomes(calls);
  const distinctContactIds = new Set(calls.map((c) => c.contact_id).filter(Boolean));
  const callsMade = distinctContactIds.size;

  const phoneTotals = await getCampaignPhoneTotals(supabase, campaignId);
  const dialable = phoneTotals.withPhone;
  const progress = dialable > 0 ? Math.min(100, (callsMade / dialable) * 100) : 0;

  const durations = calls
    .map((c) => c.duration_seconds)
    .filter((d): d is number => d != null && Number.isFinite(d) && d > 0);
  const avgDurationSec =
    durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null;

  const remaining = Math.max(0, dialable - callsMade);
  const concurrentHint = 1;
  const estimatedRemainingSec =
    avgDurationSec != null && remaining > 0
      ? Math.round((avgDurationSec * remaining) / concurrentHint)
      : remaining === 0
        ? 0
        : null;

  return {
    stats,
    callsMade,
    assignedCount: phoneTotals.assignedCount,
    withPhone: phoneTotals.withPhone,
    withoutPhone: phoneTotals.withoutPhone,
    /** @deprecated use withPhone — progress denominator excludes no-phone */
    contactTotal: phoneTotals.withPhone,
    progress,
    avgDurationSec,
    remaining,
    estimatedRemainingSec,
  };
}
