import type { SupabaseClient } from "@supabase/supabase-js";
import { contactMatchesFuzzyGreekSearch } from "@/lib/greek-fuzzy-name";

type ContactForSearch = {
  first_name: string;
  last_name: string;
  phone: string | null;
  phone2: string | null;
  landline: string | null;
  nickname: string | null;
  area: string | null;
  municipality: string | null;
};

/** Fuzzy, accent-agnostic, Greek/ Latin name + nickname + area match (export & nameday). */
export function contactMatchesLocalSearch(c: ContactForSearch, search: string | null) {
  return contactMatchesFuzzyGreekSearch(c, search);
}

/**
 * Ίδιο φιλτράρισμα με GET /api/contacts — για export & bulk.
 */
export function buildContactsQuery(
  supabase: SupabaseClient,
  opts: {
    search?: string;
    call_status?: string;
    area?: string;
    municipality?: string;
    priority?: string;
    tag?: string;
    group_id?: string;
  },
) {
  const { search: _search, call_status, area, municipality, priority, tag, group_id } = opts;
  void _search; /* in-memory fuzzy filter (export) after query */
  let query = supabase.from("contacts").select(
    "id, first_name, last_name, phone, phone2, landline, email, area, municipality, electoral_district, call_status, priority, political_stance, notes, nickname, tags, group_id",
  );
  if (call_status) query = query.eq("call_status", call_status);
  if (area) query = query.eq("area", area);
  if (municipality) query = query.ilike("municipality", `%${municipality}%`);
  if (priority) query = query.eq("priority", priority);
  if (tag) query = query.contains("tags", [tag]);
  if (group_id) query = query.eq("group_id", group_id);
  return query;
}

const CONTACT_LIST_SELECT =
  "id, first_name, last_name, phone, phone2, landline, area, municipality, call_status, priority, tags, nickname, contact_code, age, political_stance, group_id, contact_groups ( id, name, color, description, year )";

/** Same filtering semantics as GET /api/contacts (fuzzy when search is set), capped. */
export async function queryContactsList(
  supabase: SupabaseClient,
  opts: {
    search?: string;
    call_status?: string;
    area?: string;
    municipality?: string;
    priority?: string;
    tag?: string;
    group_id?: string;
    phone?: string;
    political_stance?: string;
    age_min?: number;
    age_max?: number;
  },
  cap: number = 10_000,
) {
  const maxRows = Math.min(10_000, Math.max(1, cap));
  let query = supabase
    .from("contacts")
    .select(CONTACT_LIST_SELECT)
    .order("created_at", { ascending: false });
  if (opts.call_status) query = query.eq("call_status", opts.call_status);
  if (opts.area) query = query.eq("area", opts.area);
  if (opts.municipality) query = query.ilike("municipality", `%${opts.municipality}%`);
  if (opts.priority) query = query.eq("priority", opts.priority);
  if (opts.tag) query = query.contains("tags", [opts.tag]);
  if (opts.group_id) query = query.eq("group_id", opts.group_id);
  if (opts.phone) query = query.ilike("phone", `%${opts.phone}%`);
  if (opts.political_stance) query = query.eq("political_stance", opts.political_stance);
  if (opts.age_min != null && Number.isFinite(opts.age_min)) query = query.gte("age", opts.age_min);
  if (opts.age_max != null && Number.isFinite(opts.age_max)) query = query.lte("age", opts.age_max);
  if (opts.search?.trim()) {
    query = query.limit(12_000);
  } else {
    query = query.limit(maxRows);
  }
  const { data, error } = await query;
  if (error) {
    return { error: error.message, contacts: [] as Record<string, unknown>[] };
  }
  let list = (data ?? []) as Record<string, unknown>[];
  if (opts.search?.trim()) {
    list = list.filter((c) => contactMatchesFuzzyGreekSearch(c as ContactForSearch, opts.search!));
    list = list.slice(0, maxRows);
  }
  return { error: null, contacts: list };
}
