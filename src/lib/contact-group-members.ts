import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContactGroupRow } from "@/lib/contact-groups";
import type { ContactListFilters } from "@/lib/contacts-filters";

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
const MAX_ID_IN_CLAUSE = 80;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

/** `.in('id', [])` → PostgREST 400 (`in.()`). Use sentinel or chunked `.or()`. */
export function applyContactIdIncludeFilter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  ids: string[],
) {
  const unique = uniqueIds(ids);
  if (!unique.length) return query.eq("id", NO_MATCH_CONTACT_ID);
  if (unique.length <= MAX_ID_IN_CLAUSE) return query.in("id", unique);
  const clauses: string[] = [];
  for (let i = 0; i < unique.length; i += MAX_ID_IN_CLAUSE) {
    clauses.push(`id.in.(${unique.slice(i, i + MAX_ID_IN_CLAUSE).join(",")})`);
  }
  return query.or(clauses.join(","));
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
    q = typeof q.notIn === "function" ? q.notIn("id", chunk) : q.not("id", "in", `(${chunk.join(",")})`);
  }
  return q;
}

function intersectIdSets(sets: string[][]): string[] {
  if (!sets.length) return [];
  const [first, ...rest] = sets;
  const base = new Set(first);
  for (const s of rest) {
    const next = new Set(s);
    for (const id of base) {
      if (!next.has(id)) base.delete(id);
    }
  }
  return [...base];
}

/** Resolve group filter values to contact_groups UUIDs (accepts names or ids). */
async function resolveGroupIdsToUuids(supabase: SupabaseClient, raw: string[]): Promise<string[]> {
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
    const byLower = new Map(
      (data ?? []).map((g) => [String((g as { name: string }).name).toLowerCase(), String((g as { id: string }).id)]),
    );
    for (const n of names) {
      const id = byLower.get(n.toLowerCase());
      if (id) uuids.add(id);
    }
  }
  return [...uuids];
}

async function contactIdsInSingleGroup(supabase: SupabaseClient, groupId: string): Promise<string[]> {
  const ids = new Set<string>();

  const { data: members, error } = await supabase
    .from("contact_group_members")
    .select("contact_id")
    .eq("group_id", groupId);
  if (error) throw error;
  for (const r of members ?? []) ids.add(String((r as { contact_id: string }).contact_id));

  const { data: primary, error: primaryErr } = await supabase
    .from("contacts")
    .select("id")
    .eq("group_id", groupId);
  if (primaryErr) throw primaryErr;
  for (const r of primary ?? []) ids.add(String((r as { id: string }).id));

  return [...ids];
}

async function contactIdsForGroups(
  supabase: SupabaseClient,
  groupIds: string[],
): Promise<string[]> {
  if (!groupIds.length) return [];
  const ids = new Set<string>();

  const { data, error } = await supabase
    .from("contact_group_members")
    .select("contact_id")
    .in("group_id", groupIds);
  if (error) throw error;
  for (const r of data ?? []) ids.add(String((r as { contact_id: string }).contact_id));

  const { data: primary, error: primaryErr } = await supabase
    .from("contacts")
    .select("id")
    .in("group_id", groupIds);
  if (primaryErr) throw primaryErr;
  for (const r of primary ?? []) ids.add(String((r as { id: string }).id));

  return [...ids];
}

export async function resolveGroupFilterContactIds(
  supabase: SupabaseClient,
  f: Pick<ContactListFilters, "group_id" | "group_ids" | "exclude_group_ids" | "group_match">,
): Promise<GroupFilterResolution> {
  const rawInclude = f.group_ids.length ? f.group_ids : f.group_id ? [f.group_id] : [];
  const includeGroupIds = await resolveGroupIdsToUuids(supabase, rawInclude);
  const excludeGroupIds = await resolveGroupIdsToUuids(supabase, f.exclude_group_ids);

  let includeContactIds: string[] | null = null;
  if (rawInclude.length) {
    if (!includeGroupIds.length) {
      includeContactIds = [];
    } else if (f.group_match === "and" && includeGroupIds.length > 1) {
      const perGroup: string[][] = [];
      for (const gid of includeGroupIds) {
        perGroup.push(await contactIdsInSingleGroup(supabase, gid));
      }
      includeContactIds = intersectIdSets(perGroup);
    } else {
      includeContactIds = await contactIdsForGroups(supabase, includeGroupIds);
    }
  }

  let excludeContactIds: string[] = [];
  if (excludeGroupIds.length) {
    excludeContactIds = await contactIdsForGroups(supabase, excludeGroupIds);
  }

  return { includeContactIds, excludeContactIds };
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
): Promise<GroupFilterResolution> {
  const groupRes = await resolveGroupFilterContactIds(supabase, f);
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
