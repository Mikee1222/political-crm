import type { SupabaseClient } from "@supabase/supabase-js";
import { getRequestStatusQueryValues } from "@/lib/request-statuses";
import type { RequestListFilters } from "@/lib/requests-filters";

const EMPTY_UUID = "00000000-0000-0000-0000-000000000000";

function escapeIlike(q: string) {
  return q.replace(/[%_\\,().]/g, (c) => `\\${c}`);
}

function dateFromForRange(range: string): string | null {
  const d0 = new Date();
  d0.setHours(0, 0, 0, 0);
  const out = new Date(d0);
  switch (range) {
    case "today":
      return out.toISOString();
    case "7d":
      out.setDate(out.getDate() - 7);
      return out.toISOString();
    case "30d":
      out.setDate(out.getDate() - 30);
      return out.toISOString();
    case "90d":
      out.setDate(out.getDate() - 90);
      return out.toISOString();
    default:
      return null;
  }
}

export type RequestFilterResolution = {
  categoryNames: string[];
  excludeCategoryNames: string[];
  requesterContactIds: string[];
  affectedContactIds: string[];
  helperContactIds: string[];
  requesterRequestIds: string[] | null;
  affectedRequestIds: string[] | null;
  helperRequestIds: string[] | null;
  notesRequestIds: string[] | null;
  noMatch: boolean;
};

async function resolveContactIdsByPersonName(
  supabase: SupabaseClient,
  name: string,
): Promise<string[]> {
  const raw = name.trim();
  if (!raw) return [];
  const pat = `%${escapeIlike(raw)}%`;
  const ids = new Set<string>();

  const { data: broad } = await supabase
    .from("contacts")
    .select("id")
    .or(`first_name.ilike.${pat},last_name.ilike.${pat}`);
  for (const row of broad ?? []) ids.add((row as { id: string }).id);

  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const first = `%${escapeIlike(parts[0]!)}%`;
    const last = `%${escapeIlike(parts.slice(1).join(" "))}%`;
    const { data: pair } = await supabase
      .from("contacts")
      .select("id")
      .ilike("first_name", first)
      .ilike("last_name", last);
    for (const row of pair ?? []) ids.add((row as { id: string }).id);
  }

  return [...ids];
}

async function resolveCategoryNames(
  supabase: SupabaseClient,
  categoryIds: string[],
): Promise<string[]> {
  if (!categoryIds.length) return [];
  const { data } = await supabase.from("request_categories").select("name").in("id", categoryIds);
  return (data ?? []).map((r) => String((r as { name: string }).name).trim()).filter(Boolean);
}

async function requestIdsForPersonRole(
  supabase: SupabaseClient,
  contactIds: string[],
  role: string,
): Promise<string[]> {
  if (!contactIds.length) return [];
  const { data } = await supabase
    .from("request_persons")
    .select("request_id")
    .in("contact_id", contactIds)
    .eq("role", role);
  return (data ?? []).map((r) => (r as { request_id: string }).request_id);
}

async function requestIdsForNotes(supabase: SupabaseClient, notes: string): Promise<string[]> {
  const raw = notes.trim();
  if (!raw) return [];
  const pat = `%${escapeIlike(raw)}%`;
  const { data } = await supabase.from("request_notes").select("request_id").ilike("content", pat);
  const ids = new Set<string>();
  for (const row of data ?? []) ids.add((row as { request_id: string }).request_id);
  return [...ids];
}

export async function resolveRequestListFilters(
  supabase: SupabaseClient,
  f: RequestListFilters,
): Promise<RequestFilterResolution> {
  const categoryNames = [
    ...(f.category?.trim() ? [f.category.trim()] : []),
    ...(await resolveCategoryNames(supabase, f.category_ids)),
  ];
  const excludeCategoryNames = await resolveCategoryNames(supabase, f.exclude_category_ids);
  const requesterContactIds = await resolveContactIdsByPersonName(supabase, f.requester_name);
  const affectedContactIds = await resolveContactIdsByPersonName(supabase, f.affected_name);
  const helperContactIds = await resolveContactIdsByPersonName(supabase, f.helper_name);
  const notesRequestIds = f.notes.trim() ? await requestIdsForNotes(supabase, f.notes) : null;

  let noMatch = false;
  if (f.requester_name.trim() && requesterContactIds.length === 0) noMatch = true;
  if (f.affected_name.trim() && affectedContactIds.length === 0) noMatch = true;
  if (f.helper_name.trim() && helperContactIds.length === 0) noMatch = true;
  if (notesRequestIds && notesRequestIds.length === 0) noMatch = true;

  const requesterRequestIds = f.requester_name.trim()
    ? await collectRequestIdsForContacts(supabase, requesterContactIds, {
        column: "contact_id",
        role: "requester",
      })
    : null;
  const affectedRequestIds = f.affected_name.trim()
    ? await collectRequestIdsForContacts(supabase, affectedContactIds, {
        column: "affected_contact_id",
        role: "affected",
      })
    : null;
  const helperRequestIds = f.helper_name.trim()
    ? await collectRequestIdsForContacts(supabase, helperContactIds, { role: "helper" })
    : null;

  return {
    categoryNames: [...new Set(categoryNames)],
    excludeCategoryNames: [...new Set(excludeCategoryNames)],
    requesterContactIds,
    affectedContactIds,
    helperContactIds,
    requesterRequestIds,
    affectedRequestIds,
    helperRequestIds,
    notesRequestIds,
    noMatch,
  };
}

export async function resolvePhoneContactIds(supabase: SupabaseClient, search: string): Promise<string[]> {
  const raw = search.trim();
  if (!raw || !/^\d+/.test(raw)) return [];
  const pat = `%${escapeIlike(raw)}%`;
  const { data: phoneMatches } = await supabase
    .from("contacts")
    .select("id")
    .or(`phone.ilike.${pat},phone2.ilike.${pat},landline.ilike.${pat}`);
  return (phoneMatches ?? []).map((c) => (c as { id: string }).id);
}

async function collectRequestIdsForContacts(
  supabase: SupabaseClient,
  contactIds: string[],
  opts: { column?: "contact_id" | "affected_contact_id"; role?: string },
): Promise<string[]> {
  if (!contactIds.length) return [];
  const ids = new Set<string>();
  if (opts.column) {
    const { data } = await supabase.from("requests").select("id").in(opts.column, contactIds);
    for (const row of data ?? []) ids.add((row as { id: string }).id);
  }
  if (opts.role) {
    for (const id of await requestIdsForPersonRole(supabase, contactIds, opts.role)) ids.add(id);
  }
  return [...ids];
}

export function applyRequestListFiltersToBuilder(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  f: RequestListFilters,
  resolution: RequestFilterResolution,
  opts?: { withSearchEmbed?: boolean; contactIdsFromPhone?: string[] },
) {
  if (resolution.noMatch) {
    return query.eq("id", EMPTY_UUID);
  }

  if (f.status) {
    const statusValues = getRequestStatusQueryValues(f.status);
    query =
      statusValues.length > 1 ? query.in("status", statusValues) : query.eq("status", statusValues[0]);
  }
  if (f.priority) query = query.eq("priority", f.priority);
  if (f.handler_id) query = query.eq("assigned_to", f.handler_id);

  if (resolution.categoryNames.length === 1) {
    query = query.eq("category", resolution.categoryNames[0]);
  } else if (resolution.categoryNames.length > 1) {
    query = query.in("category", resolution.categoryNames);
  }
  if (resolution.excludeCategoryNames.length) {
    query = query.not("category", "in", `(${resolution.excludeCategoryNames.join(",")})`);
  }

  const dateFrom = f.created_from.trim()
    ? `${f.created_from.trim()}T00:00:00.000Z`
    : dateFromForRange(f.range);
  if (dateFrom) query = query.gte("created_at", dateFrom);
  if (f.created_to.trim()) {
    query = query.lte("created_at", `${f.created_to.trim()}T23:59:59.999Z`);
  }

  if (f.request_code.trim()) {
    const pat = `%${escapeIlike(f.request_code.trim())}%`;
    query = query.ilike("request_code", pat);
  }

  if (resolution.requesterRequestIds) {
    query = resolution.requesterRequestIds.length
      ? query.in("id", resolution.requesterRequestIds)
      : query.eq("id", EMPTY_UUID);
  }

  if (resolution.affectedRequestIds) {
    query = resolution.affectedRequestIds.length
      ? query.in("id", resolution.affectedRequestIds)
      : query.eq("id", EMPTY_UUID);
  }

  if (resolution.helperRequestIds) {
    query = resolution.helperRequestIds.length
      ? query.in("id", resolution.helperRequestIds)
      : query.eq("id", EMPTY_UUID);
  }

  if (resolution.notesRequestIds) {
    query = query.in("id", resolution.notesRequestIds);
  }

  if (f.search) {
    const pat = `%${escapeIlike(f.search)}%`;
    const parts = [`title.ilike.${pat}`, `description.ilike.${pat}`, `request_code.ilike.${pat}`];
    if (opts?.withSearchEmbed) {
      parts.push(`contacts.first_name.ilike.${pat}`, `contacts.last_name.ilike.${pat}`);
    }
    if (opts?.contactIdsFromPhone?.length) {
      parts.push(`contact_id.in.(${opts.contactIdsFromPhone.join(",")})`);
    }
    query = query.or(parts.join(","));
  }

  return query;
}
