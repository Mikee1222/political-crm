import type { SupabaseClient } from "@supabase/supabase-js";

const ANALYSIS_TYPES = new Set([
  "contacts_by_call_status",
  "contacts_by_municipality",
  "contacts_by_priority",
  "contact_age_distribution",
  "requests_by_status",
]);

function tally(rows: Array<Record<string, unknown>>, field: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = String(r[field] ?? "Άγνωστο").trim() || "Άγνωστο";
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function ageBucket(age: unknown): string {
  const a = typeof age === "number" ? age : parseInt(String(age), 10);
  if (!Number.isFinite(a)) return "Άγνωστο";
  if (a <= 30) return "18–30";
  if (a <= 45) return "31–45";
  if (a <= 60) return "46–60";
  return "60+";
}

async function loadContacts(
  supabase: SupabaseClient,
  data: unknown,
): Promise<Array<Record<string, unknown>>> {
  if (Array.isArray(data) && data.length > 0) {
    return data
      .filter((r) => r != null && typeof r === "object" && !Array.isArray(r))
      .map((r) => r as Record<string, unknown>)
      .slice(0, 10_000);
  }
  const { data: rows, error } = await supabase
    .from("contacts")
    .select("call_status, municipality, priority, age, political_stance")
    .limit(5000);
  if (error) throw new Error(error.message);
  return (rows ?? []) as Array<Record<string, unknown>>;
}

async function loadRequests(supabase: SupabaseClient): Promise<Array<Record<string, unknown>>> {
  const { data: rows, error } = await supabase.from("requests").select("status").limit(5000);
  if (error) throw new Error(error.message);
  return (rows ?? []) as Array<Record<string, unknown>>;
}

export async function runAlexandraAnalysis(
  supabase: SupabaseClient,
  type: string,
  data?: unknown,
): Promise<Record<string, unknown>> {
  const t = type.trim();
  if (!ANALYSIS_TYPES.has(t)) {
    return {
      ok: false,
      error: `Άγνωστος τύπος. Επιτρεπόμενοι: ${[...ANALYSIS_TYPES].join(", ")}`,
    };
  }

  if (t === "requests_by_status") {
    const rows = await loadRequests(supabase);
    const breakdown = tally(rows, "status");
    return { ok: true, type: t, total: rows.length, breakdown };
  }

  const contacts = await loadContacts(supabase, data);
  if (t === "contacts_by_call_status") {
    return { ok: true, type: t, total: contacts.length, breakdown: tally(contacts, "call_status") };
  }
  if (t === "contacts_by_municipality") {
    return { ok: true, type: t, total: contacts.length, breakdown: tally(contacts, "municipality") };
  }
  if (t === "contacts_by_priority") {
    return { ok: true, type: t, total: contacts.length, breakdown: tally(contacts, "priority") };
  }
  const breakdown: Record<string, number> = {};
  for (const r of contacts) {
    const k = ageBucket(r.age);
    breakdown[k] = (breakdown[k] ?? 0) + 1;
  }
  return { ok: true, type: t, total: contacts.length, breakdown };
}
