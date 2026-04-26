import type { SupabaseClient } from "@supabase/supabase-js";
import { contactMatchesFuzzyGreekSearch } from "@/lib/greek-fuzzy-name";
import type { ContactListFilters } from "@/lib/contacts-filters";
import { getDefaultContactFilters } from "@/lib/contacts-filters";

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyContactListFiltersToBuilder(query: any, f: ContactListFilters) {
  const callStatuses = f.call_statuses.length
    ? f.call_statuses
    : f.call_status
      ? [f.call_status]
      : [];
  if (callStatuses.length === 1) {
    query = query.eq("call_status", callStatuses[0]!);
  } else if (callStatuses.length > 1) {
    query = query.in("call_status", callStatuses);
  }
  if (f.area) query = query.eq("area", f.area);
  if (f.municipality) query = query.ilike("municipality", `%${f.municipality}%`);
  if (f.priority) query = query.eq("priority", f.priority);
  if (f.tag) query = query.contains("tags", [f.tag]);
  if (f.political_stance) query = query.eq("political_stance", f.political_stance);
  if (f.phone) query = query.ilike("phone", `%${f.phone}%`);
  if (f.group_ids.length) {
    query = query.in("group_id", f.group_ids);
  } else if (f.group_id) {
    query = query.eq("group_id", f.group_id);
  }
  if (f.exclude_group_ids.length) {
    const ids = f.exclude_group_ids.join(",");
    query = query.or(`group_id.is.null,group_id.not.in.(${ids})`);
  }
  if (f.age_min) {
    const n = parseInt(f.age_min, 10);
    if (Number.isFinite(n)) query = query.gte("age", n);
  }
  if (f.age_max) {
    const n = parseInt(f.age_max, 10);
    if (Number.isFinite(n)) query = query.lte("age", n);
  }
  if (f.birth_year_from) {
    const n = parseInt(f.birth_year_from, 10);
    if (Number.isFinite(n)) query = query.gte("birthday", `${n}-01-01`);
  }
  if (f.birth_year_to) {
    const n = parseInt(f.birth_year_to, 10);
    if (Number.isFinite(n)) query = query.lte("birthday", `${n}-12-31`);
  }
  if (f.not_contacted_days) {
    const n = parseInt(f.not_contacted_days, 10);
    if (Number.isFinite(n) && n > 0) {
      const cut = new Date();
      cut.setDate(cut.getDate() - n);
      const iso = cut.toISOString();
      query = query.or(`last_contacted_at.is.null,last_contacted_at.lt."${iso}"`);
    }
  }
  if (f.score_tier === "low") {
    query = query.lte("predicted_score", 33);
  } else if (f.score_tier === "mid") {
    query = query.gte("predicted_score", 34).lte("predicted_score", 66);
  } else if (f.score_tier === "high") {
    query = query.gte("predicted_score", 67);
  }
  if (f.is_volunteer) {
    query = query.eq("is_volunteer", true);
  }
  if (f.volunteer_area) {
    query = query.ilike("volunteer_area", `%${f.volunteer_area}%`);
  }
  return query;
}

function listFiltersFromExportOpts(opts: {
  search?: string;
  call_status?: string;
  area?: string;
  municipality?: string;
  priority?: string;
  tag?: string;
  group_id?: string;
  group_ids?: string;
  exclude_group_ids?: string;
  birth_year_from?: string;
  birth_year_to?: string;
  not_contacted_days?: string;
  call_statuses?: string;
  score_tier?: string;
  is_volunteer?: string;
}): ContactListFilters {
  const f = getDefaultContactFilters();
  if (opts.call_status) f.call_status = opts.call_status;
  if (opts.area) f.area = opts.area;
  if (opts.municipality) f.municipality = opts.municipality;
  if (opts.priority) f.priority = opts.priority;
  if (opts.tag) f.tag = opts.tag;
  if (opts.group_id) f.group_id = opts.group_id;
  if (opts.not_contacted_days) f.not_contacted_days = opts.not_contacted_days;
  if (opts.score_tier) f.score_tier = opts.score_tier;
  if (opts.is_volunteer === "1" || opts.is_volunteer === "true") f.is_volunteer = true;
  if (opts.group_ids)
    f.group_ids = opts.group_ids
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  if (opts.exclude_group_ids) {
    f.exclude_group_ids = opts.exclude_group_ids
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }
  if (opts.birth_year_from) f.birth_year_from = opts.birth_year_from;
  if (opts.birth_year_to) f.birth_year_to = opts.birth_year_to;
  if (opts.call_statuses) {
    f.call_statuses = opts.call_statuses
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    f.call_status = "";
  }
  if (opts.search) f.search = opts.search;
  return f;
}

const EXPORT_FLAT_SELECT =
  "id, first_name, last_name, phone, phone2, landline, email, area, municipality, electoral_district, call_status, priority, political_stance, notes, nickname, tags, group_id, birthday, predicted_score, is_volunteer, volunteer_area, last_contacted_at";

/**
 * Ίδιο φιλτράρισμα με GET /api/contacts — για export (flat query params) & bulk.
 */
export function buildContactsQuery(
  supabase: SupabaseClient,
  opts: {
    search?: string;
    call_status?: string;
    call_statuses?: string;
    area?: string;
    municipality?: string;
    priority?: string;
    tag?: string;
    group_id?: string;
    group_ids?: string;
    exclude_group_ids?: string;
    birth_year_from?: string;
    birth_year_to?: string;
    not_contacted_days?: string;
    score_tier?: string;
    is_volunteer?: string;
  },
) {
  const f = listFiltersFromExportOpts(opts);
  const { search: _search } = f;
  void _search; /* in-memory fuzzy filter (export) after query */
  const query = supabase.from("contacts").select(EXPORT_FLAT_SELECT);
  return applyContactListFiltersToBuilder(query, f);
}

export function buildContactsQueryFromListFilters(
  supabase: SupabaseClient,
  f: ContactListFilters,
) {
  const query = supabase.from("contacts").select(EXPORT_FLAT_SELECT);
  return applyContactListFiltersToBuilder(query, f);
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
