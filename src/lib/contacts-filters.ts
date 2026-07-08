import { groupNameLookupKey } from "@/lib/contact-group-members";

/**
 * URL query <-> /api/contacts and /contacts filter state (shared: CRM list + Alexandra).
 */

/** Αδιάφορο | Έχει | Δεν έχει — τηλέφωνο, κινητό, σταθερό, email */
export type ContactPresenceFilter = "" | "has" | "not";

export type ContactListFilters = {
  search: string;
  first_name: string;
  last_name: string;
  father_name: string;
  call_status: string;
  call_statuses: string[];
  area: string;
  municipalities: string[];
  toponyms: string[];
  priority: string;
  tag: string;
  political_stance: string;
  phone: string;
  mobile_presence: ContactPresenceFilter;
  landline_presence: ContactPresenceFilter;
  email_presence: ContactPresenceFilter;
  group_id: string;
  group_ids: string[];
  exclude_group_ids: string[];
  /** OR = σε οποιαδήποτε ομάδα (default), AND = σε όλες τις επιλεγμένες */
  group_match: "or" | "and";
  source_ids: string[];
  exclude_source_ids: string[];
  not_contacted_days: string;
  score_tier: string;
  is_volunteer: boolean;
  nameday_today: boolean;
  birthday_today: boolean;
  age_min: string;
  age_max: string;
  birth_year_from: string;
  birth_year_to: string;
  volunteer_area: string;
  gender: string;
  /** has = έχει εκλ. περιφέρεια, not = δεν έχει */
  ekl_ar: "" | "has" | "not";
  electoral_district: string;
  has_request: "" | "has" | "not";
  request_status: string;
  limit: string;
  /** 1-based page for list (50 per page when not using `limit` combobox mode) */
  page: string;
};

function splitCsv(s: string | null | undefined): string[] {
  if (!s?.trim()) return [];
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function uniq(ids: string[]): string[] {
  return [...new Set(ids)];
}

/** Comma-separated or repeated query param (`key` / `key[]`); optional legacy single-value key. */
function parseCsvParam(
  sp: URLSearchParams,
  key: string,
  prev: string[] | undefined,
  legacyKey?: string,
): string[] {
  const collected: string[] = [];
  for (const paramKey of [key, `${key}[]`]) {
    for (const raw of sp.getAll(paramKey)) {
      if (!raw?.trim()) continue;
      collected.push(...raw.split(",").map((x) => x.trim()).filter(Boolean));
    }
  }
  if (collected.length) return uniq(collected);
  if (legacyKey) {
    const leg = sp.get(legacyKey)?.trim();
    if (leg) return [leg];
  }
  return prev ?? [];
}

/** From URLSearchParams to partial filter state; merge with existing defaults. */
export function searchParamsToFilters(sp: URLSearchParams, prev?: Partial<ContactListFilters>): ContactListFilters {
  const callStatuses = splitCsv(sp.get("call_statuses") ?? sp.get("call_status_in"));
  const presence = (
    key: "mobile_presence" | "landline_presence" | "email_presence",
  ): ContactPresenceFilter => {
    const v = sp.get(key) ?? prev?.[key];
    return v === "has" || v === "not" ? v : "";
  };
  const ekl = sp.get("ekl_ar") ?? prev?.ekl_ar ?? "";
  const hasReq = sp.get("has_request") ?? prev?.has_request ?? "";

  return {
    search: sp.get("search") ?? sp.get("name") ?? prev?.search ?? "",
    first_name: sp.get("first_name") ?? prev?.first_name ?? "",
    last_name: sp.get("last_name") ?? prev?.last_name ?? "",
    father_name: sp.get("father_name") ?? prev?.father_name ?? "",
    call_status: sp.get("call_status") ?? prev?.call_status ?? "",
    call_statuses: callStatuses.length ? callStatuses : (prev?.call_statuses ?? []),
    area: sp.get("area") ?? prev?.area ?? "",
    municipalities: parseCsvParam(sp, "municipalities", prev?.municipalities, "municipality"),
    toponyms: parseCsvParam(sp, "toponyms", prev?.toponyms, "toponym"),
    priority: sp.get("priority") ?? prev?.priority ?? "",
    tag: sp.get("tag") ?? prev?.tag ?? "",
    political_stance: sp.get("political_stance") ?? prev?.political_stance ?? "",
    phone: sp.get("phone") ?? prev?.phone ?? "",
    mobile_presence: presence("mobile_presence"),
    landline_presence: presence("landline_presence"),
    email_presence: presence("email_presence"),
    group_id: sp.get("group_id") ?? prev?.group_id ?? "",
    group_ids: parseCsvParam(sp, "group_ids", prev?.group_ids),
    exclude_group_ids: parseCsvParam(sp, "exclude_group_ids", prev?.exclude_group_ids),
    group_match: sp.get("group_match") === "and" ? "and" : (prev?.group_match ?? "or"),
    source_ids: (() => {
      const a = sp.get("source_ids");
      if (a) return uniq(a.split(",").map((x) => x.trim()).filter(Boolean));
      return prev?.source_ids ?? [];
    })(),
    exclude_source_ids: (() => {
      const a = sp.get("exclude_source_ids");
      if (a) return uniq(a.split(",").map((x) => x.trim()).filter(Boolean));
      return prev?.exclude_source_ids ?? [];
    })(),
    not_contacted_days: sp.get("not_contacted_days") ?? prev?.not_contacted_days ?? "",
    score_tier: sp.get("score_tier") ?? prev?.score_tier ?? "",
    is_volunteer: sp.get("is_volunteer") === "1" || sp.get("is_volunteer") === "true",
    nameday_today: sp.get("nameday_today") === "1",
    birthday_today: sp.get("birthday_today") === "1",
    age_min: sp.get("age_min") ?? prev?.age_min ?? "",
    age_max: sp.get("age_max") ?? prev?.age_max ?? "",
    birth_year_from: sp.get("birth_year_from") ?? prev?.birth_year_from ?? "",
    birth_year_to: sp.get("birth_year_to") ?? prev?.birth_year_to ?? "",
    volunteer_area: sp.get("volunteer_area") ?? prev?.volunteer_area ?? "",
    gender: sp.get("gender") ?? prev?.gender ?? "",
    ekl_ar: ekl === "has" || ekl === "not" ? ekl : "",
    electoral_district: sp.get("electoral_district") ?? prev?.electoral_district ?? "",
    has_request: hasReq === "has" || hasReq === "not" ? hasReq : "",
    request_status: sp.get("request_status") ?? prev?.request_status ?? "",
    limit: sp.get("limit") ?? prev?.limit ?? "",
    page: sp.get("page") ?? prev?.page ?? "1",
  };
}

function pushIf(p: URLSearchParams, key: string, value: string | null | undefined | false) {
  if (value == null) return;
  if (value === false) return;
  if (typeof value === "string" && !value.trim()) return;
  p.set(key, String(value).trim());
}

export function contactFiltersToSearchParams(f: ContactListFilters, opts?: { forPage?: boolean }): URLSearchParams {
  const p = new URLSearchParams();
  pushIf(p, "search", f.search);
  pushIf(p, "first_name", f.first_name);
  pushIf(p, "last_name", f.last_name);
  pushIf(p, "father_name", f.father_name);
  if (f.call_statuses && f.call_statuses.length) {
    p.set("call_statuses", f.call_statuses.join(","));
  } else {
    pushIf(p, "call_status", f.call_status);
  }
  pushIf(p, "area", f.area);
  if (f.municipalities?.length) p.set("municipalities", f.municipalities.join(","));
  if (f.toponyms?.length) p.set("toponyms", f.toponyms.join(","));
  pushIf(p, "priority", f.priority);
  pushIf(p, "tag", f.tag);
  pushIf(p, "political_stance", f.political_stance);
  pushIf(p, "phone", f.phone);
  pushIf(p, "mobile_presence", f.mobile_presence);
  pushIf(p, "landline_presence", f.landline_presence);
  pushIf(p, "email_presence", f.email_presence);
  if (f.group_ids?.length) p.set("group_ids", f.group_ids.join(","));
  if (f.exclude_group_ids?.length) p.set("exclude_group_ids", f.exclude_group_ids.join(","));
  if (f.group_match === "and") p.set("group_match", "and");
  if (f.source_ids?.length) p.set("source_ids", f.source_ids.join(","));
  if (f.exclude_source_ids?.length) p.set("exclude_source_ids", f.exclude_source_ids.join(","));
  if (!f.group_ids?.length && f.group_id) p.set("group_id", f.group_id);
  pushIf(p, "not_contacted_days", f.not_contacted_days);
  pushIf(p, "score_tier", f.score_tier);
  if (f.is_volunteer) p.set("is_volunteer", "1");
  if (f.nameday_today) p.set("nameday_today", "1");
  if (f.birthday_today) p.set("birthday_today", "1");
  pushIf(p, "age_min", f.age_min);
  pushIf(p, "age_max", f.age_max);
  pushIf(p, "birth_year_from", f.birth_year_from);
  pushIf(p, "birth_year_to", f.birth_year_to);
  pushIf(p, "volunteer_area", f.volunteer_area);
  pushIf(p, "gender", f.gender);
  pushIf(p, "ekl_ar", f.ekl_ar);
  pushIf(p, "electoral_district", f.electoral_district);
  pushIf(p, "has_request", f.has_request);
  pushIf(p, "request_status", f.request_status);
  pushIf(p, "limit", f.limit);
  if (f.page && f.page !== "1") p.set("page", f.page);
  if (opts?.forPage) p.set("vf", "1");
  return p;
}

/**
 * /contacts?a=b — query string for Next router.
 */
export function buildContactsPageUrl(f: ContactListFilters): string {
  const s = contactFiltersToSearchParams(f, { forPage: true }).toString();
  return s ? `/contacts?${s}` : "/contacts?vf=1";
}

export function buildContactSearchPageUrl(f: ContactListFilters): string {
  const s = contactFiltersToSearchParams(f).toString();
  return s ? `/contacts/search?${s}` : "/contacts/search";
}

export function hasActiveContactFilters(f: ContactListFilters): boolean {
  const d = getDefaultContactFilters();
  const keys = Object.keys(d) as (keyof ContactListFilters)[];
  for (const k of keys) {
    const a = f[k];
    const b = d[k];
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length || a.some((v, i) => v !== b[i])) return true;
    } else if (a !== b) return true;
  }
  return false;
}

const DEFAULT_FILTERS: ContactListFilters = {
  search: "",
  first_name: "",
  last_name: "",
  father_name: "",
  call_status: "",
  call_statuses: [],
  area: "",
  municipalities: [],
  toponyms: [],
  priority: "",
  tag: "",
  political_stance: "",
  phone: "",
  mobile_presence: "",
  landline_presence: "",
  email_presence: "",
  group_id: "",
  group_ids: [],
  exclude_group_ids: [],
  group_match: "or",
  source_ids: [],
  exclude_source_ids: [],
  not_contacted_days: "",
  score_tier: "",
  is_volunteer: false,
  nameday_today: false,
  birthday_today: false,
  age_min: "",
  age_max: "",
  birth_year_from: "",
  birth_year_to: "",
  volunteer_area: "",
  gender: "",
  ekl_ar: "",
  electoral_district: "",
  has_request: "",
  request_status: "",
  limit: "",
  page: "1",
};

export function getDefaultContactFilters(): ContactListFilters {
  // Deep-clone arrays so callers cannot mutate the shared DEFAULT_FILTERS singleton.
  return {
    ...DEFAULT_FILTERS,
    call_statuses: [],
    municipalities: [],
    toponyms: [],
    group_ids: [],
    exclude_group_ids: [],
    source_ids: [],
    exclude_source_ids: [],
  };
}

/** Clone filter state so nested arrays are independent of the source object. */
export function cloneContactListFilters(f: ContactListFilters): ContactListFilters {
  return {
    ...f,
    call_statuses: [...(f.call_statuses ?? [])],
    municipalities: [...(f.municipalities ?? [])],
    toponyms: [...(f.toponyms ?? [])],
    group_ids: [...(f.group_ids ?? [])],
    exclude_group_ids: [...(f.exclude_group_ids ?? [])],
    source_ids: [...(f.source_ids ?? [])],
    exclude_source_ids: [...(f.exclude_source_ids ?? [])],
  };
}

/**
 * `filters` from saved_filters JSON: flexible keys, merged with defaults.
 */
export function applySavedFilterJson(
  j: Record<string, unknown> | null | undefined,
  groupsByName?: Map<string, string>,
): ContactListFilters {
  const base = getDefaultContactFilters();
  if (!j || typeof j !== "object") return base;
  const o = j as Record<string, unknown>;
  if (typeof o.search === "string") base.search = o.search;
  if (typeof o.first_name === "string") base.first_name = o.first_name;
  if (typeof o.last_name === "string") base.last_name = o.last_name;
  if (typeof o.father_name === "string") base.father_name = o.father_name;
  if (Array.isArray(o.toponyms)) base.toponyms = o.toponyms.map(String);
  else if (typeof o.toponym === "string" && o.toponym.trim()) base.toponyms = [o.toponym.trim()];
  if (o.mobile_presence === "has" || o.mobile_presence === "not") base.mobile_presence = o.mobile_presence;
  if (o.landline_presence === "has" || o.landline_presence === "not") {
    base.landline_presence = o.landline_presence;
  }
  if (o.email_presence === "has" || o.email_presence === "not") base.email_presence = o.email_presence;
  if (o.group_match === "and") base.group_match = "and";
  if (Array.isArray(o.source_ids)) base.source_ids = o.source_ids.map(String);
  if (Array.isArray(o.exclude_source_ids)) base.exclude_source_ids = o.exclude_source_ids.map(String);
  if (o.birthday_today === true) base.birthday_today = true;
  if (o.ekl_ar === "has" || o.ekl_ar === "not") base.ekl_ar = o.ekl_ar;
  if (typeof o.electoral_district === "string") base.electoral_district = o.electoral_district;
  if (o.has_request === "has" || o.has_request === "not") base.has_request = o.has_request;
  if (typeof o.request_status === "string") base.request_status = o.request_status;
  if (Array.isArray(o.call_statuses)) base.call_statuses = o.call_statuses.map(String);
  if (Array.isArray(o.call_status) && o.call_status.length) {
    base.call_statuses = o.call_status.map(String);
    base.call_status = "";
  } else if (typeof o.call_status === "string" && o.call_status && !base.call_statuses.length) {
    base.call_status = o.call_status;
  }
  if (typeof o.area === "string") base.area = o.area;
  if (Array.isArray(o.municipalities)) base.municipalities = o.municipalities.map(String);
  else if (typeof o.municipality === "string" && o.municipality.trim()) {
    base.municipalities = [o.municipality.trim()];
  }
  if (typeof o.priority === "string") base.priority = o.priority;
  if (typeof o.tag === "string") base.tag = o.tag;
  if (typeof o.political_stance === "string") base.political_stance = o.political_stance;
  if (typeof o.phone === "string") base.phone = o.phone;
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const resolveGroupNameOrId = (raw: unknown): string | null => {
    const s = String(raw).trim();
    if (!s) return null;
    if (uuidRe.test(s)) return s;
    if (groupsByName) {
      const id = groupsByName.get(groupNameLookupKey(s));
      if (id) return id;
    }
    return s;
  };
  if (typeof o.group_id === "string") {
    base.group_id = resolveGroupNameOrId(o.group_id) ?? o.group_id;
  }
  if (Array.isArray(o.group_ids)) {
    base.group_ids = o.group_ids
      .map((x) => resolveGroupNameOrId(x))
      .filter((x): x is string => Boolean(x));
  }
  if (Array.isArray(o.groups_include)) {
    base.group_ids = o.groups_include
      .map((x) => resolveGroupNameOrId(x))
      .filter((x): x is string => Boolean(x));
  }
  if (Array.isArray(o.groups_exclude)) {
    base.exclude_group_ids = o.groups_exclude
      .map((x) => resolveGroupNameOrId(x))
      .filter((x): x is string => Boolean(x));
  } else if (Array.isArray(o.exclude_group_ids)) {
    base.exclude_group_ids = o.exclude_group_ids
      .map((x) => resolveGroupNameOrId(x))
      .filter((x): x is string => Boolean(x));
  }
  if (typeof o.not_contacted_days === "string" || typeof o.not_contacted_days === "number") {
    base.not_contacted_days = String(o.not_contacted_days);
  }
  if (typeof o.score_tier === "string") base.score_tier = o.score_tier;
  if (o.is_volunteer === true) base.is_volunteer = true;
  if (typeof o.age_min === "number" || typeof o.age_min === "string") base.age_min = String(o.age_min);
  if (typeof o.age_max === "number" || typeof o.age_max === "string") base.age_max = String(o.age_max);
  if (typeof o.birth_year_from === "number" || typeof o.birth_year_from === "string") {
    base.birth_year_from = String(o.birth_year_from);
  }
  if (typeof o.birth_year_to === "number" || typeof o.birth_year_to === "string") {
    base.birth_year_to = String(o.birth_year_to);
  }
  if (typeof o.volunteer_area === "string") base.volunteer_area = o.volunteer_area;
  if (o.nameday_today === true) base.nameday_today = true;
  if (typeof o.gender === "string") base.gender = o.gender;
  return base;
}

/** Merge `find_contacts` tool input onto filters (tool wins over previous). */
export function applyFindContactsToolInput(
  base: ContactListFilters,
  raw: Record<string, unknown>,
  groupsByName: Map<string, string>,
): ContactListFilters {
  const o = { ...base };
  const s = (k: string) => (typeof raw[k] === "string" ? String(raw[k]).trim() : "");
  if (s("search")) o.search = s("search");
  if (Array.isArray(raw.municipalities) && raw.municipalities.length) {
    o.municipalities = uniq(raw.municipalities.map((x) => String(x).trim()).filter(Boolean));
  } else if (s("municipality")) {
    o.municipalities = [s("municipality")];
  }
  if (Array.isArray(raw.toponyms) && raw.toponyms.length) {
    o.toponyms = uniq(raw.toponyms.map((x) => String(x).trim()).filter(Boolean));
  } else if (s("toponym")) {
    o.toponyms = [s("toponym")];
  }
  if (s("area")) o.area = s("area");
  if (s("priority")) o.priority = s("priority");
  if (s("tag")) o.tag = s("tag");
  if (s("phone")) o.phone = s("phone");
  if (s("political_stance")) o.political_stance = s("political_stance");
  if (Array.isArray(raw.call_statuses) && raw.call_statuses.length) {
    o.call_statuses = raw.call_statuses.map((x) => String(x));
    o.call_status = "";
  } else if (s("call_status")) {
    o.call_status = s("call_status");
    o.call_statuses = [];
  }
  const resolveGroupRef = (raw: string): string => {
    const t = raw.trim();
    if (!t) return "";
    return groupsByName.get(groupNameLookupKey(t)) ?? t;
  };
  if (Array.isArray(raw.group_ids)) {
    o.group_ids = uniq(raw.group_ids.map((x) => resolveGroupRef(String(x))).filter(Boolean));
  }
  if (Array.isArray(raw.exclude_group_ids)) {
    o.exclude_group_ids = uniq(raw.exclude_group_ids.map((x) => resolveGroupRef(String(x))).filter(Boolean));
  }
  if (Array.isArray(raw.groups_include)) {
    const inc: string[] = [];
    for (const x of raw.groups_include) {
      const t = String(x).trim();
      if (!t) continue;
      inc.push(groupsByName.get(groupNameLookupKey(t)) ?? t);
    }
    o.group_ids = uniq(inc);
  }
  if (Array.isArray(raw.groups_exclude)) {
    const ex: string[] = [];
    for (const x of raw.groups_exclude) {
      const t = String(x).trim();
      if (!t) continue;
      ex.push(groupsByName.get(groupNameLookupKey(t)) ?? t);
    }
    o.exclude_group_ids = uniq(ex);
  }
  const nstr = (k: string) => {
    const v = raw[k];
    if (v == null) return "";
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    return s(k);
  };
  if (nstr("age_min")) o.age_min = nstr("age_min");
  if (nstr("age_max")) o.age_max = nstr("age_max");
  if (nstr("birth_year_from")) o.birth_year_from = nstr("birth_year_from");
  if (nstr("birth_year_to")) o.birth_year_to = nstr("birth_year_to");
  if (nstr("not_contacted_days")) o.not_contacted_days = nstr("not_contacted_days");
  if (s("score_tier")) o.score_tier = s("score_tier");
  if (raw.is_volunteer === true) o.is_volunteer = true;
  if (s("volunteer_area")) o.volunteer_area = s("volunteer_area");
  if (raw.nameday_today === true) o.nameday_today = true;
  if (s("gender")) o.gender = s("gender");
  if (s("group_id") && !o.group_ids.length) o.group_id = resolveGroupRef(s("group_id"));
  if (nstr("limit")) o.limit = nstr("limit");
  return o;
}

const STATUS_LABEL: Record<string, string> = {
  Pending: "Νέα",
  Positive: "Θετική",
  Negative: "Αρνητική",
  "No Answer": "Δεν απαντά",
};

export function summarizeContactFilters(f: ContactListFilters, groupNames: Map<string, string>): string {
  const parts: string[] = [];
  if (f.call_statuses.length) {
    parts.push(f.call_statuses.map((x) => STATUS_LABEL[x] ?? x).join(", "));
  } else if (f.call_status) {
    parts.push(STATUS_LABEL[f.call_status] ?? f.call_status);
  }
  if (f.municipalities.length) parts.push(`Δήμος που μένει: ${f.municipalities.join(", ")}`);
  if (f.toponyms.length) parts.push(`Τοπωνύμια: ${f.toponyms.join(", ")}`);
  f.group_ids.forEach((id) => parts.push(`Ομάδα: ${groupNames.get(id) ?? id}`));
  f.exclude_group_ids.forEach((id) => parts.push(`Χωρίς: ${groupNames.get(id) ?? id}`));
  if (f.group_id && !f.group_ids.length) parts.push(`Ομάδα: ${groupNames.get(f.group_id) ?? f.group_id}`);
  if (f.birth_year_from || f.birth_year_to) {
    parts.push(`Γέννηση: ${f.birth_year_from || "—"}–${f.birth_year_to || "—"}`);
  }
  if (f.age_min || f.age_max) {
    parts.push(`Ηλικία: ${f.age_min || "—"}–${f.age_max || "—"}`);
  }
  if (f.search) parts.push(`Αναζήτηση: ${f.search}`);
  if (f.priority) parts.push(`Προτ.: ${f.priority}`);
  if (f.not_contacted_days) parts.push(`Χωρίς κλήση ${f.not_contacted_days}ημ.`);
  if (f.score_tier) parts.push(`Σκορ: ${f.score_tier}`);
  if (f.is_volunteer) parts.push("Μόνο εθελοντές");
  if (f.gender) parts.push(`Φύλο: ${f.gender}`);
  return parts.length ? parts.join(" · ") : "—";
}

/**
 * Build GET `/api/contacts/export` query params.
 *
 * Uses the same individual filter keys as `/api/contacts` (`group_ids`,
 * `municipalities`, …). `filters=1` is an apply-active-filters flag (not a
 * saved-filter id). Also mirrors advanced-search list semantics with
 * `partial_location=1`.
 */
export function contactFiltersToExportParams(f: ContactListFilters): URLSearchParams {
  const p = contactFiltersToSearchParams(cloneContactListFilters(f));
  // Pagination belongs to list views only — export returns the full matching set.
  p.delete("page");
  p.delete("limit");
  p.set("filters", "1");
  p.set("partial_location", "1");
  return p;
}

/**
 * Rebuild export params from a previous `/api/contacts` query string so export
 * matches the exact filter set that produced the current result count.
 */
export function listSearchParamsToExportParams(listParams: URLSearchParams): URLSearchParams {
  const p = new URLSearchParams(listParams.toString());
  p.delete("page");
  p.delete("page_size");
  p.delete("limit");
  p.delete("format");
  p.set("filters", "1");
  if (!p.has("partial_location")) p.set("partial_location", "1");
  return p;
}
