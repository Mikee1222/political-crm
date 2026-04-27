import type { SupabaseClient } from "@supabase/supabase-js";
import { getContactIdsForNameDay } from "@/lib/nameday-celebrating";
import { todayYmdAthens } from "@/lib/athens-ranges";

export type ScoreBreakdown = { points: number; reason: string };

export type PredictiveRow = {
  rank: number;
  contact_id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  municipality: string | null;
  score: number;
  breakdown: ScoreBreakdown[];
};

function phoneDigits(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000));
}

function parseYmdAthens(ymd: string): { month: number; day: number } {
  const [, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
  return { month: m, day: d };
}

/**
 * Σκορ και εξήγηση για «έξυπνη» λίστα κλήσεων (σήμερα).
 */
export async function buildPredictiveCallList(
  supabase: SupabaseClient,
  options?: { skipContactIds?: Set<string> },
): Promise<PredictiveRow[]> {
  const ymd = todayYmdAthens();
  const { month, day } = parseYmdAthens(ymd);
  const celebrating = new Set(await getContactIdsForNameDay(supabase, month, day));

  const { data: contacts, error: cErr } = await supabase
    .from("contacts")
    .select(
      "id, first_name, last_name, phone, municipality, priority, call_status, name_day, birthday, last_contacted_at",
    );
  if (cErr) {
    console.error("[predictive]", cErr.message);
    return [];
  }

  const { data: callRows, error: callErr } = await supabase
    .from("calls")
    .select("contact_id, called_at");
  if (callErr) {
    console.error("[predictive calls]", callErr.message);
  }
  const lastCallByContact = new Map<string, string>();
  for (const r of (callRows ?? []) as { contact_id: string; called_at: string | null }[]) {
    if (!r.called_at) continue;
    const cur = lastCallByContact.get(r.contact_id);
    if (!cur || r.called_at > cur) {
      lastCallByContact.set(r.contact_id, r.called_at);
    }
  }

  const now = new Date();
  const out: PredictiveRow[] = [];

  for (const c of (contacts ?? []) as Array<{
    id: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    municipality: string | null;
    priority: string | null;
    call_status: string | null;
    name_day: string | null;
    birthday: string | null;
    last_contacted_at: string | null;
  }>) {
    if (options?.skipContactIds?.has(c.id)) continue;

    const p = phoneDigits(c.phone);
    if (!p || p.length < 10) continue;

    const breakdown: ScoreBreakdown[] = [];
    let score = 0;

    if (celebrating.has(c.id)) {
      breakdown.push({ points: 50, reason: "Γιορτάζει σήμερα" });
      score += 50;
    }

    const pr = c.priority ?? "Medium";
    if (pr === "High") {
      breakdown.push({ points: 30, reason: "Προτεραιότητα υψηλή" });
      score += 30;
    } else if (pr === "Medium") {
      breakdown.push({ points: 15, reason: "Μεσαία προτεραιότητα" });
      score += 15;
    } else {
      breakdown.push({ points: 5, reason: "Χαμηλή προτεραιότητα" });
      score += 5;
    }

    const lastIso = lastCallByContact.get(c.id) ?? c.last_contacted_at;
    if (!lastIso) {
      breakdown.push({ points: 20, reason: "Ποτέ κλήση" });
      score += 20;
    } else {
      const dLast = new Date(lastIso);
      if (!Number.isNaN(dLast.getTime())) {
        const d = daysBetween(now, dLast);
        if (d > 90) {
          breakdown.push({ points: 15, reason: "Τελευταία κλήση > 90 ημέρες" });
          score += 15;
        } else if (d > 30) {
          breakdown.push({ points: 10, reason: "Τελευταία κλήση > 30 ημέρες" });
          score += 10;
        }
      }
    }

    const st = c.call_status ?? "Pending";
    if (st === "Pending") {
      breakdown.push({ points: 10, reason: "Κατάσταση: Αναμονή" });
      score += 10;
    } else if (st === "Negative") {
      breakdown.push({ points: -20, reason: "Κατάσταση: Αρνητική" });
      score += -20;
    }

    out.push({
      rank: 0,
      contact_id: c.id,
      first_name: c.first_name,
      last_name: c.last_name,
      phone: c.phone,
      municipality: c.municipality,
      score,
      breakdown,
    });
  }

  out.sort((a, b) => b.score - a.score);
  const top = out.slice(0, 50);
  return top.map((r, i) => ({ ...r, rank: i + 1 }));
}
