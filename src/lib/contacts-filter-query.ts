import type { SupabaseClient } from "@supabase/supabase-js";
import {
  contactHasAnyCampaignPhone,
  type CampaignPhoneFields,
} from "@/lib/campaign-contact-phone";
import { CONTACT_SEARCH_AGE_GROUPS } from "@/lib/contact-search-constants";
import {
  getDefaultContactFilters,
  type ContactListFilters,
} from "@/lib/contacts-filters";
import {
  CONTACTS_EXPORT_LIMIT,
  queryContactsListRows,
} from "@/lib/contacts-list-api";

/** Campaign create / preview filter payload (subset of advanced contact search). */
export type ContactFilter = {
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
  if (v === "" || v === "any") return "";
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
  return {
    ...base,
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

/** Persistable filter JSON (omits empty fields). has_phone defaults to "has". */
export function serializeCampaignFilter(f: ContactFilter): Record<string, unknown> {
  const out: Record<string, unknown> = {};
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
  let has_phone: ContactFilter["has_phone"];
  if (hasRaw === true || hasRaw === "has" || hasRaw === "1" || hasRaw === "yes") has_phone = "has";
  else if (hasRaw === false || hasRaw === "not" || hasRaw === "0" || hasRaw === "no") has_phone = "not";
  else if (hasRaw === "" || hasRaw === "any") has_phone = "";
  else if (typeof hasRaw === "string") has_phone = hasRaw as ContactFilter["has_phone"];

  return {
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
  return Boolean(
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
 * Resolve contact IDs with the same plan/pipeline as GET /api/contacts.
 * By default applies has_phone (campaign default: has). Pass applyHasPhone:false for preview splits.
 */
export async function listContactIdsMatching(
  supabase: SupabaseClient,
  f: ContactFilter,
  opts?: { applyHasPhone?: boolean; defaultHasPhone?: boolean },
): Promise<{ ids: string[]; error: string | null }> {
  try {
    const listFilters = campaignFilterToListFilters(f);
    const { contacts } = await queryContactsListRows(supabase, listFilters, {
      limit: CONTACTS_EXPORT_LIMIT,
    });
    let ids = contacts
      .map((r) => String((r as { id?: unknown }).id ?? "").trim())
      .filter(Boolean);

    const apply = opts?.applyHasPhone !== false;
    if (apply) {
      const presence = normalizeCampaignHasPhone(f.has_phone, opts?.defaultHasPhone ?? true);
      if (presence) {
        const phones = await fetchPhoneFieldsForIds(supabase, ids);
        ids = applyHasPhoneToIds(ids, phones, presence);
      }
    }

    return { ids: [...new Set(ids)], error: null };
  } catch (e) {
    return { ids: [], error: e instanceof Error ? e.message : "Σφάλμα φίλτρου επαφών" };
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
    return {
      with_phone: 0,
      without_phone: 0,
      error: e instanceof Error ? e.message : "Σφάλμα",
    };
  }
}
