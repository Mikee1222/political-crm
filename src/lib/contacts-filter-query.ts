import type { SupabaseClient } from "@supabase/supabase-js";

export type ContactFilter = {
  call_status?: string;
  area?: string;
  municipality?: string;
  priority?: string;
  tag?: string;
};

/** Chains the same filter rules as GET /api/contacts (non–name-day / non-search). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(q: any, f: ContactFilter) {
  if (f.call_status) q = q.eq("call_status", f.call_status);
  if (f.area) q = q.eq("area", f.area);
  if (f.municipality) q = q.ilike("municipality", `%${f.municipality.trim()}%`);
  if (f.priority) q = q.eq("priority", f.priority);
  if (f.tag) q = q.contains("tags", [f.tag]);
  return q;
}

export async function countContactsMatching(
  supabase: SupabaseClient,
  f: ContactFilter,
): Promise<{ count: number; error: string | null }> {
  let q = supabase.from("contacts").select("id", { count: "exact", head: true });
  q = applyFilters(q, f);
  const { count, error } = await q;
  if (error) return { count: 0, error: error.message };
  return { count: count ?? 0, error: null };
}

export async function listContactIdsMatching(
  supabase: SupabaseClient,
  f: ContactFilter,
): Promise<{ ids: string[]; error: string | null }> {
  let q = supabase.from("contacts").select("id");
  q = applyFilters(q, f);
  const { data, error } = await q;
  if (error) return { ids: [], error: error.message };
  return { ids: (data ?? []).map((r: { id: string }) => r.id), error: null };
}
