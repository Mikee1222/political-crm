/**
 * URL query <-> /api/requests and /requests/search filter state.
 */

export type RequestListFilters = {
  search: string;
  status: string;
  /** Category names or request_categories UUIDs (resolved server-side). */
  category_ids: string[];
  exclude_category_ids: string[];
  /** Direct contact UUID (preferred over name text). */
  requester_contact_id: string;
  requester_name: string;
  affected_contact_id: string;
  affected_name: string;
  helper_contact_id: string;
  helper_name: string;
  request_code: string;
  handler_id: string;
  notes: string;
  created_from: string;
  created_to: string;
  /** Legacy list page: single category name */
  category: string;
  priority: string;
  range: string;
  page: string;
};

function uniq(ids: string[]): string[] {
  return [...new Set(ids)];
}

function parseCsvParam(sp: URLSearchParams, key: string, prev?: string[]): string[] {
  const collected: string[] = [];
  for (const paramKey of [key, `${key}[]`]) {
    for (const raw of sp.getAll(paramKey)) {
      if (!raw?.trim()) continue;
      collected.push(...raw.split(",").map((x) => x.trim()).filter(Boolean));
    }
  }
  if (collected.length) return uniq(collected);
  return prev ?? [];
}

function pushIf(p: URLSearchParams, key: string, value: string | null | undefined | false) {
  if (value == null) return;
  if (value === false) return;
  if (typeof value === "string" && !value.trim()) return;
  p.set(key, String(value).trim());
}

const DEFAULT_FILTERS: RequestListFilters = {
  search: "",
  status: "",
  category_ids: [],
  exclude_category_ids: [],
  requester_contact_id: "",
  requester_name: "",
  affected_contact_id: "",
  affected_name: "",
  helper_contact_id: "",
  helper_name: "",
  request_code: "",
  handler_id: "",
  notes: "",
  created_from: "",
  created_to: "",
  category: "",
  priority: "",
  range: "",
  page: "1",
};

export function getDefaultRequestFilters(): RequestListFilters {
  return { ...DEFAULT_FILTERS };
}

export function searchParamsToRequestFilters(
  sp: URLSearchParams,
  prev?: Partial<RequestListFilters>,
): RequestListFilters {
  return {
    search: sp.get("search") ?? sp.get("q") ?? prev?.search ?? "",
    status: sp.get("status") ?? prev?.status ?? "",
    category_ids: parseCsvParam(sp, "category_ids", prev?.category_ids),
    exclude_category_ids: parseCsvParam(sp, "exclude_category_ids", prev?.exclude_category_ids),
    requester_contact_id:
      sp.get("requester_contact_id") ?? sp.get("requester_id") ?? prev?.requester_contact_id ?? "",
    requester_name: sp.get("requester_name") ?? prev?.requester_name ?? "",
    affected_contact_id:
      sp.get("affected_contact_id") ?? sp.get("affected_id") ?? prev?.affected_contact_id ?? "",
    affected_name: sp.get("affected_name") ?? prev?.affected_name ?? "",
    helper_contact_id:
      sp.get("helper_contact_id") ?? sp.get("helper_id") ?? prev?.helper_contact_id ?? "",
    helper_name: sp.get("helper_name") ?? prev?.helper_name ?? "",
    request_code: sp.get("request_code") ?? prev?.request_code ?? "",
    handler_id: sp.get("handler_id") ?? sp.get("assigned") ?? prev?.handler_id ?? "",
    notes: sp.get("notes") ?? prev?.notes ?? "",
    created_from: sp.get("created_from") ?? sp.get("date_from") ?? prev?.created_from ?? "",
    created_to: sp.get("created_to") ?? sp.get("date_to") ?? prev?.created_to ?? "",
    category: sp.get("category") ?? prev?.category ?? "",
    priority: sp.get("priority") ?? prev?.priority ?? "",
    range: sp.get("range") ?? prev?.range ?? "",
    page: sp.get("page") ?? prev?.page ?? "1",
  };
}

export function requestFiltersToSearchParams(f: RequestListFilters): URLSearchParams {
  const p = new URLSearchParams();
  pushIf(p, "search", f.search);
  pushIf(p, "status", f.status);
  if (f.category_ids.length) p.set("category_ids", f.category_ids.join(","));
  if (f.exclude_category_ids.length) p.set("exclude_category_ids", f.exclude_category_ids.join(","));
  pushIf(p, "requester_contact_id", f.requester_contact_id);
  pushIf(p, "requester_name", f.requester_name);
  pushIf(p, "affected_contact_id", f.affected_contact_id);
  pushIf(p, "affected_name", f.affected_name);
  pushIf(p, "helper_contact_id", f.helper_contact_id);
  pushIf(p, "helper_name", f.helper_name);
  pushIf(p, "request_code", f.request_code);
  pushIf(p, "handler_id", f.handler_id);
  pushIf(p, "notes", f.notes);
  pushIf(p, "created_from", f.created_from);
  pushIf(p, "created_to", f.created_to);
  pushIf(p, "category", f.category);
  pushIf(p, "priority", f.priority);
  pushIf(p, "range", f.range);
  if (f.page && f.page !== "1") p.set("page", f.page);
  return p;
}

export function buildRequestSearchPageUrl(f: RequestListFilters): string {
  const s = requestFiltersToSearchParams(f).toString();
  return s ? `/requests/search?${s}` : "/requests/search";
}

export function hasActiveRequestFilters(f: RequestListFilters): boolean {
  const d = getDefaultRequestFilters();
  const keys = Object.keys(d) as (keyof RequestListFilters)[];
  for (const k of keys) {
    const a = f[k];
    const b = d[k];
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length || a.some((v, i) => v !== b[i])) return true;
    } else if (a !== b) return true;
  }
  return false;
}
