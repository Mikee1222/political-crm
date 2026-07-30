import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyContactIdIncludeFilter,
  resolveGroupFilterContactIds,
} from "@/lib/contact-group-members";

export type ContactFilter = {
  call_status?: string;
  area?: string;
  municipality?: string;
  priority?: string;
  tag?: string;
  /** Contact group UUIDs (OR membership). */
  group_ids?: string[];
};

export function contactFilterHasCriteria(f: ContactFilter): boolean {
  return Boolean(
    f.call_status ||
      f.area ||
      f.municipality ||
      f.priority ||
      f.tag ||
      (f.group_ids && f.group_ids.length > 0),
  );
}

/** Chains the same filter rules as GET /api/contacts (non–name-day / non-search). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function applyFilters(supabase: SupabaseClient, q: any, f: ContactFilter) {
  if (f.call_status) q = q.eq("call_status", f.call_status);
  if (f.area) q = q.eq("area", f.area);
  if (f.municipality) q = q.ilike("municipality", `%${f.municipality.trim()}%`);
  if (f.priority) q = q.eq("priority", f.priority);
  if (f.tag) q = q.contains("tags", [f.tag]);
  if (f.group_ids && f.group_ids.length > 0) {
    const resolution = await resolveGroupFilterContactIds(supabase, {
      group_id: "",
      group_ids: f.group_ids,
      exclude_group_ids: [],
      group_match: "or",
    });
    if (resolution.includeContactIds !== null) {
      q = applyContactIdIncludeFilter(q, resolution.includeContactIds);
    }
  }
  return q;
}

export async function countContactsMatching(
  supabase: SupabaseClient,
  f: ContactFilter,
): Promise<{ count: number; error: string | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase.from("contacts").select("id", { count: "exact", head: true });
  q = await applyFilters(supabase, q, f);
  const { count, error } = await q;
  if (error) return { count: 0, error: error.message };
  return { count: count ?? 0, error: null };
}

export async function listContactIdsMatching(
  supabase: SupabaseClient,
  f: ContactFilter,
): Promise<{ ids: string[]; error: string | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase.from("contacts").select("id");
  q = await applyFilters(supabase, q, f);
  const { data, error } = await q;
  if (error) return { ids: [], error: error.message };
  return { ids: (data ?? []).map((r: { id: string }) => r.id), error: null };
}
