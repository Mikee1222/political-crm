import type { SupabaseClient } from "@supabase/supabase-js";
import { getContactIdsForNameDay } from "@/lib/nameday-celebrating";
import { contactMatchesFuzzyGreekSearch } from "@/lib/greek-fuzzy-name";
import type { ContactListFilters } from "@/lib/contacts-filters";
import {
  applyBirthdayAgeFiltersToBuilder,
  applyColumnContactFiltersToBuilder,
  applyContactListFiltersToBuilder,
  buildContactQueryPlan,
  canUseAdvancedSearchRpc,
  canUseNameSearchThenRefinePath,
  contactRowMatchesListFilters,
  fetchContactRowsInBatches,
  filterContactRowsByListFilters,
  hasColumnListFilters,
  hasGroupIncludeFilter,
  hasNameColumnFilters,
  hasNonFirstLastNameColumnFilters,
  searchContactsByName,
  type ContactQueryPlan,
} from "@/lib/contacts-query";
import {
  excludeContactIdsNeedInMemoryFilter,
  fetchContactsByIncludeIdBatches,
  filterRowsByDeferredGroupMembership,
  groupMembershipExceedsInClause,
  groupResolutionForSqlBuilder,
  includeContactIdsNeedBatchFetch,
  resolveContactListFilterIds,
  resolveGroupIdsToUuids,
  searchContactsAdvanced,
  searchContactsByFreeTextPaginated,
  searchContactsByGroupsPaginated,
  searchContactsInGroups,
  searchContactsInGroupsFiltered,
  type GroupFilterResolution,
} from "@/lib/contact-group-members";

const COUNT_SELECT =
  "id, first_name, last_name, father_name, phone, phone2, landline, nickname, area, municipality, toponym, gender, call_status, priority, tags, political_stance, birthday, age, electoral_district, predicted_score, is_volunteer, volunteer_area, last_contacted_at, may_not_have_mobile, may_not_have_landline, may_not_have_email";

const SELECT_LIST =
  "id, first_name, last_name, phone, phone2, landline, email, area, municipality, toponym, gender, call_status, priority, tags, nickname, contact_code, age, political_stance, group_id, birthday, predicted_score, is_volunteer, volunteer_role, volunteer_area, volunteer_since, language, last_contacted_at, father_name, name_day, is_dead, electoral_district, may_not_have_mobile, may_not_have_landline, may_not_have_email, created_at";

const SELECT_LIST_BATCH =
  "id, first_name, last_name, phone, phone2, landline, email, area, municipality, toponym, gender, call_status, priority, tags, nickname, contact_code, age, political_stance, group_id, birthday, predicted_score, is_volunteer, volunteer_role, volunteer_area, volunteer_since, language, last_contacted_at, father_name, name_day, is_dead, electoral_district, may_not_have_mobile, may_not_have_landline, may_not_have_email, created_at";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryBuilder = any;

export type ContactsListApiResult = {
  total: number;
  plan: ContactQueryPlan;
  subPath?: string;
};

function applyApiContactFilters(
  query: QueryBuilder,
  f: ContactListFilters,
  groupResolution: GroupFilterResolution,
  partialLocation = false,
  opts?: { skipNameColumnFilters?: boolean },
) {
  const filtersWithoutAge = { ...f, age_min: "", age_max: "" };
  query = applyContactListFiltersToBuilder(query, filtersWithoutAge, groupResolution, {
    partialLocation,
    skipNameColumnFilters: opts?.skipNameColumnFilters,
  });
  return applyBirthdayAgeFiltersToBuilder(query, f.age_min, f.age_max);
}

function afterFilterRows(rows: Record<string, unknown>[], search: string | null | undefined) {
  if (!search) return rows;
  return rows.filter((c) =>
    contactMatchesFuzzyGreekSearch(
      c as Parameters<typeof contactMatchesFuzzyGreekSearch>[0],
      search,
    ),
  );
}

function refineRowsWithColumnFilters(
  rows: Record<string, unknown>[],
  f: ContactListFilters,
  filterResolution: GroupFilterResolution,
  partialLocation: boolean,
) {
  let working = rows;
  if (filterResolution.excludeContactIds.length > 0) {
    const excl = new Set(filterResolution.excludeContactIds);
    working = working.filter((row) => !excl.has(String(row.id)));
  }
  if (!hasColumnListFilters(f)) return working;
  return filterContactRowsByListFilters(
    working as Parameters<typeof filterContactRowsByListFilters>[0],
    f,
    {
      partialLocation,
      excludeContactIds: [],
    },
  );
}

async function fetchContactsByResolvedIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  ids: string[],
  f: ContactListFilters,
  filterResolution: GroupFilterResolution,
  partialLocation: boolean,
) {
  const rows = await fetchContactsByIncludeIdBatches(
    supabase,
    ids,
    SELECT_LIST_BATCH,
    (q) =>
      applyColumnContactFiltersToBuilder(q, f, {
        partialLocation,
        excludeContactIds: filterResolution.excludeContactIds,
        skipNameColumnFilters: true,
      }),
  );
  return refineRowsWithColumnFilters(rows, f, filterResolution, partialLocation);
}

/** Name RPC first, then lazy group membership + column refine (avoids fetching full group id lists). */
export async function fetchContactsNameSearchThenRefine(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  f: ContactListFilters,
  filterResolution: GroupFilterResolution,
  partialLocation: boolean,
): Promise<Record<string, unknown>[]> {
  let rows = (await searchContactsByName(supabase, {
    firstName: f.first_name || null,
    lastName: f.last_name || null,
    fatherName: f.father_name || null,
  })) as Record<string, unknown>[];

  rows = await filterRowsByDeferredGroupMembership(supabase, rows, filterResolution);

  if (filterResolution.includeContactIds !== null) {
    const allow = new Set(filterResolution.includeContactIds);
    rows = rows.filter((row) => allow.has(String(row.id)));
  }

  return refineRowsWithColumnFilters(rows, f, filterResolution, partialLocation);
}

async function fetchContactsViaGroupNameSearch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  f: ContactListFilters,
  partialLocation: boolean,
) {
  const rawInclude = f.group_ids.length ? f.group_ids : f.group_id ? [f.group_id] : [];
  const groupIds = await resolveGroupIdsToUuids(supabase, rawInclude);
  if (rawInclude.length && !groupIds.length) return [];

  const matchMode = f.group_match === "and" && groupIds.length > 1 ? "and" : "or";
  let rows = (await searchContactsInGroups(supabase, {
    groupIds,
    firstName: f.first_name || null,
    lastName: f.last_name || null,
    matchMode,
  })) as Record<string, unknown>[];

  const filterResolution = await resolveContactListFilterIds(supabase, f, {
    skipGroupInclude: true,
  });

  if (filterResolution.deferredExcludeGroupIds?.length) {
    rows = await filterRowsByDeferredGroupMembership(supabase, rows, filterResolution);
  }

  if (filterResolution.includeContactIds !== null) {
    const allow = new Set(filterResolution.includeContactIds);
    rows = rows.filter((r) => allow.has(String(r.id)));
  }

  const exclude = filterResolution.excludeContactIds.length
    ? new Set(filterResolution.excludeContactIds)
    : undefined;
  if (exclude) {
    rows = rows.filter((row) =>
      contactRowMatchesListFilters(row as Parameters<typeof contactRowMatchesListFilters>[0], f, {
        partialLocation,
        excludeContactIds: exclude,
      }),
    );
  } else if (hasColumnListFilters(f)) {
    rows = rows.filter((row) =>
      contactRowMatchesListFilters(row as Parameters<typeof contactRowMatchesListFilters>[0], f, {
        partialLocation,
      }),
    );
  }

  return rows;
}

async function fetchContactsInMemoryPipeline(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  f: ContactListFilters,
  filterResolution: GroupFilterResolution,
  resolvedIds: string[] | null,
  partialLocation: boolean,
): Promise<{ rows: Record<string, unknown>[]; subPath: string }> {
  let rows: Record<string, unknown>[];
  let subPath: string;
  if (hasNameColumnFilters(f)) {
    subPath = "name-search-then-refine";
    rows = (await searchContactsByName(supabase, {
      firstName: f.first_name || null,
      lastName: f.last_name || null,
      fatherName: f.father_name || null,
    })) as Record<string, unknown>[];
    rows = refineRowsWithColumnFilters(rows, f, filterResolution, partialLocation);
    if (resolvedIds !== null) {
      const allow = new Set(resolvedIds);
      rows = rows.filter((row) => allow.has(String(row.id)));
    }
  } else if (includeContactIdsNeedBatchFetch(resolvedIds)) {
    subPath = "include-batch-fetch";
    rows = (await fetchContactsByResolvedIds(
      supabase,
      resolvedIds!,
      f,
      filterResolution,
      partialLocation,
    )) as Record<string, unknown>[];
  } else if (
    !hasGroupIncludeFilter(f) &&
    excludeContactIdsNeedInMemoryFilter(filterResolution.excludeContactIds)
  ) {
    subPath = "large-exclude-batch-fetch";
    rows = await fetchContactRowsInBatches(supabase, COUNT_SELECT, (query) => query);
    rows = filterContactRowsByListFilters(
      rows as Parameters<typeof filterContactRowsByListFilters>[0],
      f,
      {
        partialLocation,
        excludeContactIds: filterResolution.excludeContactIds,
      },
    );
  } else if (f.search?.trim()) {
    subPath = "search-batch-fetch";
    rows = await fetchContactRowsInBatches(supabase, COUNT_SELECT, (query) =>
      applyApiContactFilters(query, f, groupResolutionForSqlBuilder(filterResolution), partialLocation, {
        skipNameColumnFilters: true,
      }),
    );
    rows = refineRowsWithColumnFilters(rows, f, filterResolution, partialLocation);
  } else {
    subPath = "single-query-limit-12000";
    let query: QueryBuilder = supabase
      .from("contacts")
      .select(SELECT_LIST)
      .order("created_at", { ascending: false });
    query = applyApiContactFilters(query, f, filterResolution, partialLocation, {
      skipNameColumnFilters: true,
    });
    query = query.limit(12_000);
    const { data, error } = await query;
    if (error) throw error;
    rows = (data ?? []) as Record<string, unknown>[];
    rows = refineRowsWithColumnFilters(rows, f, filterResolution, partialLocation);
  }
  if (f.search?.trim()) {
    rows = afterFilterRows(rows, f.search);
  }
  return { rows, subPath };
}

export async function shouldDeferNameGroupMembership(
  supabase: SupabaseClient,
  f: ContactListFilters,
): Promise<boolean> {
  if (!canUseNameSearchThenRefinePath(f)) return false;

  if (f.exclude_group_ids.length) {
    const excludeGroupIds = await resolveGroupIdsToUuids(supabase, f.exclude_group_ids);
    if (
      excludeGroupIds.length &&
      (await groupMembershipExceedsInClause(supabase, excludeGroupIds, "or"))
    ) {
      return true;
    }
  }

  if (hasGroupIncludeFilter(f)) {
    if (hasNonFirstLastNameColumnFilters(f) || f.father_name?.trim()) return true;
    const rawInclude = f.group_ids.length ? f.group_ids : f.group_id ? [f.group_id] : [];
    const groupIds = await resolveGroupIdsToUuids(supabase, rawInclude);
    if (!groupIds.length) return false;
    const matchMode = f.group_match === "and" && groupIds.length > 1 ? "and" : "or";
    if (await groupMembershipExceedsInClause(supabase, groupIds, matchMode)) return true;
  }

  return false;
}

/** Shared helper: resolve group UUIDs and call search_contacts_advanced (no id lists). */
export async function fetchContactsViaAdvancedRpc(
  supabase: SupabaseClient,
  f: ContactListFilters,
  opts: { offset: number; limit: number },
): Promise<{ contacts: Record<string, unknown>[]; total: number; emptyInclude: boolean }> {
  const rawInclude = f.group_ids.length ? f.group_ids : f.group_id ? [f.group_id] : [];
  const includeGroupIds = rawInclude.length
    ? await resolveGroupIdsToUuids(supabase, rawInclude)
    : [];
  if (rawInclude.length && !includeGroupIds.length) {
    return { contacts: [], total: 0, emptyInclude: true };
  }
  const excludeGroupIds = f.exclude_group_ids.length
    ? await resolveGroupIdsToUuids(supabase, f.exclude_group_ids)
    : [];

  const callStatuses = f.call_statuses.length
    ? f.call_statuses
    : f.call_status
      ? [f.call_status]
      : [];
  const hasPhone =
    f.mobile_presence === "has" ? true : f.mobile_presence === "not" ? false : null;
  const hasEmail =
    f.email_presence === "has" ? true : f.email_presence === "not" ? false : null;

  const { contacts, total } = await searchContactsAdvanced(supabase, {
    firstName: f.first_name || null,
    lastName: f.last_name || null,
    fatherName: f.father_name || null,
    gender: f.gender || null,
    includeGroupIds,
    excludeGroupIds,
    groupMatchMode: f.group_match === "and" && includeGroupIds.length > 1 ? "AND" : "OR",
    municipalities: f.municipalities,
    toponyms: f.toponyms,
    callStatus: callStatuses.length === 1 ? callStatuses[0]! : null,
    politicalStance: f.political_stance || null,
    hasPhone,
    hasEmail,
    offset: opts.offset,
    limit: opts.limit,
  });

  return { contacts: contacts as Record<string, unknown>[], total, emptyInclude: false };
}

/** Shared list-query logic for GET /api/contacts and integration tests. */
export async function queryContactsListTotal(
  supabase: SupabaseClient,
  f: ContactListFilters,
  opts: { partialLocation?: boolean } = {},
): Promise<ContactsListApiResult> {
  const partialLocation = opts.partialLocation ?? false;

  if (canUseAdvancedSearchRpc(f, { partialLocation })) {
    const plan = buildContactQueryPlan(
      f,
      { includeContactIds: null, excludeContactIds: [] },
      { partialLocation },
    );
    const { total, emptyInclude } = await fetchContactsViaAdvancedRpc(supabase, f, {
      offset: 0,
      limit: 1,
    });
    if (emptyInclude) return { total: 0, plan: { path: "empty", reason: "include group matches zero contacts" } };
    return { total, plan, subPath: "advanced-rpc" };
  }

  const deferGroupMembership = await shouldDeferNameGroupMembership(supabase, f);
  const filterResolution = await resolveContactListFilterIds(supabase, f, {
    deferLargeGroupMembership: deferGroupMembership,
  });
  const resolvedIds = filterResolution.includeContactIds;
  const plan = buildContactQueryPlan(f, filterResolution, { partialLocation });
  const sqlGroupResolution = groupResolutionForSqlBuilder(filterResolution);

  if (plan.path === "empty") {
    return { total: 0, plan };
  }

  if (plan.path === "group-name-rpc") {
    const rows = await fetchContactsViaGroupNameSearch(supabase, f, partialLocation);
    return { total: rows.length, plan, subPath: "group-name-rpc" };
  }

  if (plan.path === "name-only-rpc") {
    const rows = await searchContactsByName(supabase, {
      firstName: f.first_name || null,
      lastName: f.last_name || null,
      fatherName: f.father_name || null,
    });
    return { total: rows.length, plan, subPath: "name-only-rpc" };
  }

  if (plan.path === "name-column-rpc") {
    let rows = await searchContactsByName(supabase, {
      firstName: f.first_name || null,
      lastName: f.last_name || null,
      fatherName: f.father_name || null,
    });
    rows = filterContactRowsByListFilters(
      rows as Parameters<typeof filterContactRowsByListFilters>[0],
      f,
      {
        partialLocation,
        excludeContactIds: filterResolution.excludeContactIds,
      },
    );
    return { total: rows.length, plan, subPath: "name-column-rpc" };
  }

  if (plan.path === "name-search-then-refine") {
    const rows = await fetchContactsNameSearchThenRefine(
      supabase,
      f,
      filterResolution,
      partialLocation,
    );
    return { total: rows.length, plan, subPath: "name-search-then-refine" };
  }

  if (plan.path === "group-only-rpc") {
    const rawInclude = f.group_ids.length ? f.group_ids : f.group_id ? [f.group_id] : [];
    const groupIds = await resolveGroupIdsToUuids(supabase, rawInclude);
    if (rawInclude.length && !groupIds.length) {
      return { total: 0, plan };
    }
    const { total } = await searchContactsByGroupsPaginated(supabase, {
      groupIds,
      offset: 0,
      limit: 1,
    });
    return { total, plan, subPath: "group-only-rpc" };
  }

  if (plan.path === "free-text-rpc") {
    const { total } = await searchContactsByFreeTextPaginated(supabase, {
      search: f.search,
      offset: 0,
      limit: 1,
    });
    return { total, plan, subPath: "free-text-rpc" };
  }

  if (plan.path === "group-column-rpc") {
    const rawInclude = f.group_ids.length ? f.group_ids : f.group_id ? [f.group_id] : [];
    const groupIds = await resolveGroupIdsToUuids(supabase, rawInclude);
    if (rawInclude.length && !groupIds.length) {
      return { total: 0, plan };
    }
    const matchMode = f.group_match === "and" && groupIds.length > 1 ? "and" : "or";
    const callStatuses = f.call_statuses.length
      ? f.call_statuses
      : f.call_status
        ? [f.call_status]
        : [];
    const { total } = await searchContactsInGroupsFiltered(supabase, {
      groupIds,
      matchMode,
      gender: f.gender || null,
      municipalities: f.municipalities,
      callStatus: callStatuses.length === 1 ? callStatuses[0]! : null,
      callStatuses: callStatuses.length > 1 ? callStatuses : [],
      politicalStance: f.political_stance || null,
      toponyms: f.toponyms,
      partialLocation,
      offset: 0,
      limit: 1,
    });
    return { total, plan, subPath: "group-column-rpc" };
  }

  if (plan.path === "nameday") {
    const now = new Date();
    const ids = await getContactIdsForNameDay(supabase, now.getMonth() + 1, now.getDate());
    if (!ids.length) return { total: 0, plan, subPath: "nameday" };
    let query: QueryBuilder = supabase
      .from("contacts")
      .select(SELECT_LIST)
      .in("id", ids)
      .order("created_at", { ascending: false });
    query = applyApiContactFilters(query, f, filterResolution, partialLocation);
    query = query.limit(15_000);
    const { data, error } = await query;
    if (error) throw error;
    let rows = (data ?? []) as Record<string, unknown>[];
    rows = refineRowsWithColumnFilters(rows, f, filterResolution, partialLocation);
    if (f.search?.trim()) rows = afterFilterRows(rows, f.search);
    return { total: rows.length, plan, subPath: "nameday" };
  }

  if (plan.path === "in-memory") {
    const { rows, subPath } = await fetchContactsInMemoryPipeline(
      supabase,
      f,
      filterResolution,
      resolvedIds,
      partialLocation,
    );
    return { total: rows.length, plan, subPath };
  }

  if (f.exclude_group_ids.length > 0) {
    const { rows, subPath } = await fetchContactsInMemoryPipeline(
      supabase,
      f,
      filterResolution,
      resolvedIds,
      partialLocation,
    );
    return {
      total: rows.length,
      plan: { path: "in-memory", reason: "exclude_group_ids present" },
      subPath,
    };
  }

  let query: QueryBuilder = supabase
    .from("contacts")
    .select(SELECT_LIST, { count: "exact", head: true });
  query = applyApiContactFilters(query, f, sqlGroupResolution, partialLocation);
  const { count, error } = await query;
  if (error) throw error;
  return { total: count ?? 0, plan, subPath: "sql-paginated" };
}
