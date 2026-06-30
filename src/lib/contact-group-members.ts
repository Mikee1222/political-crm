/* eslint-disable @typescript-eslint/no-unused-vars */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContactGroupRow } from "@/lib/contact-groups";
import type { ContactListFilters } from "@/lib/contacts-filters";
import { normalizeGreekNameKey } from "@/lib/greek-fuzzy-name";

export type ContactGroupSummary = Pick<
  ContactGroupRow,
  "id" | "name" | "color" | "description" | "year"
>;

export type GroupFilterResolution = {
  /** null = no include filter; [] = include filter with zero matches */
  includeContactIds: string[] | null;
  excludeContactIds: string[];
};

export const NO_MATCH_CONTACT_ID = "00000000-0000-0000-0000-000000000000";
/** PostgREST rejects `in.()` / `not.in.()` — keep URL chunks small when SELECT embeds are present. */
export const MAX_ID_IN_CLAUSE = 80;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

/** PostgREST `.or('id.in.(...)')` needs quoted UUIDs — hyphens parse as operators otherwise. */
export function buildIdInOrFilter(ids: string[]): string {
  const clauses: string[] = [];
  for (let i = 0; i < ids.length; i += MAX_ID_IN_CLAUSE) {
    const chunk = ids.slice(i, i + MAX_ID_IN_CLAUSE);
    clauses.push(`id.in.(${chunk.map((id) => `"${id}"`).join(",")})`);
  }
  return clauses.join(",");
}

/** True when include list must be fetched in multiple `.in()` queries (URL length). */
export function includeContactIdsNeedBatchFetch(ids: string[] | null): ids is string[] {
  return ids !== null && uniqueIds(ids).length > MAX_ID_IN_CLAUSE;
}

/** `.in('id', [])` → PostgREST 400 (`in.()`). Use sentinel, chunked `.or()`, or batch fetch. */
export function applyContactIdIncludeFilter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  ids: string[],
) {
  const unique = uniqueIds(ids);
  if (!unique.length) return query.eq("id", NO_MATCH_CONTACT_ID);
  if (unique.length <= MAX_ID_IN_CLAUSE) return query.in("id", unique);
  return query.or(buildIdInOrFilter(unique));
}

/** Skip when empty; chunk large exclude lists (multiple `not.in` params are ANDed). */
export function applyContactIdExcludeFilter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  ids: string[],
) {
  const unique = uniqueIds(ids);
  if (!unique.length) return query;

  let q = query;
  for (let i = 0; i < unique.length; i += MAX_ID_IN_CLAUSE) {
    const chunk = unique.slice(i, i + MAX_ID_IN_CLAUSE);
    const quoted = `(${chunk.map((id) => `"${id}"`).join(",")})`;
    q = typeof q.notIn === "function" ? q.notIn("id", chunk) : q.not("id", "in", quoted);
  }
  return q;
}

/** Large include lists: several short `.in()` queries instead of one giant `.or()` URL. */
export async function fetchContactsByIncludeIdBatches<T extends { id: string; created_at?: string | null }>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  ids: string[],
  select: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  applyFilters: (query: any) => any,
): Promise<T[]> {
  const unique = uniqueIds(ids);
  const byId = new Map<string, T>();
  for (let i = 0; i < unique.length; i += MAX_ID_IN_CLAUSE) {
    const chunk = unique.slice(i, i + MAX_ID_IN_CLAUSE);
    let query = supabase.from("contacts").select(select);
    query = applyFilters(query);
    query = query.in("id", chunk);
    const { data, error } = await query;
    if (error) throw error;
    for (const row of (data ?? []) as T[]) {
      byId.set(String(row.id), row);
    }
  }
  return [...byId.values()].sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });
}

/** Accent/case-insensitive key for group name → id lookup (e.g. «Μη έγκυρος αριθμός» ↔ «ΜΗ ΕΓΚΥΡΟΣ ΑΡΙΘΜΟΣ»). */
export function groupNameLookupKey(name: string): string {
  return normalizeGreekNameKey(name.trim());
}

export function buildGroupNameToIdMap(groups: Array<{ id: string; name: string }>): Map<string, string> {
  const m = new Map<string, string>();
  for (const g of groups) {
    m.set(groupNameLookupKey(g.name), g.id);
  }
  return m;
}

/** Resolve group filter values to contact_groups UUIDs (accepts names or ids). */
export async function resolveGroupIdsToUuids(supabase: SupabaseClient, raw: string[]): Promise<string[]> {
  const uuids = new Set<string>();
  const names: string[] = [];
  for (const x of raw) {
    const t = x.trim();
    if (!t) continue;
    if (UUID_RE.test(t)) uuids.add(t);
    else names.push(t);
  }
  if (names.length) {
    const { data, error } = await supabase.from("contact_groups").select("id, name");
    if (error) throw error;
    const byNameKey = buildGroupNameToIdMap((data ?? []) as Array<{ id: string; name: string }>);
    for (const n of names) {
      const id = byNameKey.get(groupNameLookupKey(n));
      if (id) uuids.add(id);
    }
  }
  return [...uuids];
}

/** PostgREST returns at most 1000 rows per request — paginate to fetch every member. */
const RPC_PAGE_SIZE = 1000;

/** Contact IDs in groups via RPC (junction + contacts.group_id). AND = all groups; OR = any. */
async function contactIdsForGroups(
  supabase: SupabaseClient,
  groupIds: string[],
  matchMode: "or" | "and" = "or",
): Promise<string[]> {
  if (!groupIds.length) return [];

  const allIds: string[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .rpc("get_contacts_in_groups", {
        group_ids: groupIds,
        match_mode: matchMode,
      })
      .range(from, from + RPC_PAGE_SIZE - 1);
    if (error) throw error;

    const page = (data ?? []).map((r: { contact_id: string }) => String(r.contact_id));
    allIds.push(...page);
    if (page.length < RPC_PAGE_SIZE) break;
    from += RPC_PAGE_SIZE;
  }

  return uniqueIds(allIds);
}

type GroupFilterInput = Pick<
  ContactListFilters,
  "group_id" | "group_ids" | "exclude_group_ids" | "group_match"
>;

export type SearchContactsInGroupsRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  phone2: string | null;
  landline: string | null;
  email: string | null;
  area: string | null;
  municipality: string | null;
  toponym: string | null;
  gender: string | null;
  call_status: string | null;
  priority: string | null;
  tags: string[] | null;
  nickname: string | null;
  contact_code: string | null;
  age: number | null;
  political_stance: string | null;
  group_id: string | null;
  birthday: string | null;
  predicted_score: number | null;
  is_volunteer: boolean | null;
  volunteer_role: string | null;
  volunteer_area: string | null;
  volunteer_since: string | null;
  language: string | null;
  last_contacted_at: string | null;
  father_name: string | null;
  name_day: string | null;
  is_dead: boolean | null;
  electoral_district: string | null;
  may_not_have_mobile: boolean | null;
  may_not_have_landline: boolean | null;
  may_not_have_email: boolean | null;
  created_at: string | null;
};

/** Contacts in groups filtered by first/last name via RPC (junction + contacts.group_id). */
export async function searchContactsInGroups(
  supabase: SupabaseClient,
  opts: {
    groupIds: string[];
    firstName?: string | null;
    lastName?: string | null;
    matchMode?: "or" | "and";
  },
): Promise<SearchContactsInGroupsRow[]> {
  const { groupIds, firstName, lastName, matchMode = "or" } = opts;
  if (!groupIds.length) return [];

  const allRows: SearchContactsInGroupsRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .rpc("search_contacts_in_groups", {
        p_group_ids: groupIds,
        p_first_name: firstName?.trim() || null,
        p_last_name: lastName?.trim() || null,
        p_match_mode: matchMode,
      })
      .range(from, from + RPC_PAGE_SIZE - 1);
    if (error) throw error;

    const page = (data ?? []) as SearchContactsInGroupsRow[];
    allRows.push(...page);
    if (page.length < RPC_PAGE_SIZE) break;
    from += RPC_PAGE_SIZE;
  }

  return allRows;
}

export type SearchContactsByGroupsPaginatedRow = SearchContactsInGroupsRow & { total: number };

/** One page of contacts in groups via get_contacts_by_groups_paginated RPC. */
export async function searchContactsByGroupsPaginated(
  supabase: SupabaseClient,
  opts: {
    groupIds: string[];
    offset: number;
    limit: number;
  },
): Promise<{ contacts: SearchContactsInGroupsRow[]; total: number }> {
  const { groupIds, offset, limit } = opts;
  if (!groupIds.length) return { contacts: [], total: 0 };

  const { data, error } = await supabase.rpc("get_contacts_by_groups_paginated", {
    p_group_ids: groupIds,
    p_offset: offset,
    p_limit: limit,
  });
  if (error) throw error;

  const rows = (data ?? []) as SearchContactsByGroupsPaginatedRow[];
  const total = rows.length > 0 ? Number(rows[0]!.total) : 0;
  const contacts = rows.map(({ total: _total, ...contact }) => contact);
  return { contacts, total };
}

export type SearchContactsInGroupsFilteredRow = SearchContactsByGroupsPaginatedRow;

/** Group + column filters via search_contacts_in_groups_filtered RPC (paginated). */
export async function searchContactsInGroupsFiltered(
  supabase: SupabaseClient,
  opts: {
    groupIds: string[];
    matchMode?: "or" | "and";
    gender?: string | null;
    municipalities?: string[];
    callStatus?: string | null;
    callStatuses?: string[];
    politicalStance?: string | null;
    toponyms?: string[];
    partialLocation?: boolean;
    offset: number;
    limit: number;
  },
): Promise<{ contacts: SearchContactsInGroupsRow[]; total: number }> {
  const {
    groupIds,
    matchMode = "or",
    gender,
    municipalities = [],
    callStatus,
    callStatuses = [],
    politicalStance,
    toponyms = [],
    partialLocation = false,
    offset,
    limit,
  } = opts;
  if (!groupIds.length) return { contacts: [], total: 0 };

  const { data, error } = await supabase.rpc("search_contacts_in_groups_filtered", {
    p_group_ids: groupIds,
    p_match_mode: matchMode,
    p_gender: gender?.trim() || null,
    p_municipalities: municipalities.length ? municipalities : null,
    p_call_status: callStatus?.trim() || null,
    p_call_statuses: callStatuses.length ? callStatuses : null,
    p_political_stance: politicalStance?.trim() || null,
    p_toponyms: toponyms.length ? toponyms : null,
    p_partial_location: partialLocation,
    p_offset: offset,
    p_limit: limit,
  });
  if (error) throw error;

  const rows = (data ?? []) as SearchContactsInGroupsFilteredRow[];
  const total = rows.length > 0 ? Number(rows[0]!.total) : 0;
  const contacts = rows.map(({ total: _total, ...contact }) => contact);
  return { contacts, total };
}

/** Resolve include/exclude group filters via get_contacts_in_groups RPC. */
async function resolveGroupFilterResolution(
  supabase: SupabaseClient,
  f: GroupFilterInput,
): Promise<GroupFilterResolution> {
  const rawInclude = f.group_ids.length ? f.group_ids : f.group_id ? [f.group_id] : [];
  const includeGroupIds = await resolveGroupIdsToUuids(supabase, rawInclude);
  const excludeGroupIds = await resolveGroupIdsToUuids(supabase, f.exclude_group_ids);

  let includeContactIds: string[] | null = null;
  if (rawInclude.length) {
    if (!includeGroupIds.length) {
      includeContactIds = [];
    } else {
      const matchMode =
        f.group_match === "and" && includeGroupIds.length > 1 ? "and" : "or";
      includeContactIds = await contactIdsForGroups(supabase, includeGroupIds, matchMode);
    }
  }

  let excludeContactIds: string[] = [];
  if (excludeGroupIds.length) {
    excludeContactIds = await contactIdsForGroups(supabase, excludeGroupIds, "or");
  }

  return { includeContactIds, excludeContactIds };
}

/** Heatmap/export: group filter contact IDs via RPC. */
export async function resolveGroupFilterContactIds(
  supabase: SupabaseClient,
  f: GroupFilterInput,
): Promise<GroupFilterResolution> {
  return resolveGroupFilterResolution(supabase, f);
}

/** GET /api/contacts: true when an include-group filter matches zero contacts. */
export async function groupIncludeFilterMatchesNone(
  supabase: SupabaseClient,
  f: GroupFilterInput,
): Promise<boolean> {
  const rawInclude = f.group_ids.length ? f.group_ids : f.group_id ? [f.group_id] : [];
  if (!rawInclude.length) return false;
  const resolution = await resolveGroupFilterResolution(supabase, f);
  return resolution.includeContactIds !== null && resolution.includeContactIds.length === 0;
}

/** GET /api/contacts: apply group include/exclude via RPC + chunked id filters. */
export async function applyGroupFiltersToQuery(
  supabase: SupabaseClient,
  f: GroupFilterInput,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
) {
  const resolution = await resolveGroupFilterResolution(supabase, f);
  return applyGroupMembershipFiltersToBuilder(query, resolution);
}

function intersectInclude(
  current: string[] | null,
  next: string[],
): string[] {
  if (!next.length) return [];
  if (current === null) return [...new Set(next)];
  const allow = new Set(next);
  return current.filter((id) => allow.has(id));
}

async function contactIdsForSources(supabase: SupabaseClient, sourceIds: string[]): Promise<string[]> {
  if (!sourceIds.length) return [];
  const { data, error } = await supabase
    .from("contact_source_members")
    .select("contact_id")
    .in("source_id", sourceIds);
  if (error) throw error;
  return [...new Set((data ?? []).map((r) => String((r as { contact_id: string }).contact_id)))];
}

async function contactIdsWithRequests(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase.from("requests").select("contact_id").not("contact_id", "is", null);
  if (error) throw error;
  return [...new Set((data ?? []).map((r) => String((r as { contact_id: string }).contact_id)).filter(Boolean))];
}

/** Merges group, source, and request id-based filters into one resolution. */
export async function resolveContactListFilterIds(
  supabase: SupabaseClient,
  f: ContactListFilters,
  opts?: { skipGroupInclude?: boolean },
): Promise<GroupFilterResolution> {
  const groupRes = opts?.skipGroupInclude
    ? await resolveGroupFilterContactIds(supabase, {
        group_id: "",
        group_ids: [],
        exclude_group_ids: f.exclude_group_ids,
        group_match: f.group_match,
      })
    : await resolveGroupFilterContactIds(supabase, f);
  let includeContactIds = groupRes.includeContactIds;
  const excludeSet = new Set(groupRes.excludeContactIds);

  if (f.source_ids.length) {
    const ids = await contactIdsForSources(supabase, f.source_ids);
    includeContactIds = intersectInclude(includeContactIds, ids);
  }
  if (f.exclude_source_ids.length) {
    const ids = await contactIdsForSources(supabase, f.exclude_source_ids);
    for (const id of ids) excludeSet.add(id);
  }
  if (f.has_request === "has") {
    const ids = await contactIdsWithRequests(supabase);
    includeContactIds = intersectInclude(includeContactIds, ids);
  } else if (f.has_request === "not") {
    const ids = await contactIdsWithRequests(supabase);
    for (const id of ids) excludeSet.add(id);
  }
  if (f.request_status.trim()) {
    const { getRequestStatusQueryValues } = await import("@/lib/request-statuses");
    const statuses = getRequestStatusQueryValues(f.request_status);
    const { data, error } = await supabase
      .from("requests")
      .select("contact_id")
      .in("status", statuses)
      .not("contact_id", "is", null);
    if (error) throw error;
    const ids = [...new Set((data ?? []).map((r) => String((r as { contact_id: string }).contact_id)).filter(Boolean))];
    includeContactIds = intersectInclude(includeContactIds, ids);
  }

  return { includeContactIds, excludeContactIds: [...excludeSet] };
}

export function mergeContactListFilterResolutions(
  a: GroupFilterResolution,
  b: GroupFilterResolution,
): GroupFilterResolution {
  let includeContactIds = a.includeContactIds;
  if (b.includeContactIds !== null) {
    includeContactIds = intersectInclude(includeContactIds, b.includeContactIds);
  }
  return {
    includeContactIds,
    excludeContactIds: [...new Set([...a.excludeContactIds, ...b.excludeContactIds])],
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyGroupMembershipFiltersToBuilder(query: any, resolution: GroupFilterResolution) {
  if (resolution.includeContactIds !== null) {
    query = applyContactIdIncludeFilter(query, resolution.includeContactIds);
  }
  if (resolution.excludeContactIds.length) {
    query = applyContactIdExcludeFilter(query, resolution.excludeContactIds);
  }
  return query;
}

export async function fetchAllGroupsForContact(
  supabase: SupabaseClient,
  contactId: string,
): Promise<ContactGroupSummary[]> {
  const { data, error } = await supabase
    .from("contact_group_members")
    .select(
      "group_id, contact_groups!contact_group_members_group_id_fkey ( id, name, color, description, year )",
    )
    .eq("contact_id", contactId);
  if (error) throw error;

  const groups: ContactGroupSummary[] = [];
  for (const row of data ?? []) {
    const raw = row as {
      contact_groups?: ContactGroupSummary | ContactGroupSummary[] | null;
    };
    const g = Array.isArray(raw.contact_groups) ? raw.contact_groups[0] : raw.contact_groups;
    if (g?.id) groups.push(g);
  }
  groups.sort((a, b) => a.name.localeCompare(b.name, "el"));
  return groups;
}

export async function fetchGroupMemberCounts(
  supabase: SupabaseClient,
  contactIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!contactIds.length) return counts;

  const { data, error } = await supabase
    .from("contact_group_members")
    .select("contact_id")
    .in("contact_id", contactIds);
  if (error) throw error;

  for (const row of data ?? []) {
    const id = String((row as { contact_id: string }).contact_id);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/** Attach junction membership counts; fall back to 1 when only contacts.group_id is set. */
export function attachGroupCounts<T extends { id: string; group_id?: string | null }>(
  contacts: T[],
  counts: Map<string, number>,
): (T & { group_count: number })[] {
  return contacts.map((c) => {
    const junctionCount = counts.get(c.id) ?? 0;
    const group_count = junctionCount > 0 ? junctionCount : c.group_id ? 1 : 0;
    return { ...c, group_count };
  });
}

export async function enrichContactsWithGroupCounts<T extends { id: string; group_id?: string | null }>(
  supabase: SupabaseClient,
  contacts: T[],
): Promise<(T & { group_count: number })[]> {
  const counts = await fetchGroupMemberCounts(
    supabase,
    contacts.map((c) => c.id),
  );
  return attachGroupCounts(contacts, counts);
}

/** List/search cards: membership count + all group names (for auto flags). */
export async function enrichContactsWithGroupCountsAndNames<
  T extends { id: string; group_id?: string | null },
>(supabase: SupabaseClient, contacts: T[]): Promise<(T & { group_count: number; group_names: string[] })[]> {
  const withCounts = await enrichContactsWithGroupCounts(supabase, contacts);
  if (!withCounts.length) return [];
  const namesMap = await fetchGroupNamesByContactId(
    supabase,
    withCounts.map((c) => c.id),
  );
  return withCounts.map((c) => ({
    ...c,
    group_names: namesMap.get(c.id) ?? [],
  }));
}

export async function fetchGroupNamesByContactId(
  supabase: SupabaseClient,
  contactIds: string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!contactIds.length) return out;

  const { data, error } = await supabase
    .from("contact_group_members")
    .select("contact_id, contact_groups!contact_group_members_group_id_fkey ( name )")
    .in("contact_id", contactIds);
  if (error) throw error;

  for (const row of data ?? []) {
    const r = row as {
      contact_id: string;
      contact_groups?: { name: string } | { name: string }[] | null;
    };
    const g = Array.isArray(r.contact_groups) ? r.contact_groups[0] : r.contact_groups;
    const name = g?.name?.trim();
    if (!name) continue;
    const list = out.get(r.contact_id) ?? [];
    list.push(name);
    out.set(r.contact_id, list);
  }

  for (const [id, names] of out) {
    out.set(id, [...new Set(names)].sort((a, b) => a.localeCompare(b, "el")));
  }
  return out;
}

export function normalizeGroupIdsInput(body: Record<string, unknown>): string[] | undefined {
  if ("group_ids" in body) {
    const raw = body.group_ids;
    if (!Array.isArray(raw)) return [];
    return [...new Set(raw.map((x) => String(x).trim()).filter(Boolean))];
  }
  return undefined;
}

/** Sync contacts.group_id (first) + replace junction rows. */
export async function replaceContactGroupMemberships(
  supabase: SupabaseClient,
  contactId: string,
  groupIds: string[],
) {
  const unique = [...new Set(groupIds.filter(Boolean))];
  const primary = unique[0] ?? null;

  const { error: updErr } = await supabase
    .from("contacts")
    .update({ group_id: primary })
    .eq("id", contactId);
  if (updErr) throw updErr;

  const { error: delErr } = await supabase.from("contact_group_members").delete().eq("contact_id", contactId);
  if (delErr) throw delErr;

  if (!unique.length) return;

  const rows = unique.map((group_id) => ({ contact_id: contactId, group_id }));
  const { error: insErr } = await supabase
    .from("contact_group_members")
    .upsert(rows, { onConflict: "contact_id,group_id" });
  if (insErr) throw insErr;
}

/** Bulk assign: set primary group_id + upsert junction (keeps other memberships). */
export async function upsertContactGroupMemberships(
  supabase: SupabaseClient,
  contactIds: string[],
  groupId: string | null,
) {
  if (!contactIds.length) return;

  if (!groupId) {
    const { error } = await supabase.from("contacts").update({ group_id: null }).in("id", contactIds);
    if (error) throw error;
    return;
  }

  const { error: updErr } = await supabase.from("contacts").update({ group_id: groupId }).in("id", contactIds);
  if (updErr) throw updErr;

  const rows = contactIds.map((contact_id) => ({ contact_id, group_id: groupId }));
  const { error: upsErr } = await supabase
    .from("contact_group_members")
    .upsert(rows, { onConflict: "contact_id,group_id" });
  if (upsErr) throw upsErr;
}

/** Add one group membership; set primary group_id when contact has none. */
export async function addContactGroupMembership(
  supabase: SupabaseClient,
  contactId: string,
  groupId: string,
): Promise<ContactGroupSummary[]> {
  const gid = groupId.trim();
  if (!gid) return fetchAllGroupsForContact(supabase, contactId);

  const { error: upsErr } = await supabase
    .from("contact_group_members")
    .upsert({ contact_id: contactId, group_id: gid }, { onConflict: "contact_id,group_id" });
  if (upsErr) throw upsErr;

  const { data: contact, error: contactErr } = await supabase
    .from("contacts")
    .select("group_id")
    .eq("id", contactId)
    .maybeSingle();
  if (contactErr) throw contactErr;
  if (!contact?.group_id) {
    const { error: updErr } = await supabase.from("contacts").update({ group_id: gid }).eq("id", contactId);
    if (updErr) throw updErr;
  }

  return fetchAllGroupsForContact(supabase, contactId);
}

/** Remove one group membership; reassign primary group_id when needed. */
export async function removeContactGroupMembership(
  supabase: SupabaseClient,
  contactId: string,
  groupId: string,
): Promise<ContactGroupSummary[]> {
  const gid = groupId.trim();
  if (!gid) return fetchAllGroupsForContact(supabase, contactId);

  const { error: delErr } = await supabase
    .from("contact_group_members")
    .delete()
    .eq("contact_id", contactId)
    .eq("group_id", gid);
  if (delErr) throw delErr;

  const remaining = await fetchAllGroupsForContact(supabase, contactId);
  const primary = remaining[0]?.id ?? null;
  const { error: updErr } = await supabase.from("contacts").update({ group_id: primary }).eq("id", contactId);
  if (updErr) throw updErr;

  return remaining;
}

/** After create: insert junction rows for group_id and/or group_ids. */
export async function insertContactGroupMembershipsAfterCreate(
  supabase: SupabaseClient,
  contactId: string,
  opts: { group_id?: string | null; group_ids?: string[] },
) {
  const ids = opts.group_ids?.length
    ? opts.group_ids
    : opts.group_id
      ? [opts.group_id]
      : [];
  if (!ids.length) return;
  await replaceContactGroupMemberships(supabase, contactId, ids);
}
