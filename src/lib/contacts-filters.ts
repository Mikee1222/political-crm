/**
 * URL query <-> /api/contacts and /contacts filter state (shared: CRM list + Alexandra).
 */

export type ContactListFilters = {
  search: string;
  call_status: string;
  call_statuses: string[];
  area: string;
  municipality: string;
  priority: string;
  tag: string;
  political_stance: string;
  phone: string;
  group_id: string;
  group_ids: string[];
  exclude_group_ids: string[];
  not_contacted_days: string;
  score_tier: string;
  is_volunteer: boolean;
  nameday_today: boolean;
  age_min: string;
  age_max: string;
  birth_year_from: string;
  birth_year_to: string;
  volunteer_area: string;
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

/** From URLSearchParams to partial filter state; merge with existing defaults. */
export function searchParamsToFilters(sp: URLSearchParams, prev?: Partial<ContactListFilters>): ContactListFilters {
  const callStatuses = splitCsv(sp.get("call_statuses") ?? sp.get("call_status_in"));
  return {
    search: sp.get("search") ?? sp.get("name") ?? prev?.search ?? "",
    call_status: sp.get("call_status") ?? prev?.call_status ?? "",
    call_statuses: callStatuses.length ? callStatuses : (prev?.call_statuses ?? []),
    area: sp.get("area") ?? prev?.area ?? "",
    municipality: sp.get("municipality") ?? prev?.municipality ?? "",
    priority: sp.get("priority") ?? prev?.priority ?? "",
    tag: sp.get("tag") ?? prev?.tag ?? "",
    political_stance: sp.get("political_stance") ?? prev?.political_stance ?? "",
    phone: sp.get("phone") ?? prev?.phone ?? "",
    group_id: sp.get("group_id") ?? prev?.group_id ?? "",
    group_ids: (() => {
      const a = sp.get("group_ids");
      if (a) return uniq(a.split(",").map((x) => x.trim()).filter(Boolean));
      return prev?.group_ids ?? [];
    })(),
    exclude_group_ids: (() => {
      const a = sp.get("exclude_group_ids");
      if (a) return uniq(a.split(",").map((x) => x.trim()).filter(Boolean));
      return prev?.exclude_group_ids ?? [];
    })(),
    not_contacted_days: sp.get("not_contacted_days") ?? prev?.not_contacted_days ?? "",
    score_tier: sp.get("score_tier") ?? prev?.score_tier ?? "",
    is_volunteer: sp.get("is_volunteer") === "1" || sp.get("is_volunteer") === "true",
    nameday_today: sp.get("nameday_today") === "1",
    age_min: sp.get("age_min") ?? prev?.age_min ?? "",
    age_max: sp.get("age_max") ?? prev?.age_max ?? "",
    birth_year_from: sp.get("birth_year_from") ?? prev?.birth_year_from ?? "",
    birth_year_to: sp.get("birth_year_to") ?? prev?.birth_year_to ?? "",
    volunteer_area: sp.get("volunteer_area") ?? prev?.volunteer_area ?? "",
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
  if (f.call_statuses && f.call_statuses.length) {
    p.set("call_statuses", f.call_statuses.join(","));
  } else {
    pushIf(p, "call_status", f.call_status);
  }
  pushIf(p, "area", f.area);
  pushIf(p, "municipality", f.municipality);
  pushIf(p, "priority", f.priority);
  pushIf(p, "tag", f.tag);
  pushIf(p, "political_stance", f.political_stance);
  pushIf(p, "phone", f.phone);
  if (f.group_ids?.length) p.set("group_ids", f.group_ids.join(","));
  if (f.exclude_group_ids?.length) p.set("exclude_group_ids", f.exclude_group_ids.join(","));
  if (!f.group_ids?.length && f.group_id) p.set("group_id", f.group_id);
  pushIf(p, "not_contacted_days", f.not_contacted_days);
  pushIf(p, "score_tier", f.score_tier);
  if (f.is_volunteer) p.set("is_volunteer", "1");
  if (f.nameday_today) p.set("nameday_today", "1");
  pushIf(p, "age_min", f.age_min);
  pushIf(p, "age_max", f.age_max);
  pushIf(p, "birth_year_from", f.birth_year_from);
  pushIf(p, "birth_year_to", f.birth_year_to);
  pushIf(p, "volunteer_area", f.volunteer_area);
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

const DEFAULT_FILTERS: ContactListFilters = {
  search: "",
  call_status: "",
  call_statuses: [],
  area: "",
  municipality: "",
  priority: "",
  tag: "",
  political_stance: "",
  phone: "",
  group_id: "",
  group_ids: [],
  exclude_group_ids: [],
  not_contacted_days: "",
  score_tier: "",
  is_volunteer: false,
  nameday_today: false,
  age_min: "",
  age_max: "",
  birth_year_from: "",
  birth_year_to: "",
  volunteer_area: "",
  limit: "",
  page: "1",
};

export function getDefaultContactFilters(): ContactListFilters {
  return { ...DEFAULT_FILTERS };
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
  if (Array.isArray(o.call_statuses)) base.call_statuses = o.call_statuses.map(String);
  if (Array.isArray(o.call_status) && o.call_status.length) {
    base.call_statuses = o.call_status.map(String);
    base.call_status = "";
  } else if (typeof o.call_status === "string" && o.call_status && !base.call_statuses.length) {
    base.call_status = o.call_status;
  }
  if (typeof o.area === "string") base.area = o.area;
  if (typeof o.municipality === "string") base.municipality = o.municipality;
  if (typeof o.priority === "string") base.priority = o.priority;
  if (typeof o.tag === "string") base.tag = o.tag;
  if (typeof o.political_stance === "string") base.political_stance = o.political_stance;
  if (typeof o.phone === "string") base.phone = o.phone;
  if (typeof o.group_id === "string") base.group_id = o.group_id;
  if (Array.isArray(o.group_ids)) base.group_ids = o.group_ids.map(String);
  if (Array.isArray(o.groups_include)) base.group_ids = o.groups_include.map(String);
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (Array.isArray(o.groups_exclude)) {
    const ids: string[] = [];
    for (const x of o.groups_exclude) {
      const s = String(x).trim();
      if (uuidRe.test(s)) ids.push(s);
      else if (groupsByName) {
        const id = groupsByName.get(s.toLowerCase());
        if (id) ids.push(id);
      }
    }
    base.exclude_group_ids = ids;
  } else if (Array.isArray(o.exclude_group_ids)) {
    base.exclude_group_ids = o.exclude_group_ids.map(String);
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
  if (s("municipality")) o.municipality = s("municipality");
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
  if (Array.isArray(raw.group_ids)) o.group_ids = uniq(raw.group_ids.map((x) => String(x).trim()).filter(Boolean));
  if (Array.isArray(raw.exclude_group_ids)) {
    o.exclude_group_ids = uniq(raw.exclude_group_ids.map((x) => String(x).trim()).filter(Boolean));
  }
  if (Array.isArray(raw.groups_include)) o.group_ids = uniq(raw.groups_include.map((x) => String(x).trim()).filter(Boolean));
  if (Array.isArray(raw.groups_exclude)) {
    const ex: string[] = [];
    for (const x of raw.groups_exclude) {
      const t = String(x).trim();
      ex.push(groupsByName.get(t.toLowerCase()) ?? t);
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
  if (s("group_id") && !o.group_ids.length) o.group_id = s("group_id");
  if (nstr("limit")) o.limit = nstr("limit");
  return o;
}

const STATUS_LABEL: Record<string, string> = {
  Pending: "Αναμονή",
  Positive: "Θετικός",
  Negative: "Αρνητικός",
  "No Answer": "Δεν απάντησε",
};

export function summarizeContactFilters(f: ContactListFilters, groupNames: Map<string, string>): string {
  const parts: string[] = [];
  if (f.call_statuses.length) {
    parts.push(f.call_statuses.map((x) => STATUS_LABEL[x] ?? x).join(", "));
  } else if (f.call_status) {
    parts.push(STATUS_LABEL[f.call_status] ?? f.call_status);
  }
  if (f.municipality) parts.push(`Δήμος: ${f.municipality}`);
  if (f.area) parts.push(`Περιοχή: ${f.area}`);
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
  return parts.length ? parts.join(" · ") : "—";
}

export function contactFiltersToExportParams(f: ContactListFilters): URLSearchParams {
  const p = contactFiltersToSearchParams(f);
  p.set("filters", "1");
  return p;
}
