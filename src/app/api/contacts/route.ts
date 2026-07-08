import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { logActivity } from "@/lib/activity-log";
import { firstNameFromFull } from "@/lib/activity-descriptions";
import { getContactIdsForNameDay } from "@/lib/nameday-celebrating";
import { contactMatchesFuzzyGreekSearch } from "@/lib/greek-fuzzy-name";
import { nextJsonError } from "@/lib/api-resilience";
import { nextPaddedCode } from "@/lib/codes";
import { nameDayDateStringFromFirstName } from "@/lib/greek-namedays";
import { searchParamsToFilters, getDefaultContactFilters } from "@/lib/contacts-filters";
import {
  applyBirthdayAgeFiltersToBuilder,
  applyColumnContactFiltersToBuilder,
  applyContactListFiltersToBuilder,
  buildContactQueryPlan,
  contactRowMatchesListFilters,
  fetchContactRowsInBatches,
  searchContactsByName,
  filterContactRowsByListFilters,
  hasColumnListFilters,
  hasGroupIncludeFilter,
  hasNameColumnFilters,
} from "@/lib/contacts-query";
import { normalizeContactListFiltersForNameRpc } from "@/lib/alexandra-contact-search";
import { fetchContactsNameSearchThenRefine, shouldDeferNameGroupMembership } from "@/lib/contacts-list-api";
import {
  enrichContactsWithGroupCountsAndNames,
  excludeContactIdsNeedInMemoryFilter,
  fetchContactsByIncludeIdBatches,
  filterRowsByDeferredGroupMembership,
  groupResolutionForSqlBuilder,
  includeContactIdsNeedBatchFetch,
  insertContactGroupMembershipsAfterCreate,
  normalizeGroupIdsInput,
  resolveContactListFilterIds,
  resolveGroupIdsToUuids,
  searchContactsByGroupsPaginated,
  searchContactsByFreeTextPaginated,
  searchContactsInGroups,
  searchContactsInGroupsFiltered,
  type GroupFilterResolution,
} from "@/lib/contact-group-members";
export const dynamic = "force-dynamic";

const SELECT_LIST =
  "id, first_name, last_name, phone, phone2, landline, email, area, municipality, toponym, gender, call_status, priority, tags, nickname, contact_code, age, political_stance, group_id, birthday, predicted_score, is_volunteer, volunteer_role, volunteer_area, volunteer_since, language, last_contacted_at, father_name, name_day, is_dead, electoral_district, may_not_have_mobile, may_not_have_landline, may_not_have_email, contact_groups!contacts_group_id_fkey ( id, name, color, description, year )";

/** Flat select for batch id queries — no embeds (avoids PostgREST filter issues). */
const SELECT_LIST_BATCH =
  "id, first_name, last_name, phone, phone2, landline, email, area, municipality, toponym, gender, call_status, priority, tags, nickname, contact_code, age, political_stance, group_id, birthday, predicted_score, is_volunteer, volunteer_role, volunteer_area, volunteer_since, language, last_contacted_at, father_name, name_day, is_dead, electoral_district, may_not_have_mobile, may_not_have_landline, may_not_have_email, created_at";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryBuilder = any;

type ContactFilters = ReturnType<typeof getDefaultContactFilters>;

function applyApiContactFilters(
  query: QueryBuilder,
  f: ContactFilters,
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

function afterFilterRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[],
  search: string | null | undefined,
) {
  if (!search) return rows;
  return rows.filter((c) => contactMatchesFuzzyGreekSearch(c, search));
}

function refineRowsWithColumnFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[],
  f: ContactFilters,
  filterResolution: GroupFilterResolution,
  partialLocation: boolean,
) {
  let working = rows;
  if (filterResolution.excludeContactIds.length > 0) {
    const excl = new Set(filterResolution.excludeContactIds);
    working = working.filter((row) => !excl.has(String(row.id)));
  }
  if (!hasColumnListFilters(f)) return working;
  return filterContactRowsByListFilters(working, f, {
    partialLocation,
    excludeContactIds: [],
  });
}

function paginateList<T>(rows: T[], page: number, pageSize: number) {
  const total = rows.length;
  const from = (page - 1) * pageSize;
  return { slice: rows.slice(from, from + pageSize), total };
}

async function enrichContactsWithGroupCount(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  rows: Array<Record<string, unknown>>,
) {
  if (!rows.length) return rows;
  return enrichContactsWithGroupCountsAndNames(
    supabase,
    rows as { id: string; group_id?: string | null }[],
  );
}

function emptyContactsResponse(comboboxMode: boolean, page: number, pageSize: number) {
  if (comboboxMode) {
    return NextResponse.json({ contacts: [] });
  }
  return NextResponse.json({ contacts: [], total: 0, page, pageSize });
}

async function fetchContactsByResolvedIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  ids: string[],
  f: ContactFilters,
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

async function fetchContactsViaGroupNameSearch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  f: ContactFilters,
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
  f: ContactFilters,
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
    rows = refineRowsWithColumnFilters(rows, f, filterResolution, partialLocation) as Record<
      string,
      unknown
    >[];
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
    rows = await fetchContactRowsInBatches(supabase, SELECT_LIST_BATCH, (query) => query);
    rows = filterContactRowsByListFilters(
      rows as Parameters<typeof filterContactRowsByListFilters>[0],
      f,
      {
        partialLocation,
        excludeContactIds: filterResolution.excludeContactIds,
      },
    ) as Record<string, unknown>[];
  } else if (f.search?.trim()) {
    subPath = "search-batch-fetch";
    rows = await fetchContactRowsInBatches(supabase, SELECT_LIST_BATCH, (query) =>
      applyApiContactFilters(query, f, groupResolutionForSqlBuilder(filterResolution), partialLocation, {
        skipNameColumnFilters: true,
      }),
    );
    rows = refineRowsWithColumnFilters(rows, f, filterResolution, partialLocation) as Record<
      string,
      unknown
    >[];
  } else {
    subPath = "single-query-limit-12000";
    let query: QueryBuilder = supabase
      .from("contacts")
      .select(SELECT_LIST)
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true });
    query = applyApiContactFilters(query, f, filterResolution, partialLocation, {
      skipNameColumnFilters: true,
    });
    query = query.limit(12_000);
    const { data, error } = await query;
    if (error) throw error;
    rows = (data ?? []) as Record<string, unknown>[];
    rows = refineRowsWithColumnFilters(rows, f, filterResolution, partialLocation) as Record<
      string,
      unknown
    >[];
  }
  if (f.search?.trim()) {
    rows = afterFilterRows(rows, f.search) as Record<string, unknown>[];
  }
  return { rows, subPath };
}

function debugExcludeGroupFilter(
  label: string,
  payload: Record<string, unknown>,
) {
  console.log("[api/contacts exclude-debug]", label, JSON.stringify(payload));
}

function isNameExcludeComboFilter(f: ContactFilters): boolean {
  return f.exclude_group_ids.length > 0 && hasNameColumnFilters(f);
}

function debugNameExcludeCombo(label: string, payload: Record<string, unknown>) {
  console.log("[api/contacts name-exclude-debug]", label, JSON.stringify(payload));
}

function respondWithContactList(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  rows: Record<string, unknown>[],
  comboboxMode: boolean,
  listLimit: number | null,
  page: number,
  pageSize: number,
  debugPath?: string,
) {
  if (comboboxMode) {
    const slice = rows.slice(0, listLimit!);
    debugExcludeGroupFilter("response", {
      path: debugPath ?? "unknown",
      mode: "combobox",
      rowCountBeforePaginate: rows.length,
      returnedCount: slice.length,
    });
    return enrichContactsWithGroupCount(supabase, slice).then((enriched) =>
      NextResponse.json({ contacts: enriched }),
    );
  }
  const { slice, total } = paginateList(rows, page, pageSize);
  debugExcludeGroupFilter("response", {
    path: debugPath ?? "unknown",
    mode: "paginated",
    rowCountBeforePaginate: rows.length,
    total,
    page,
    pageSize,
    returnedCount: slice.length,
  });
  return enrichContactsWithGroupCount(supabase, slice).then((enriched) =>
    NextResponse.json({ contacts: enriched, total, page, pageSize }),
  );
}

export async function GET(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { supabase } = crm;

    let f = searchParamsToFilters(request.nextUrl.searchParams, getDefaultContactFilters());
    f = normalizeContactListFiltersForNameRpc(f);
    const partialLocation = request.nextUrl.searchParams.get("partial_location") === "1";
    const limitParam = f.limit;
    const parsedLimit = limitParam != null && limitParam !== "" ? parseInt(limitParam, 10) : NaN;
    const listLimit = Number.isFinite(parsedLimit) ? Math.min(10_000, Math.max(1, parsedLimit)) : null;
    const comboboxMode = listLimit != null;

    const page = Math.max(1, parseInt(request.nextUrl.searchParams.get("page") || "1", 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(request.nextUrl.searchParams.get("page_size") || "50", 10) || 50));

    if (f.exclude_group_ids.length) {
      debugExcludeGroupFilter("request", {
        queryParams: Object.fromEntries(request.nextUrl.searchParams.entries()),
        exclude_group_ids_raw: f.exclude_group_ids,
        comboboxMode,
        page,
        pageSize,
      });
    }

    if (isNameExcludeComboFilter(f)) {
      debugNameExcludeCombo("request", {
        queryParams: Object.fromEntries(request.nextUrl.searchParams.entries()),
        first_name: f.first_name,
        last_name: f.last_name,
        father_name: f.father_name,
        exclude_group_ids_raw: f.exclude_group_ids,
        hasColumnListFilters: hasColumnListFilters(f),
        comboboxMode,
        page,
        pageSize,
      });
    }

    const filterResolution = await resolveContactListFilterIds(supabase, f, {
      deferLargeGroupMembership: await shouldDeferNameGroupMembership(supabase, f),
    });
    const resolvedIds = filterResolution.includeContactIds;
    const plan = buildContactQueryPlan(f, filterResolution);
    const sqlGroupResolution = groupResolutionForSqlBuilder(filterResolution);
    const resolvedExcludeGroupUuids = f.exclude_group_ids.length
      ? await resolveGroupIdsToUuids(supabase, f.exclude_group_ids)
      : [];

    if (f.exclude_group_ids.length) {
      debugExcludeGroupFilter("resolution", {
        resolvedExcludeGroupUuids,
        excludeContactIdsCount: filterResolution.excludeContactIds.length,
        excludeContactIdsNeedInMemoryFilter: excludeContactIdsNeedInMemoryFilter(
          filterResolution.excludeContactIds,
        ),
        groupResolutionForSqlBuilder_excludeCount: sqlGroupResolution.excludeContactIds.length,
        groupResolutionForSqlBuilder_includeIsNull: sqlGroupResolution.includeContactIds === null,
        queryPlanPath: plan.path,
        queryPlanReason: plan.reason,
        includeContactIdsCount: resolvedIds?.length ?? null,
        hasColumnListFilters: hasColumnListFilters(f),
        hasNameColumnFilters: hasNameColumnFilters(f),
      });
    }

    if (plan.path === "empty") {
      return emptyContactsResponse(comboboxMode, page, pageSize);
    }

    if (plan.path === "group-name-rpc") {
      const rows = await fetchContactsViaGroupNameSearch(supabase, f, partialLocation);
      return respondWithContactList(
        supabase,
        rows,
        comboboxMode,
        listLimit,
        page,
        pageSize,
        "group-name-rpc",
      );
    }

    if (plan.path === "name-only-rpc") {
      const rows = await searchContactsByName(supabase, {
        firstName: f.first_name || null,
        lastName: f.last_name || null,
        fatherName: f.father_name || null,
      });
      return respondWithContactList(
        supabase,
        rows,
        comboboxMode,
        listLimit,
        page,
        pageSize,
        "name-only-rpc",
      );
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
      return respondWithContactList(
        supabase,
        rows,
        comboboxMode,
        listLimit,
        page,
        pageSize,
        "name-column-rpc",
      );
    }

    if (plan.path === "name-search-then-refine") {
      const rows = await fetchContactsNameSearchThenRefine(
        supabase,
        f,
        filterResolution,
        partialLocation,
      );
      return respondWithContactList(
        supabase,
        rows,
        comboboxMode,
        listLimit,
        page,
        pageSize,
        "name-search-then-refine",
      );
    }

    if (plan.path === "group-only-rpc") {
      const rawInclude = f.group_ids.length ? f.group_ids : f.group_id ? [f.group_id] : [];
      const groupIds = await resolveGroupIdsToUuids(supabase, rawInclude);
      if (rawInclude.length && !groupIds.length) {
        return emptyContactsResponse(comboboxMode, page, pageSize);
      }
      const rpcLimit = comboboxMode ? listLimit! : pageSize;
      const rpcOffset = comboboxMode ? 0 : (page - 1) * pageSize;
      const { contacts, total } = await searchContactsByGroupsPaginated(supabase, {
        groupIds,
        offset: rpcOffset,
        limit: rpcLimit,
      });
      const enriched = await enrichContactsWithGroupCount(
        supabase,
        contacts as Record<string, unknown>[],
      );
      if (comboboxMode) {
        return NextResponse.json({ contacts: enriched });
      }
      return NextResponse.json({ contacts: enriched, total, page, pageSize });
    }

    if (plan.path === "free-text-rpc") {
      const rpcLimit = comboboxMode ? listLimit! : pageSize;
      const rpcOffset = comboboxMode ? 0 : (page - 1) * pageSize;
      const { contacts, total } = await searchContactsByFreeTextPaginated(supabase, {
        search: f.search,
        offset: rpcOffset,
        limit: rpcLimit,
      });
      const enriched = await enrichContactsWithGroupCount(
        supabase,
        contacts as Record<string, unknown>[],
      );
      if (comboboxMode) {
        return NextResponse.json({ contacts: enriched });
      }
      return NextResponse.json({ contacts: enriched, total, page, pageSize });
    }

    if (plan.path === "group-column-rpc") {
      const rawInclude = f.group_ids.length ? f.group_ids : f.group_id ? [f.group_id] : [];
      const groupIds = await resolveGroupIdsToUuids(supabase, rawInclude);
      if (rawInclude.length && !groupIds.length) {
        return emptyContactsResponse(comboboxMode, page, pageSize);
      }
      const matchMode = f.group_match === "and" && groupIds.length > 1 ? "and" : "or";
      const callStatuses = f.call_statuses.length
        ? f.call_statuses
        : f.call_status
          ? [f.call_status]
          : [];
      const rpcLimit = comboboxMode ? listLimit! : pageSize;
      const rpcOffset = comboboxMode ? 0 : (page - 1) * pageSize;
      const { contacts, total } = await searchContactsInGroupsFiltered(supabase, {
        groupIds,
        matchMode,
        gender: f.gender || null,
        municipalities: f.municipalities,
        callStatus: callStatuses.length === 1 ? callStatuses[0]! : null,
        callStatuses: callStatuses.length > 1 ? callStatuses : [],
        politicalStance: f.political_stance || null,
        toponyms: f.toponyms,
        partialLocation,
        offset: rpcOffset,
        limit: rpcLimit,
      });
      const enriched = await enrichContactsWithGroupCount(
        supabase,
        contacts as Record<string, unknown>[],
      );
      if (comboboxMode) {
        return NextResponse.json({ contacts: enriched });
      }
      return NextResponse.json({ contacts: enriched, total, page, pageSize });
    }

    if (plan.path === "nameday") {
      const now = new Date();
      const ids = await getContactIdsForNameDay(supabase, now.getMonth() + 1, now.getDate());
      if (ids.length === 0) {
        return emptyContactsResponse(comboboxMode, page, pageSize);
      }
      let query: QueryBuilder = supabase
        .from("contacts")
        .select(SELECT_LIST)
        .in("id", ids)
        .order("last_name", { ascending: true })
        .order("first_name", { ascending: true });
      query = applyApiContactFilters(query, f, filterResolution, partialLocation);
      if (comboboxMode) {
        query = query.limit(listLimit!);
      } else {
        query = query.limit(15_000);
      }
      const { data, error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      let rows = (data ?? []) as Record<string, unknown>[];
      rows = refineRowsWithColumnFilters(rows, f, filterResolution, partialLocation) as Record<
        string,
        unknown
      >[];
      const work = f.search ? (afterFilterRows(rows, f.search) as Record<string, unknown>[]) : rows;
      return respondWithContactList(supabase, work, comboboxMode, listLimit, page, pageSize, "nameday");
    }

    if (plan.path === "in-memory") {
      const { rows, subPath } = await fetchContactsInMemoryPipeline(
        supabase,
        f,
        filterResolution,
        resolvedIds,
        partialLocation,
      );
      if (f.exclude_group_ids.length) {
        debugExcludeGroupFilter("path", {
          route: "in-memory",
          subPath,
          queryPlanReason: plan.reason,
        });
      }
      if (isNameExcludeComboFilter(f)) {
        debugNameExcludeCombo("result", {
          route: `in-memory:${subPath}`,
          queryPlanReason: plan.reason,
          excludeContactIdsCount: filterResolution.excludeContactIds.length,
          rowCountBeforePaginate: rows.length,
        });
      }
      return respondWithContactList(
        supabase,
        rows,
        comboboxMode,
        listLimit,
        page,
        pageSize,
        `in-memory:${subPath}`,
      );
    }

    if (
      f.exclude_group_ids.length > 0 &&
      excludeContactIdsNeedInMemoryFilter(filterResolution.excludeContactIds)
    ) {
      const { rows, subPath } = await fetchContactsInMemoryPipeline(
        supabase,
        f,
        filterResolution,
        resolvedIds,
        partialLocation,
      );
      return respondWithContactList(
        supabase,
        rows,
        comboboxMode,
        listLimit,
        page,
        pageSize,
        `in-memory:${subPath}`,
      );
    }

    if (f.exclude_group_ids.length) {
      debugExcludeGroupFilter("path", {
        route: "sql-paginated",
        queryPlanReason: plan.reason,
      });
    }

    // Default list order uses idx_contacts_last_name_first_name (EXPLAIN ANALYZE ~30ms
    // vs ~1.2s for ORDER BY created_at DESC which forces a seq scan / gather merge).
    let query: QueryBuilder = supabase
      .from("contacts")
      .select(SELECT_LIST, { count: "exact" })
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true });
    query = applyApiContactFilters(query, f, sqlGroupResolution, partialLocation);

    if (comboboxMode) {
      query = query.limit(listLimit!);
      const { data, error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      let rows = data ?? [];
      rows = refineRowsWithColumnFilters(rows, f, filterResolution, partialLocation);
      const enriched = await enrichContactsWithGroupCount(supabase, rows);
      return NextResponse.json({ contacts: enriched.slice(0, listLimit!) });
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);
    const { data, error, count } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const enriched = await enrichContactsWithGroupCount(supabase, data ?? []);
    if (f.exclude_group_ids.length) {
      debugExcludeGroupFilter("response", {
        path: "sql-paginated",
        mode: "paginated",
        sqlCount: count ?? 0,
        returnedCount: enriched.length,
        page,
        pageSize,
      });
    }
    return NextResponse.json({ contacts: enriched, total: count ?? 0, page, pageSize });
  } catch (e) {
    console.error("[api/contacts GET]", e);
    return nextJsonError();
  }
}

export async function POST(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { user, profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const body = (await request.json()) as Record<string, unknown>;
    delete body.contact_code;
    if (typeof body.phone === "string" && !body.phone.trim()) {
      body.phone = null;
    }
    for (const k of ["phone2", "landline"] as const) {
      if (typeof body[k] === "string" && !String(body[k]).trim()) {
        body[k] = null;
      }
    }
    const code = await nextPaddedCode(supabase, "contacts", "contact_code", "EP");
    body.contact_code = code;
    delete (body as { created_by?: unknown }).created_by;
    delete (body as { updated_by?: unknown }).updated_by;
    (body as Record<string, unknown>).created_by = user.id;
    if (
      (body.name_day == null || body.name_day === "") &&
      body.first_name != null &&
      String(body.first_name).trim() !== ""
    ) {
      const auto = nameDayDateStringFromFirstName(String(body.first_name));
      if (auto) body.name_day = auto;
    }
    const groupIds = normalizeGroupIdsInput(body);
    const primaryGroupId =
      groupIds !== undefined
        ? groupIds[0] ?? null
        : body.group_id != null && String(body.group_id).trim()
          ? String(body.group_id)
          : null;
    delete body.group_ids;
    if (groupIds !== undefined || "group_id" in body) {
      body.group_id = primaryGroupId;
    }
    const { data, error } = await supabase.from("contacts").insert(body).select("*").single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    try {
      await insertContactGroupMembershipsAfterCreate(supabase, String(data.id), {
        group_id: primaryGroupId,
        group_ids: groupIds,
      });
    } catch (memberErr) {
      console.error("[api/contacts POST] contact_group_members", memberErr);
      return NextResponse.json({ error: "Η επαφή δημιουργήθηκε αλλά απέτυχε η ανάθεση ομάδων" }, { status: 400 });
    }
    const name = `${String(data.first_name)} ${String(data.last_name)}`.trim();
    await logActivity({
      userId: user.id,
      action: "contact_created",
      entityType: "contact",
      entityId: data.id,
      entityName: name,
      details: { actor_name: firstNameFromFull(profile?.full_name) },
    });
    return NextResponse.json({ contact: data });
  } catch (e) {
    console.error("[api/contacts POST]", e);
    return nextJsonError();
  }
}
