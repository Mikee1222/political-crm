import type { SupabaseClient } from "@supabase/supabase-js";
import { contactHasAnyCampaignPhone } from "@/lib/campaign-contact-phone";
import {
  formatDateInEuropeAthens,
  hourInEuropeAthens,
  isSameEuropeAthensCalendarDay,
} from "@/lib/campaign-athens-day";
import { parseInstant } from "@/lib/date-format";
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

export type CallAnalyticsRow = {
  called_at: string | null;
  outcome: string | null;
};

export type CampaignAnalyticsPayload = {
  calls_per_hour_today: Array<{ hour: number; label: string; count: number }>;
  outcome_distribution: Array<{
    key: string;
    name: string;
    value: number;
    pct: number;
  }>;
  cumulative_by_day: Array<{
    date: string;
    label: string;
    count: number;
    cumulative: number;
  }>;
  comparison: {
    this_success_rate: number | null;
    avg_success_rate: number | null;
    this_answer_rate: number | null;
    avg_answer_rate: number | null;
  };
  multi_day: boolean;
};

function successRate(stats: OutcomeStats): number | null {
  if (stats.total <= 0) return null;
  return Math.round((stats.positive / stats.total) * 1000) / 10;
}

function answerRate(stats: OutcomeStats): number | null {
  if (stats.total <= 0) return null;
  const answered = stats.positive + stats.negative;
  return Math.round((answered / stats.total) * 1000) / 10;
}

/** Build chart aggregates from call rows (Athens calendar day / hour). */
export function buildCampaignAnalytics(
  thisCalls: CallAnalyticsRow[],
  otherCampaignStats: OutcomeStats[],
): CampaignAnalyticsPayload {
  const thisStats = tallyOutcomes(thisCalls);
  const hourCounts = new Array<number>(24).fill(0);
  const dayMap = new Map<string, number>();

  for (const row of thisCalls) {
    if (isSameEuropeAthensCalendarDay(row.called_at)) {
      const h = hourInEuropeAthens(row.called_at);
      if (h >= 0 && h < 24) hourCounts[h] = (hourCounts[h] ?? 0) + 1;
    }
    if (row.called_at) {
      const parsed = parseInstant(row.called_at);
      if (parsed) {
        const day = formatDateInEuropeAthens(parsed);
        dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
      }
    }
  }

  const calls_per_hour_today = hourCounts.map((count, hour) => ({
    hour,
    label: `${String(hour).padStart(2, "0")}:00`,
    count,
  }));

  const outcomeBuckets: Array<{ key: string; name: string; value: number }> = [
    { key: "positive", name: "Συνδέθηκε με ΚΚ", value: thisStats.positive },
    { key: "negative", name: "Δεν ήθελε", value: thisStats.negative },
    { key: "no_answer", name: "Δεν απάντησε", value: thisStats.noAnswer },
  ];
  const concluded = outcomeBuckets.reduce((a, b) => a + b.value, 0);
  const outcome_distribution = outcomeBuckets.map((b) => ({
    ...b,
    pct: concluded > 0 ? Math.round((b.value / concluded) * 1000) / 10 : 0,
  }));

  const daysSorted = [...dayMap.keys()].sort();
  let running = 0;
  const cumulative_by_day = daysSorted.map((date) => {
    const count = dayMap.get(date) ?? 0;
    running += count;
    const [, m, d] = date.split("-");
    return {
      date,
      label: `${d}/${m}`,
      count,
      cumulative: running,
    };
  });

  const otherRates = otherCampaignStats
    .filter((s) => s.total > 0)
    .map((s) => ({ success: successRate(s)!, answer: answerRate(s)! }));
  const avg = (vals: number[]) =>
    vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;

  return {
    calls_per_hour_today,
    outcome_distribution,
    cumulative_by_day,
    comparison: {
      this_success_rate: successRate(thisStats),
      avg_success_rate: avg(otherRates.map((r) => r.success)),
      this_answer_rate: answerRate(thisStats),
      avg_answer_rate: avg(otherRates.map((r) => r.answer)),
    },
    multi_day: cumulative_by_day.length > 1,
  };
}

export async function getCampaignAnalytics(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<CampaignAnalyticsPayload> {
  const { rows: thisCalls, error } = await fetchRowsInBatches<CallAnalyticsRow>((from, to) =>
    supabase
      .from("calls")
      .select("called_at, outcome")
      .eq("campaign_id", campaignId)
      .order("called_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  const calls = error ? [] : thisCalls;

  const { data: otherCamps } = await supabase
    .from("campaigns")
    .select("id")
    .neq("id", campaignId)
    .limit(40);

  const otherIds = ((otherCamps ?? []) as Array<{ id: string }>).map((c) => c.id);
  const otherStats: OutcomeStats[] = [];
  for (const oid of otherIds.slice(0, 20)) {
    const { rows } = await fetchRowsInBatches<{ outcome: string | null }>((from, to) =>
      supabase
        .from("calls")
        .select("outcome")
        .eq("campaign_id", oid)
        .order("id", { ascending: true })
        .range(from, to),
    );
    otherStats.push(tallyOutcomes(rows));
  }

  return buildCampaignAnalytics(calls, otherStats);
}
