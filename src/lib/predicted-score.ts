import type { SupabaseClient } from "@supabase/supabase-js";

/** +10 όταν ΝΔ % > threshold σε εκλογικά δεδομένα 2023 */
const ND_PCT_BONUS = 38;

const ND_VARiants = (s: string) => {
  const t = s.trim();
  return (
    t === "ΝΔ" ||
    t.includes("Νέα Δημοκρατία") ||
    t.toLowerCase().includes("nd") ||
    t.includes("Nea Demokratia")
  );
};

export function computeScoreForContact(
  c: {
    call_status: string | null;
    political_stance: string | null;
    phone: string | null;
    age: number | null;
    influence: boolean | null;
    municipality: string | null;
  },
  hasCalls: boolean,
  ndByMuni: Map<string, number>,
): number {
  let s = 0;
  if ((c.call_status ?? "Pending") === "Pending") {
    s += 30;
  }
  const stance = (c.political_stance ?? "").trim();
  if (stance === "Κεντροδεξιός" || stance.includes("Κεντροδεξι")) {
    s += 25;
  }
  if (stance === "Αναποφάσιστος" || stance.includes("Αναποφάσισ")) {
    s += 20;
  }
  if (c.phone && c.phone.length >= 10) {
    s += 15;
  }
  if (hasCalls) {
    s += 10;
  }
  if (c.influence === true) {
    s += 20;
  }
  const age = c.age;
  if (age != null && age >= 30 && age <= 55) {
    s += 5;
  }
  const muni = c.municipality?.trim();
  if (muni) {
    const p = ndByMuni.get(muni);
    if (p != null && p >= ND_PCT_BONUS) {
      s += 10;
    }
  }
  return Math.max(0, Math.min(100, s));
}

export async function buildNdByMuniMap(
  supabase: SupabaseClient,
  year = 2023,
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("electoral_results")
    .select("municipality, party, percentage")
    .eq("year", year);
  const m = new Map<string, number>();
  if (error || !data) {
    return m;
  }
  for (const row of data as { municipality: string; party: string; percentage: number }[]) {
    if (ND_VARiants(row.party)) {
      m.set(row.municipality.trim(), Math.max(m.get(row.municipality.trim()) ?? 0, Number(row.percentage) || 0));
    }
  }
  return m;
}

export async function contactHasCallHistory(
  supabase: SupabaseClient,
  contactId: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .from("calls")
    .select("id", { count: "exact", head: true })
    .eq("contact_id", contactId)
    .limit(1);
  if (error) {
    return false;
  }
  return (count ?? 0) > 0;
}
