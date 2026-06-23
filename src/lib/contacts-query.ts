import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyGroupMembershipFiltersToBuilder,
  type GroupFilterResolution,
} from "@/lib/contact-group-members";
import {
  contactFieldMatchesFuzzyName,
  contactMatchesFuzzyGreekSearch,
  normalizeGreekNameKey,
} from "@/lib/greek-fuzzy-name";
import { MAX_ID_IN_CLAUSE } from "@/lib/contact-group-members";
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

function escapeIlike(value: string): string {
  return value.replace(/[%_\\,().]/g, (c) => `\\${c}`);
}

function partialIlikePattern(value: string): string {
  return `%${escapeIlike(value.trim())}%`;
}

function parseOptionalInt(value: string | null | undefined): number | null {
  if (!value?.trim()) return null;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Birthday range from age_min/age_max (matches GET /api/contacts). */
export function applyBirthdayAgeFiltersToBuilder(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  ageMin: string,
  ageMax: string,
) {
  const minAge = parseOptionalInt(ageMin);
  const maxAge = parseOptionalInt(ageMax);
  if (minAge == null && maxAge == null) return query;

  const now = new Date();
  if (maxAge != null) {
    const minDate = new Date(now.getFullYear() - maxAge, now.getMonth(), now.getDate());
    query = query.gte("birthday", minDate.toISOString().split("T")[0]);
  }
  if (minAge != null) {
    const maxDate = new Date(now.getFullYear() - minAge, now.getMonth(), now.getDate());
    query = query.lte("birthday", maxDate.toISOString().split("T")[0]);
  }
  return query;
}

export type ContactListFilterRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  father_name?: string | null;
  call_status?: string | null;
  area?: string | null;
  municipality?: string | null;
  toponym?: string | null;
  gender?: string | null;
  birthday?: string | null;
  age?: number | null;
  phone?: string | null;
  phone2?: string | null;
  landline?: string | null;
  email?: string | null;
  priority?: string | null;
  tags?: string[] | null;
  political_stance?: string | null;
  electoral_district?: string | null;
  predicted_score?: number | null;
  is_volunteer?: boolean | null;
  volunteer_area?: string | null;
  last_contacted_at?: string | null;
  may_not_have_mobile?: boolean | null;
  may_not_have_landline?: boolean | null;
  may_not_have_email?: boolean | null;
};

function partialLocationMatch(
  value: string | null | undefined,
  filter: string,
  partial: boolean,
): boolean {
  const v = (value ?? "").trim();
  const f = filter.trim();
  if (!f) return true;
  if (!v) return false;
  if (partial) {
    return normalizeGreekNameKey(v).includes(normalizeGreekNameKey(f));
  }
  return v === f;
}

function ilikeMatch(value: string | null | undefined, filter: string): boolean {
  const v = (value ?? "").trim().toLowerCase();
  const f = filter.trim().toLowerCase();
  if (!f) return true;
  return v.includes(f);
}

/** In-memory AND filter — used after batch id fetches when SQL filters may not apply. */
export function contactRowMatchesListFilters(
  row: ContactListFilterRow,
  f: ContactListFilters,
  opts?: { partialLocation?: boolean; excludeContactIds?: ReadonlySet<string> },
): boolean {
  if (opts?.excludeContactIds?.has(String(row.id))) return false;

  const callStatuses = f.call_statuses.length
    ? f.call_statuses
    : f.call_status
      ? [f.call_status]
      : [];
  if (callStatuses.length && !callStatuses.includes(String(row.call_status ?? ""))) return false;

  if (f.first_name?.trim() && !contactFieldMatchesFuzzyName(row.first_name, f.first_name)) return false;
  if (f.last_name?.trim() && !contactFieldMatchesFuzzyName(row.last_name, f.last_name)) return false;
  if (f.father_name?.trim() && !contactFieldMatchesFuzzyName(row.father_name, f.father_name)) return false;

  const partial = opts?.partialLocation ?? false;
  if (f.area && !partialLocationMatch(row.area, f.area, partial)) return false;
  if (f.municipalities.length) {
    const muni = (row.municipality ?? "").trim();
    if (!muni) return false;
    const ok = f.municipalities.some((m) => partialLocationMatch(muni, m, partial));
    if (!ok) return false;
  }
  if (f.toponyms.length) {
    const top = (row.toponym ?? "").trim();
    if (!top) return false;
    const ok = f.toponyms.some((t) => partialLocationMatch(top, t, partial));
    if (!ok) return false;
  }

  if (f.gender && String(row.gender ?? "") !== f.gender) return false;

  if (f.birthday_today) {
    const b = row.birthday ?? "";
    if (!b) return false;
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    if (!b.endsWith(`-${mm}-${dd}`)) return false;
  }

  if (f.ekl_ar === "has") {
    const ed = (row.electoral_district ?? "").trim();
    if (!ed) return false;
  } else if (f.ekl_ar === "not") {
    if ((row.electoral_district ?? "").trim()) return false;
  }
  if (f.electoral_district?.trim()) {
    if (!ilikeMatch(row.electoral_district, f.electoral_district)) return false;
  }

  if (f.mobile_presence === "has") {
    const hasPhone = Boolean((row.phone ?? "").trim() || (row.phone2 ?? "").trim());
    if (!hasPhone || row.may_not_have_mobile === true) return false;
  } else if (f.mobile_presence === "not") {
    const hasPhone = Boolean((row.phone ?? "").trim() || (row.phone2 ?? "").trim());
    if (row.may_not_have_mobile === true || hasPhone) return false;
  }

  if (f.landline_presence === "has") {
    if (!(row.landline ?? "").trim() || row.may_not_have_landline === true) return false;
  } else if (f.landline_presence === "not") {
    if (row.may_not_have_landline === true || (row.landline ?? "").trim()) return false;
  }

  if (f.email_presence === "has") {
    if (!(row.email ?? "").trim() || row.may_not_have_email === true) return false;
  } else if (f.email_presence === "not") {
    if (row.may_not_have_email === true || (row.email ?? "").trim()) return false;
  }

  if (f.priority && String(row.priority ?? "") !== f.priority) return false;
  if (f.tag) {
    const tags = row.tags ?? [];
    if (!Array.isArray(tags) || !tags.includes(f.tag)) return false;
  }
  if (f.political_stance && String(row.political_stance ?? "") !== f.political_stance) return false;
  if (f.phone && !ilikeMatch(row.phone, f.phone) && !ilikeMatch(row.phone2, f.phone)) return false;

  const ageMin = parseOptionalInt(f.age_min);
  const ageMax = parseOptionalInt(f.age_max);
  if (ageMin != null || ageMax != null) {
    const birthday = row.birthday ?? "";
    if (birthday) {
      const now = new Date();
      if (ageMax != null) {
        const minDate = new Date(now.getFullYear() - ageMax, now.getMonth(), now.getDate());
        if (birthday < minDate.toISOString().split("T")[0]!) return false;
      }
      if (ageMin != null) {
        const maxDate = new Date(now.getFullYear() - ageMin, now.getMonth(), now.getDate());
        if (birthday > maxDate.toISOString().split("T")[0]!) return false;
      }
    } else if (row.age != null) {
      if (ageMin != null && row.age < ageMin) return false;
      if (ageMax != null && row.age > ageMax) return false;
    } else if (ageMin != null || ageMax != null) {
      return false;
    }
  }

  const birthFrom = parseOptionalInt(f.birth_year_from);
  const birthTo = parseOptionalInt(f.birth_year_to);
  if (birthFrom != null && (!row.birthday || row.birthday < `${birthFrom}-01-01`)) return false;
  if (birthTo != null && (!row.birthday || row.birthday > `${birthTo}-12-31`)) return false;

  if (f.not_contacted_days) {
    const n = parseInt(f.not_contacted_days, 10);
    if (Number.isFinite(n) && n > 0) {
      const cut = new Date();
      cut.setDate(cut.getDate() - n);
      const lc = row.last_contacted_at;
      if (lc && new Date(lc) >= cut) return false;
    }
  }

  const score = row.predicted_score;
  if (f.score_tier === "low" && (score == null || score > 33)) return false;
  if (f.score_tier === "mid" && (score == null || score < 34 || score > 66)) return false;
  if (f.score_tier === "high" && (score == null || score < 67)) return false;

  if (f.is_volunteer && row.is_volunteer !== true) return false;
  if (f.volunteer_area && !ilikeMatch(row.volunteer_area, f.volunteer_area)) return false;

  return true;
}

export function filterContactRowsByListFilters<T extends ContactListFilterRow>(
  rows: T[],
  f: ContactListFilters,
  opts?: { partialLocation?: boolean; excludeContactIds?: readonly string[] },
): T[] {
  const exclude = opts?.excludeContactIds?.length
    ? new Set(opts.excludeContactIds)
    : undefined;
  return rows.filter((row) => contactRowMatchesListFilters(row, f, { ...opts, excludeContactIds: exclude }));
}

export function hasColumnListFilters(f: ContactListFilters): boolean {
  const d = getDefaultContactFilters();
  const keys: (keyof ContactListFilters)[] = [
    "first_name",
    "last_name",
    "father_name",
    "call_status",
    "area",
    "priority",
    "tag",
    "political_stance",
    "phone",
    "mobile_presence",
    "landline_presence",
    "email_presence",
    "not_contacted_days",
    "score_tier",
    "volunteer_area",
    "gender",
    "ekl_ar",
    "electoral_district",
    "has_request",
    "request_status",
    "age_min",
    "age_max",
    "birth_year_from",
    "birth_year_to",
  ];
  for (const k of keys) {
    if (f[k] !== d[k]) return true;
  }
  if (f.call_statuses.length) return true;
  if (f.municipalities.length) return true;
  if (f.toponyms.length) return true;
  if (f.is_volunteer) return true;
  if (f.nameday_today) return true;
  if (f.birthday_today) return true;
  return false;
}

/** Column + exclude-group filters only (include ids applied separately in batch fetches). */
export function applyColumnContactFiltersToBuilder(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  f: ContactListFilters,
  opts?: { partialLocation?: boolean; excludeContactIds?: string[]; skipNameColumnFilters?: boolean },
) {
  const groupResolution: GroupFilterResolution | undefined = opts?.excludeContactIds?.length
    ? { includeContactIds: null, excludeContactIds: opts.excludeContactIds }
    : undefined;
  const filtersWithoutAge = { ...f, age_min: "", age_max: "" };
  const q = applyContactListFiltersToBuilder(query, filtersWithoutAge, groupResolution, {
    partialLocation: opts?.partialLocation,
    skipNameColumnFilters: opts?.skipNameColumnFilters,
  });
  return applyBirthdayAgeFiltersToBuilder(q, f.age_min, f.age_max);
}

export function hasNameColumnFilters(f: ContactListFilters): boolean {
  return Boolean(f.first_name?.trim() || f.last_name?.trim() || f.father_name?.trim());
}

export function hasFirstOrLastNameFilter(f: ContactListFilters): boolean {
  return Boolean(f.first_name?.trim() || f.last_name?.trim());
}

export function hasGroupIncludeFilter(f: ContactListFilters): boolean {
  return f.group_ids.length > 0 || Boolean(f.group_id?.trim());
}

/** Only first_name and/or last_name — no group, gender, municipality, or other column filters. */
export function isNameOnlyFilter(f: ContactListFilters): boolean {
  if (!hasFirstOrLastNameFilter(f)) return false;
  const d = getDefaultContactFilters();
  const ignore: (keyof ContactListFilters)[] = ["first_name", "last_name", "page", "limit"];
  for (const k of ignore) {
    d[k] = f[k] as never;
  }
  const keys: (keyof ContactListFilters)[] = [
    "search",
    "father_name",
    "call_status",
    "area",
    "priority",
    "tag",
    "political_stance",
    "phone",
    "mobile_presence",
    "landline_presence",
    "email_presence",
    "not_contacted_days",
    "score_tier",
    "volunteer_area",
    "gender",
    "ekl_ar",
    "electoral_district",
    "has_request",
    "request_status",
    "age_min",
    "age_max",
    "birth_year_from",
    "birth_year_to",
    "group_id",
    "group_match",
    "nameday_today",
    "birthday_today",
    "is_volunteer",
  ];
  for (const k of keys) {
    if (f[k] !== d[k]) return false;
  }
  if (f.call_statuses.length) return false;
  if (f.municipalities.length) return false;
  if (f.toponyms.length) return false;
  if (f.group_ids.length) return false;
  if (f.exclude_group_ids.length) return false;
  if (f.source_ids.length) return false;
  if (f.exclude_source_ids.length) return false;
  return true;
}

/** Name-only: search_contacts_by_name RPC (not the generic in-memory pipeline). */
export function canUseNameOnlyFuzzySearchPath(f: ContactListFilters): boolean {
  return isNameOnlyFilter(f);
}

/** Name + any non-name column filter (gender, municipality, father_name, …) — not group+name fast path. */
export function nameRequiresInMemoryPipeline(f: ContactListFilters): boolean {
  if (!hasNameColumnFilters(f)) return false;
  if (canUseGroupNameSearchFastPath(f)) return false;
  if (isNameOnlyFilter(f)) return false;
  return true;
}

/** Only group include filter — no name, column, exclude-group, or source filters. */
export function isGroupOnlyFilter(f: ContactListFilters): boolean {
  if (!hasGroupIncludeFilter(f)) return false;
  if (f.search?.trim()) return false;
  if (hasNameColumnFilters(f)) return false;
  if (hasColumnListFilters(f)) return false;
  if (f.exclude_group_ids.length) return false;
  if (f.source_ids.length) return false;
  if (f.exclude_source_ids.length) return false;
  return true;
}

/** Group-only: get_contacts_by_groups_paginated RPC instead of batch id fetch. */
export function canUseGroupOnlyFastPath(
  f: ContactListFilters,
  resolvedIds?: string[] | null,
): boolean {
  if (!isGroupOnlyFilter(f)) return false;
  if (resolvedIds !== undefined && resolvedIds === null) return false;
  return true;
}

/** Group without name fast path: group+gender, group+municipality, … */
export function groupRequiresInMemoryPipeline(f: ContactListFilters): boolean {
  if (!hasGroupIncludeFilter(f)) return false;
  if (canUseGroupNameSearchFastPath(f)) return false;
  if (isGroupOnlyFilter(f)) return false;
  return true;
}

const FUZZY_NAME_FETCH_BATCH = 1000;

/** Page through contacts when fuzzy name columns must be matched in memory (no row cap). */
export async function fetchContactRowsInBatches(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  select: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  applyFilters: (query: any) => any,
  batchSize = FUZZY_NAME_FETCH_BATCH,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let from = 0;
  while (true) {
    let query = supabase.from("contacts").select(select).order("created_at", { ascending: false });
    query = applyFilters(query);
    query = query.range(from, from + batchSize - 1);
    const { data, error } = await query;
    if (error) throw error;
    const chunk = (data ?? []) as Record<string, unknown>[];
    rows.push(...chunk);
    if (chunk.length < batchSize) break;
    from += batchSize;
  }
  return rows;
}

const NAME_SEARCH_RPC_PAGE_SIZE = 1000;

/** First/last/father name search via search_contacts_by_name RPC (paginated). */
export async function searchContactsByName(
  supabase: SupabaseClient,
  opts: {
    firstName?: string | null;
    lastName?: string | null;
    fatherName?: string | null;
  },
): Promise<Record<string, unknown>[]> {
  const { firstName, lastName, fatherName } = opts;
  const allRows: Record<string, unknown>[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .rpc("search_contacts_by_name", {
        p_first_name: firstName?.trim() || null,
        p_last_name: lastName?.trim() || null,
        p_father_name: fatherName?.trim() || null,
      })
      .range(from, from + NAME_SEARCH_RPC_PAGE_SIZE - 1);
    if (error) throw error;

    const page = (data ?? []) as Record<string, unknown>[];
    allRows.push(...page);
    if (page.length < NAME_SEARCH_RPC_PAGE_SIZE) break;
    from += NAME_SEARCH_RPC_PAGE_SIZE;
  }

  return allRows;
}

/** Fetch all matches in memory before paginating (search, name combos, group-only, large include lists). */
export function needsInMemoryContactListPipeline(
  f: ContactListFilters,
  resolvedIds: string[] | null,
): boolean {
  if (canUseGroupNameSearchFastPath(f)) return false;
  if (canUseGroupOnlyFastPath(f, resolvedIds)) return false;
  if (canUseNameOnlyFuzzySearchPath(f)) return false;
  if (f.search?.trim()) return true;
  if (nameRequiresInMemoryPipeline(f)) return true;
  if (groupRequiresInMemoryPipeline(f)) return true;
  if (resolvedIds !== null && resolvedIds.length > MAX_ID_IN_CLAUSE) return true;
  return false;
}

/** Group + first/last name: search_contacts_in_groups RPC instead of batch id fetch. */
export function canUseGroupNameSearchFastPath(f: ContactListFilters): boolean {
  const hasGroup = f.group_ids.length > 0 || Boolean(f.group_id?.trim());
  if (!hasGroup) return false;
  if (!f.first_name?.trim() && !f.last_name?.trim()) return false;
  if (f.search?.trim() || f.father_name?.trim()) return false;
  return true;
}

export function applyContactListFiltersToBuilder(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  f: ContactListFilters,
  groupResolution?: GroupFilterResolution,
  opts?: { partialLocation?: boolean; skipNameColumnFilters?: boolean },
) {
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
  if (!opts?.skipNameColumnFilters) {
    if (f.first_name?.trim()) query = query.ilike("first_name", `%${f.first_name.trim()}%`);
    if (f.last_name?.trim()) query = query.ilike("last_name", `%${f.last_name.trim()}%`);
    if (f.father_name?.trim()) query = query.ilike("father_name", `%${f.father_name.trim()}%`);
  }
  if (f.area) {
    query = opts?.partialLocation
      ? query.ilike("area", partialIlikePattern(f.area))
      : query.eq("area", f.area);
  }
  if (f.municipalities.length === 1) {
    query = opts?.partialLocation
      ? query.ilike("municipality", partialIlikePattern(f.municipalities[0]!))
      : query.eq("municipality", f.municipalities[0]!);
  } else if (f.municipalities.length > 1) {
    query = opts?.partialLocation
      ? query.or(
          f.municipalities
            .map((m) => `municipality.ilike.${partialIlikePattern(m)}`)
            .join(","),
        )
      : query.in("municipality", f.municipalities);
  }
  if (f.toponyms.length === 1) {
    query = opts?.partialLocation
      ? query.ilike("toponym", partialIlikePattern(f.toponyms[0]!))
      : query.eq("toponym", f.toponyms[0]!);
  } else if (f.toponyms.length > 1) {
    query = opts?.partialLocation
      ? query.or(f.toponyms.map((t) => `toponym.ilike.${partialIlikePattern(t)}`).join(","))
      : query.in("toponym", f.toponyms);
  }
  if (f.gender) query = query.eq("gender", f.gender);
  if (f.birthday_today) {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    query = query.like("birthday", `%-${mm}-${dd}`);
  }
  if (f.ekl_ar === "has") {
    query = query.not("electoral_district", "is", null).neq("electoral_district", "");
  } else if (f.ekl_ar === "not") {
    query = query.or("electoral_district.is.null,electoral_district.eq.");
  }
  if (f.electoral_district?.trim()) {
    query = query.ilike("electoral_district", `%${f.electoral_district.trim()}%`);
  }
  if (f.mobile_presence === "has") {
    query = query.or("phone.neq.,phone2.neq.").not("may_not_have_mobile", "eq", true);
  } else if (f.mobile_presence === "not") {
    query = query.or("may_not_have_mobile.eq.true,and(phone.is.null,phone2.is.null),and(phone.eq.,phone2.eq.)");
  }
  if (f.landline_presence === "has") {
    query = query.not("landline", "is", null).neq("landline", "").not("may_not_have_landline", "eq", true);
  } else if (f.landline_presence === "not") {
    query = query.or("may_not_have_landline.eq.true,landline.is.null,landline.eq.");
  }
  if (f.email_presence === "has") {
    query = query.not("email", "is", null).neq("email", "").not("may_not_have_email", "eq", true);
  } else if (f.email_presence === "not") {
    query = query.or("may_not_have_email.eq.true,email.is.null,email.eq.");
  }
  if (f.priority) query = query.eq("priority", f.priority);
  if (f.tag) query = query.contains("tags", [f.tag]);
  if (f.political_stance) query = query.eq("political_stance", f.political_stance);
  if (f.phone) query = query.ilike("phone", `%${f.phone}%`);
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
  if (groupResolution) {
    query = applyGroupMembershipFiltersToBuilder(query, groupResolution);
  }
  return query;
}

function listFiltersFromExportOpts(opts: {
  search?: string;
  call_status?: string;
  area?: string;
  municipalities?: string;
  toponyms?: string;
  municipality?: string;
  toponym?: string;
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
  if (opts.municipalities) {
    f.municipalities = opts.municipalities
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  } else if (opts.municipality) {
    f.municipalities = [opts.municipality];
  }
  if (opts.toponyms) {
    f.toponyms = opts.toponyms
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  } else if (opts.toponym) {
    f.toponyms = [opts.toponym];
  }
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
 * Group filters require async `resolveGroupFilterContactIds` before applyContactListFiltersToBuilder.
 */
export function buildContactsQuery(
  supabase: SupabaseClient,
  opts: {
    search?: string;
    call_status?: string;
    call_statuses?: string;
    area?: string;
    municipalities?: string;
  toponyms?: string;
  municipality?: string;
  toponym?: string;
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
  void _search;
  return supabase.from("contacts").select(EXPORT_FLAT_SELECT);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function buildContactsQueryFromListFilters(supabase: SupabaseClient, _f: ContactListFilters) {
  return supabase.from("contacts").select(EXPORT_FLAT_SELECT);
}

const CONTACT_LIST_SELECT =
  "id, first_name, last_name, phone, phone2, landline, area, municipality, call_status, priority, tags, nickname, contact_code, age, political_stance, group_id, contact_groups!contacts_group_id_fkey ( id, name, color, description, year )";

/** Same filtering semantics as GET /api/contacts (fuzzy when search is set), capped. */
export async function queryContactsList(
  supabase: SupabaseClient,
  opts: {
    search?: string;
    call_status?: string;
    area?: string;
    municipalities?: string;
  toponyms?: string;
  municipality?: string;
  toponym?: string;
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
  if (opts.municipality) {
    query = query.ilike("municipality", `%${opts.municipality}%`);
  }
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
