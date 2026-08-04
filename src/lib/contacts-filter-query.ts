import type { SupabaseClient } from "@supabase/supabase-js";
import {
  contactHasAnyCampaignPhone,
  type CampaignPhoneFields,
} from "@/lib/campaign-contact-phone";
import { CONTACT_SEARCH_AGE_GROUPS } from "@/lib/contact-search-constants";
import {
  contactIdsInGroupsAmong,
  filterRowsByDeferredGroupMembership,
  resolveContactListFilterIds,
  resolveGroupIdsToUuids,
} from "@/lib/contact-group-members";
import {
  getDefaultContactFilters,
  type ContactListFilters,
} from "@/lib/contacts-filters";
import {
  CONTACTS_EXPORT_LIMIT,
  queryContactsListRows,
} from "@/lib/contacts-list-api";
import {
  filterContactRowsByListFilters,
  hasNameColumnFilters,
  searchContactsByName,
} from "@/lib/contacts-query";

/** Campaign create / preview filter payload (subset of advanced contact search). */
export type ContactFilter = {
  /**
   * Όνομα — accent-insensitive via name / advanced RPC (`first_name` + nickname).
   * Parse also accepts aliases `name` / `search`; persisted as `first_name`.
   */
  first_name?: string;
  last_name?: string;
  father_name?: string;
  call_status?: string;
  area?: string;
  municipality?: string;
  /** Prefer over single municipality when present. */
  municipalities?: string[];
  toponym?: string;
  toponyms?: string[];
  priority?: string;
  tag?: string;
  /** Contact group UUIDs (OR membership). */
  group_ids?: string[];
  exclude_group_ids?: string[];
  gender?: string;
  political_stance?: string;
  age_min?: string | number;
  age_max?: string | number;
  /** Age bracket keys: 17-20, 20-40, 40-70, 70+ */
  age_groups?: string[];
  /**
   * has = only contacts with any dialable phone (default for campaigns).
   * not = only without phone.
   * "" / any = no phone filter on matching (preview still reports with/without).
   */
  has_phone?: "has" | "not" | "" | "any";
};

export type CampaignPhonePresence = "has" | "not" | "";

export function normalizeCampaignHasPhone(
  v: ContactFilter["has_phone"] | undefined,
  defaultHas = true,
): CampaignPhonePresence {
  if (v === "has" || v === "not") return v;
  // Explicit "" / "any" → ignore phone filter (same as unset for filtering purposes).
  if (v === "" || v === "any") return "";
  // Omitted → campaign default (usually dialable-only).
  return defaultHas ? "has" : "";
}

function uniqStrings(ids: string[] | undefined): string[] {
  if (!ids?.length) return [];
  return [...new Set(ids.map((x) => String(x).trim()).filter(Boolean))];
}

function ageBoundsFromFilter(f: ContactFilter): { age_min: string; age_max: string } {
  const groups = uniqStrings(f.age_groups).filter((k) => k in CONTACT_SEARCH_AGE_GROUPS);
  if (groups.length > 0) {
    const mins = groups.map((k) => CONTACT_SEARCH_AGE_GROUPS[k]!.min);
    const maxs = groups.map((k) => CONTACT_SEARCH_AGE_GROUPS[k]!.max);
    return {
      age_min: String(Math.min(...mins)),
      age_max: String(Math.max(...maxs)),
    };
  }
  const amin = f.age_min != null && String(f.age_min).trim() ? String(f.age_min).trim() : "";
  const amax = f.age_max != null && String(f.age_max).trim() ? String(f.age_max).trim() : "";
  return { age_min: amin, age_max: amax };
}

function resolveCampaignNameFields(f: ContactFilter): {
  first_name: string;
  last_name: string;
  father_name: string;
} {
  return {
    first_name: f.first_name?.trim() || "",
    last_name: f.last_name?.trim() || "",
    father_name: f.father_name?.trim() || "",
  };
}

/**
 * Map campaign name fields → ContactListFilters for name / advanced RPC.
 * Single «ΟΝΟΜΑ» persists as `first_name` and is searched as first_name only
 * (not last_name / father_name).
 */
function campaignNameToListNameFilters(f: ContactFilter): Pick<
  ContactListFilters,
  "first_name" | "last_name" | "father_name" | "search"
> {
  const { first_name, last_name, father_name } = resolveCampaignNameFields(f);
  return { first_name, last_name, father_name, search: "" };
}

/** Map campaign filter → ContactListFilters for buildContactQueryPlan / list pipeline. */
export function campaignFilterToListFilters(f: ContactFilter): ContactListFilters {
  const base = getDefaultContactFilters();
  const municipalities = uniqStrings(
    f.municipalities?.length
      ? f.municipalities
      : f.municipality?.trim()
        ? [f.municipality.trim()]
        : [],
  );
  const toponyms = uniqStrings(
    f.toponyms?.length ? f.toponyms : f.toponym?.trim() ? [f.toponym.trim()] : [],
  );
  const { age_min, age_max } = ageBoundsFromFilter(f);
  const name = campaignNameToListNameFilters(f);
  return {
    ...base,
    ...name,
    call_status: f.call_status?.trim() || "",
    area: f.area?.trim() || "",
    municipalities,
    toponyms,
    priority: f.priority?.trim() || "",
    tag: f.tag?.trim() || "",
    group_ids: uniqStrings(f.group_ids),
    exclude_group_ids: uniqStrings(f.exclude_group_ids),
    gender: f.gender?.trim() || "",
    political_stance: f.political_stance?.trim() || "",
    age_min,
    age_max,
  };
}

/** Alias used by campaign create/preview (same mapper as advanced contact search). */
export const campaignFiltersToContactListFilters = campaignFilterToListFilters;

/**
 * Apply exclude_group_ids against an already-narrowed row set via membership checks among
 * those IDs only — never fetches the full exclude member list.
 */
async function excludeNameRowsByGroups(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[],
  excludeGroupIds: string[],
): Promise<Record<string, unknown>[]> {
  const uuids = await resolveGroupIdsToUuids(supabase, uniqStrings(excludeGroupIds));
  if (!uuids.length || !rows.length) {
    console.log("[listContactIdsMatching] exclude among name set", {
      exclude_group_uuids: uuids,
      name_before: rows.length,
      excluded: 0,
      name_after: rows.length,
    });
    return rows;
  }
  const contactIds = rows.map((r) => String(r.id ?? "").trim()).filter(Boolean);
  const inExclude = await contactIdsInGroupsAmong(supabase, uuids, contactIds, "or");
  const filtered = rows.filter((row) => !inExclude.has(String(row.id ?? "").trim()));
  console.log("[listContactIdsMatching] exclude among name set", {
    exclude_group_uuids: uuids,
    name_before: rows.length,
    excluded: inExclude.size,
    name_after: filtered.length,
  });
  return filtered;
}

/** Rest filter is only exclude groups (no include/columns) — cheapest invert path. */
function restIsExcludeGroupsOnly(rest: ContactFilter): boolean {
  const withoutExclude: ContactFilter = { ...rest, exclude_group_ids: undefined };
  return (
    Boolean(rest.exclude_group_ids?.length) && !contactFilterHasCriteria(withoutExclude)
  );
}

/**
 * Refine a name-narrowed row set by group/exclude/column filters (name-search-then-refine).
 * Never materializes a full large group — membership is tested against the small name set.
 */
async function refineCampaignNameRowsByRestFilters(
  supabase: SupabaseClient,
  nameRows: Record<string, unknown>[],
  rest: ContactFilter,
): Promise<Record<string, unknown>[]> {
  // Fast path: name set + exclude only → membership check on the small ID set.
  if (restIsExcludeGroupsOnly(rest)) {
    return excludeNameRowsByGroups(supabase, nameRows, rest.exclude_group_ids ?? []);
  }

  const listFilters = campaignFilterToListFilters(rest);
  // Always size-aware defer for groups: large includes stay deferred; small ones resolve eagerly.
  // Exclude is always deferred here — never contactIdsForGroups on ~24k members.
  const filterResolution = await resolveContactListFilterIds(supabase, listFilters, {
    deferLargeGroupMembership: true,
  });

  console.log("[listContactIdsMatching] refine after name", {
    name_before: nameRows.length,
    deferred_exclude: filterResolution.deferredExcludeGroupIds ?? [],
    deferred_include: filterResolution.deferredIncludeGroupIds?.length ?? 0,
    eager_exclude_ids: filterResolution.excludeContactIds.length,
    eager_include_ids: filterResolution.includeContactIds?.length ?? null,
  });

  let rows = await filterRowsByDeferredGroupMembership(supabase, nameRows, filterResolution);

  if (filterResolution.includeContactIds !== null) {
    const allow = new Set(filterResolution.includeContactIds);
    rows = rows.filter((row) => allow.has(String(row.id)));
  }

  // Belt-and-suspenders: if exclude IDs were eagerly resolved somehow, still filter in memory
  // on the small name set — never re-fetch the full group.
  return filterContactRowsByListFilters(
    rows as Parameters<typeof filterContactRowsByListFilters>[0],
    listFilters,
    {
      partialLocation: false,
      excludeContactIds: filterResolution.excludeContactIds,
    },
  ) as Record<string, unknown>[];
}

/**
 * Campaign name search via search_contacts_by_name.
 * Όνομα (`first_name`) searches first_name (+ nickname in RPC) only —
 * p_last_name / p_father_name stay null unless those fields are explicitly set.
 */
async function fetchCampaignNameRows(
  supabase: SupabaseClient,
  f: ContactFilter,
): Promise<Record<string, unknown>[]> {
  const { first_name, last_name, father_name } = resolveCampaignNameFields(f);
  return searchContactsByName(supabase, {
    firstName: first_name || null,
    lastName: last_name || null,
    fatherName: father_name || null,
  });
}

/** Surface PostgREST / plain-object throws (not always `instanceof Error`). */
function formatContactFilterError(e: unknown): string {
  if (e instanceof Error && e.message.trim()) return e.message;
  if (e && typeof e === "object" && "message" in e) {
    const msg = (e as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  if (typeof e === "string" && e.trim()) return e;
  return "Σφάλμα φίλτρου επαφών";
}

/** Persistable filter JSON (omits empty fields). has_phone defaults to "has". */
export function serializeCampaignFilter(f: ContactFilter): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const { first_name, last_name, father_name } = resolveCampaignNameFields(f);
  // Prefer first_name key (matches advanced search Όνομα); omit empty.
  if (first_name) out.first_name = first_name;
  if (last_name) out.last_name = last_name;
  if (father_name) out.father_name = father_name;
  if (f.call_status?.trim()) out.call_status = f.call_status.trim();
  if (f.area?.trim()) out.area = f.area.trim();
  const municipalities = uniqStrings(
    f.municipalities?.length
      ? f.municipalities
      : f.municipality?.trim()
        ? [f.municipality.trim()]
        : [],
  );
  if (municipalities.length === 1) out.municipality = municipalities[0];
  else if (municipalities.length > 1) out.municipalities = municipalities;
  const toponyms = uniqStrings(
    f.toponyms?.length ? f.toponyms : f.toponym?.trim() ? [f.toponym.trim()] : [],
  );
  if (toponyms.length === 1) out.toponym = toponyms[0];
  else if (toponyms.length > 1) out.toponyms = toponyms;
  if (f.priority?.trim()) out.priority = f.priority.trim();
  if (f.tag?.trim()) out.tag = f.tag.trim();
  const group_ids = uniqStrings(f.group_ids);
  if (group_ids.length) out.group_ids = group_ids;
  const exclude_group_ids = uniqStrings(f.exclude_group_ids);
  if (exclude_group_ids.length) out.exclude_group_ids = exclude_group_ids;
  if (f.gender?.trim()) out.gender = f.gender.trim();
  if (f.political_stance?.trim()) out.political_stance = f.political_stance.trim();
  const age_groups = uniqStrings(f.age_groups).filter((k) => k in CONTACT_SEARCH_AGE_GROUPS);
  if (age_groups.length) {
    out.age_groups = age_groups;
    const { age_min, age_max } = ageBoundsFromFilter({ age_groups });
    out.age_min = age_min;
    out.age_max = age_max;
  } else {
    const { age_min, age_max } = ageBoundsFromFilter(f);
    if (age_min) out.age_min = age_min;
    if (age_max) out.age_max = age_max;
  }
  const hasPhone = normalizeCampaignHasPhone(f.has_phone, true);
  out.has_phone = hasPhone || "any";
  return out;
}

export function parseCampaignFilterBody(raw: unknown): ContactFilter {
  if (!raw || typeof raw !== "object") return {};
  const b = raw as Record<string, unknown>;
  const str = (k: string) => {
    const v = b[k];
    return v == null ? undefined : String(v).trim() || undefined;
  };
  const strArr = (k: string): string[] | undefined => {
    const v = b[k];
    if (Array.isArray(v)) {
      const a = uniqStrings(v.map(String));
      return a.length ? a : undefined;
    }
    if (typeof v === "string" && v.trim()) {
      const a = uniqStrings(v.split(","));
      return a.length ? a : undefined;
    }
    return undefined;
  };
  const hasRaw = b.has_phone;
  let has_phone: ContactFilter["has_phone"] | undefined;
  if (hasRaw === true || hasRaw === "has" || hasRaw === "1" || hasRaw === "yes") has_phone = "has";
  else if (hasRaw === false || hasRaw === "not" || hasRaw === "0" || hasRaw === "no") has_phone = "not";
  // "" / "any" → ignore phone filter (same effect as unset for matching; keep "" so create
  // does not re-default to "has").
  else if (hasRaw === "" || hasRaw === "any") has_phone = "";
  else if (typeof hasRaw === "string" && hasRaw.trim()) {
    has_phone = hasRaw.trim() as ContactFilter["has_phone"];
  }

  // Aliases: name / search → first_name (single Όνομα box).
  const first_name = str("first_name") ?? str("name") ?? str("search");
  return {
    first_name,
    last_name: str("last_name"),
    father_name: str("father_name"),
    call_status: str("call_status"),
    area: str("area"),
    municipality: str("municipality"),
    municipalities: strArr("municipalities"),
    toponym: str("toponym"),
    toponyms: strArr("toponyms"),
    priority: str("priority"),
    tag: str("tag"),
    group_ids: strArr("group_ids"),
    exclude_group_ids: strArr("exclude_group_ids"),
    gender: str("gender"),
    political_stance: str("political_stance"),
    age_min: str("age_min"),
    age_max: str("age_max"),
    age_groups: strArr("age_groups"),
    has_phone,
  };
}

/** True if any audience criterion is set (has_phone alone does not count). */
export function contactFilterHasCriteria(f: ContactFilter): boolean {
  const municipalities = uniqStrings(
    f.municipalities?.length
      ? f.municipalities
      : f.municipality?.trim()
        ? [f.municipality.trim()]
        : [],
  );
  const toponyms = uniqStrings(
    f.toponyms?.length ? f.toponyms : f.toponym?.trim() ? [f.toponym.trim()] : [],
  );
  const { age_min, age_max } = ageBoundsFromFilter(f);
  const { first_name, last_name, father_name } = resolveCampaignNameFields(f);
  return Boolean(
    first_name ||
      last_name ||
      father_name ||
      f.call_status?.trim() ||
      f.area?.trim() ||
      municipalities.length ||
      toponyms.length ||
      f.priority?.trim() ||
      f.tag?.trim() ||
      (f.group_ids && f.group_ids.length > 0) ||
      (f.exclude_group_ids && f.exclude_group_ids.length > 0) ||
      f.gender?.trim() ||
      f.political_stance?.trim() ||
      age_min ||
      age_max,
  );
}

/** Chip labels for campaign card/detail (name filter). */
export function campaignFilterChips(
  raw: ContactFilter | Record<string, unknown> | null | undefined,
): string[] {
  const f = parseCampaignFilterBody(raw ?? {});
  const chips: string[] = [];
  const { first_name, last_name, father_name } = resolveCampaignNameFields(f);
  if (first_name) chips.push(`Όνομα: ${first_name}`);
  if (last_name) chips.push(`Επώνυμο: ${last_name}`);
  if (father_name) chips.push(`Πατρώνυμο: ${father_name}`);
  return chips;
}

async function fetchPhoneFieldsForIds(
  supabase: SupabaseClient,
  ids: string[],
): Promise<Map<string, CampaignPhoneFields>> {
  const map = new Map<string, CampaignPhoneFields>();
  const CHUNK = 500;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("contacts")
      .select("id, phone, phone2, landline")
      .in("id", slice);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as Array<CampaignPhoneFields & { id: string }>) {
      map.set(row.id, row);
    }
  }
  return map;
}

function applyHasPhoneToIds(
  ids: string[],
  phones: Map<string, CampaignPhoneFields>,
  presence: CampaignPhonePresence,
): string[] {
  if (!presence) return ids;
  return ids.filter((id) => {
    const has = contactHasAnyCampaignPhone(phones.get(id));
    return presence === "has" ? has : !has;
  });
}

export async function countContactsMatching(
  supabase: SupabaseClient,
  f: ContactFilter,
): Promise<{ count: number; error: string | null }> {
  const { ids, error } = await listContactIdsMatching(supabase, f, { applyHasPhone: false });
  if (error) return { count: 0, error };
  return { count: ids.length, error: null };
}

/**
 * Resolve contact IDs for campaign create/preview.
 * By default applies has_phone (campaign default: has). Pass applyHasPhone:false for preview splits.
 *
 * Routing:
 * - Any name field set: search_contacts_by_name first (Όνομα = first_name only;
 *   last/father only when those fields are set), then refine groups/exclude/columns
 *   on that small set via contactIdsInGroupsAmong.
 * - Group / municipality / call_status / gender without name: queryContactsListRows
 *   → search_contacts_advanced when canUseAdvancedSearchRpc.
 */
export async function listContactIdsMatching(
  supabase: SupabaseClient,
  f: ContactFilter,
  opts?: { applyHasPhone?: boolean; defaultHasPhone?: boolean },
): Promise<{ ids: string[]; error: string | null; match_total?: number }> {
  try {
    const listForNameCheck = campaignFilterToListFilters(f);
    const hasName = hasNameColumnFilters(listForNameCheck);
    let ids: string[];
    let match_total: number | undefined;

    if (hasName) {
      const nameRows = await fetchCampaignNameRows(supabase, f);
      const rest: ContactFilter = {
        ...f,
        first_name: undefined,
        last_name: undefined,
        father_name: undefined,
      };

      const { first_name, last_name, father_name } = resolveCampaignNameFields(f);
      console.log("[listContactIdsMatching] name-first", {
        name_match_count: nameRows.length,
        first_name: first_name || null,
        last_name: last_name || null,
        father_name: father_name || null,
        exclude_groups: uniqStrings(f.exclude_group_ids).length,
        include_groups: uniqStrings(f.group_ids).length,
        rest_has_criteria: contactFilterHasCriteria(rest),
      });

      if (contactFilterHasCriteria(rest)) {
        // Name first → refine by group/exclude/muni/call_status/… on the small set
        // (same inversion as name-search-then-refine; never fetch all group members).
        const refined = await refineCampaignNameRowsByRestFilters(supabase, nameRows, rest);
        ids = refined.map((r) => String(r.id ?? "").trim()).filter(Boolean);
        match_total = ids.length;
        console.log("[listContactIdsMatching] after refine", {
          name_before: nameRows.length,
          after_exclude: ids.length,
        });
      } else {
        ids = nameRows.map((r) => String(r.id ?? "").trim()).filter(Boolean);
        match_total = ids.length;
      }
    } else {
      // Groups / columns only → buildContactQueryPlan via list pipeline
      // (advanced-rpc when supported — exclude via EXISTS, not 24k ID materialization).
      const listFilters = campaignFilterToListFilters(f);
      const { contacts, total, plan, subPath } = await queryContactsListRows(supabase, listFilters, {
        limit: CONTACTS_EXPORT_LIMIT,
      });
      console.log("[listContactIdsMatching] plan (no name)", {
        path: plan.path,
        reason: plan.reason,
        subPath,
        total,
        returned: contacts.length,
        exclude_groups: listFilters.exclude_group_ids.length,
        include_groups: listFilters.group_ids.length,
      });
      ids = contacts
        .map((r) => String((r as { id?: unknown }).id ?? "").trim())
        .filter(Boolean);
      match_total = total;
    }

    const apply = opts?.applyHasPhone !== false;
    if (apply) {
      // "" / "any" / undefined → normalize: explicit any ignores; omitted may default to "has".
      const presence = normalizeCampaignHasPhone(f.has_phone, opts?.defaultHasPhone ?? true);
      if (presence) {
        const phones = await fetchPhoneFieldsForIds(supabase, ids);
        ids = applyHasPhoneToIds(ids, phones, presence);
      }
    }

    const unique = [...new Set(ids)];
    return { ids: unique, error: null, match_total };
  } catch (e) {
    const message = formatContactFilterError(e);
    console.error("[listContactIdsMatching] underlying error", message, e);
    return { ids: [], error: message };
  }
}

export async function countPhonesForContactIds(
  supabase: SupabaseClient,
  ids: string[],
): Promise<{ with_phone: number; without_phone: number; error: string | null }> {
  try {
    const unique = [...new Set(ids.map((x) => String(x).trim()).filter(Boolean))];
    if (!unique.length) return { with_phone: 0, without_phone: 0, error: null };
    const phones = await fetchPhoneFieldsForIds(supabase, unique);
    let with_phone = 0;
    let without_phone = 0;
    for (const id of unique) {
      if (contactHasAnyCampaignPhone(phones.get(id))) with_phone += 1;
      else without_phone += 1;
    }
    return { with_phone, without_phone, error: null };
  } catch (e) {
    const message = formatContactFilterError(e);
    console.error("[countPhonesForContactIds] underlying error", message, e);
    return {
      with_phone: 0,
      without_phone: 0,
      error: message,
    };
  }
}
