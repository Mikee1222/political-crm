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

const NO_MATCH_ID = "00000000-0000-0000-0000-000000000000";

export async function resolveGroupFilterContactIds(
  supabase: SupabaseClient,
  f: Pick<ContactListFilters, "group_id" | "group_ids" | "exclude_group_ids">,
): Promise<GroupFilterResolution> {
  const includeGroupIds = f.group_ids.length ? f.group_ids : f.group_id ? [f.group_id] : [];

  let includeContactIds: string[] | null = null;
  if (includeGroupIds.length) {
    const { data, error } = await supabase
      .from("contact_group_members")
      .select("contact_id")
      .in("group_id", includeGroupIds);
    if (error) throw error;
    includeContactIds = [...new Set((data ?? []).map((r) => String((r as { contact_id: string }).contact_id)))];
  }

  let excludeContactIds: string[] = [];
  if (f.exclude_group_ids.length) {
    const { data, error } = await supabase
      .from("contact_group_members")
      .select("contact_id")
      .in("group_id", f.exclude_group_ids);
    if (error) throw error;
    excludeContactIds = [...new Set((data ?? []).map((r) => String((r as { contact_id: string }).contact_id)))];
  }

  return { includeContactIds, excludeContactIds };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyGroupMembershipFiltersToBuilder(query: any, resolution: GroupFilterResolution) {
  if (resolution.includeContactIds !== null) {
    if (resolution.includeContactIds.length === 0) {
      query = query.eq("id", NO_MATCH_ID);
    } else {
      query = query.in("id", resolution.includeContactIds);
    }
  }
  if (resolution.excludeContactIds.length) {
    query = query.not("id", "in", `(${resolution.excludeContactIds.join(",")})`);
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
