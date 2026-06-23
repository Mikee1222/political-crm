import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyContactIdIncludeFilter,
  MAX_ID_IN_CLAUSE,
  NO_MATCH_CONTACT_ID,
} from "@/lib/contact-group-members";
import { getRequestStatusQueryValues } from "@/lib/request-statuses";
import type { RequestListFilters } from "@/lib/requests-filters";
import { isUuid } from "@/lib/resolve-entity-id";
import { resolveHandlerAssignedValues } from "@/lib/staff-aliases";

const EMPTY_UUID = NO_MATCH_CONTACT_ID;

function escapeIlike(q: string) {
  return q.replace(/[%_\\,().]/g, (c) => `\\${c}`);
}

/** PostgREST `.or()` ilike values must be double-quoted when they contain `%` or special chars. */
function quotedIlikePattern(raw: string): string {
  const pat = `%${escapeIlike(raw)}%`;
  return `"${pat.replace(/"/g, '\\"')}"`;
}

function quoteCsv(values: string[]): string {
  return values.map((v) => `"${v.replace(/"/g, '\\"')}"`).join(",");
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
  searchNotesRequestIds: string[] | null;
  handlerAssignedValues: string[] | null;
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

  const [firstRes, lastRes] = await Promise.all([
    supabase.from("contacts").select("id").ilike("first_name", pat),
    supabase.from("contacts").select("id").ilike("last_name", pat),
  ]);
  for (const row of firstRes.data ?? []) ids.add((row as { id: string }).id);
  for (const row of lastRes.data ?? []) ids.add((row as { id: string }).id);

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

async function resolveContactIdsForPersonFilter(
  supabase: SupabaseClient,
  contactId: string,
  name: string,
): Promise<string[]> {
  const id = contactId.trim();
  if (id) {
    if (isUuid(id)) return [id];
    const resolved = await resolveContactIdsByPersonName(supabase, id);
    return resolved.length ? resolved : [];
  }
  return resolveContactIdsByPersonName(supabase, name);
}

async function resolveCategoryFilterNames(
  supabase: SupabaseClient,
  categoryValues: string[],
): Promise<string[]> {
  const names: string[] = [];
  const uuidIds: string[] = [];
  for (const raw of categoryValues) {
    const v = raw.trim();
    if (!v) continue;
    if (isUuid(v)) uuidIds.push(v);
    else names.push(v);
  }
  if (uuidIds.length) {
    const { data } = await supabase.from("request_categories").select("name").in("id", uuidIds);
    for (const row of data ?? []) {
      const n = String((row as { name: string }).name).trim();
      if (n) names.push(n);
    }
  }
  return [...new Set(names)];
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

function personFilterActive(contactId: string, name: string): boolean {
  return Boolean(contactId.trim() || name.trim());
}

function applyCategoryExcludeFilter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  names: string[],
) {
  if (!names.length) return query;
  if (typeof query.notIn === "function") {
    return query.notIn("category", names);
  }
  return query.not("category", "in", `(${quoteCsv(names)})`);
}

function applyRequestIdIncludeFilter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  ids: string[],
) {
  return applyContactIdIncludeFilter(query, ids);
}

export function buildRequestListSelect(withContactEmbed: boolean, contactInnerJoin = false): string {
  const base =
    "id, request_code, title, description, category, status, priority, assigned_to, created_at, updated_at, contact_id, affected_contact_id, sla_due_date, sla_status";
  if (!withContactEmbed) return base;
  const embed = contactInnerJoin
    ? "contacts!contact_id!inner(first_name,last_name,phone)"
    : "contacts!contact_id(first_name,last_name,phone)";
  return `${base}, ${embed}`;
}

export async function resolveRequestListFilters(
  supabase: SupabaseClient,
  f: RequestListFilters,
): Promise<RequestFilterResolution> {
  const categoryNames = [
    ...(f.category?.trim() ? [f.category.trim()] : []),
    ...(await resolveCategoryFilterNames(supabase, f.category_ids)),
  ];
  const excludeCategoryNames = await resolveCategoryFilterNames(supabase, f.exclude_category_ids);

  const requesterActive = personFilterActive(f.requester_contact_id, f.requester_name);
  const affectedActive = personFilterActive(f.affected_contact_id, f.affected_name);
  const helperActive = personFilterActive(f.helper_contact_id, f.helper_name);

  const requesterContactIds = requesterActive
    ? await resolveContactIdsForPersonFilter(supabase, f.requester_contact_id, f.requester_name)
    : [];
  const affectedContactIds = affectedActive
    ? await resolveContactIdsForPersonFilter(supabase, f.affected_contact_id, f.affected_name)
    : [];
  const helperContactIds = helperActive
    ? await resolveContactIdsForPersonFilter(supabase, f.helper_contact_id, f.helper_name)
    : [];

  const notesRequestIds = f.notes.trim() ? await requestIdsForNotes(supabase, f.notes) : null;
  const searchNotesRequestIds = f.search.trim() ? await requestIdsForNotes(supabase, f.search) : null;
  const handlerAssignedValues = f.handler_id.trim()
    ? await resolveHandlerAssignedValues(supabase, f.handler_id)
    : null;

  let noMatch = false;
  if (requesterActive && requesterContactIds.length === 0) noMatch = true;
  if (affectedActive && affectedContactIds.length === 0) noMatch = true;
  if (helperActive && helperContactIds.length === 0) noMatch = true;
  if (notesRequestIds && notesRequestIds.length === 0) noMatch = true;

  const requesterRequestIds = requesterActive
    ? await collectRequestIdsForContacts(supabase, requesterContactIds, {
        column: "contact_id",
        role: "requester",
      })
    : null;
  const affectedRequestIds = affectedActive
    ? await collectRequestIdsForContacts(supabase, affectedContactIds, {
        column: "affected_contact_id",
        role: "affected",
      })
    : null;
  const helperRequestIds = helperActive
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
    searchNotesRequestIds,
    handlerAssignedValues,
    noMatch,
  };
}

export async function resolvePhoneContactIds(supabase: SupabaseClient, search: string): Promise<string[]> {
  const raw = search.trim();
  if (!raw || !/^\d+/.test(raw)) return [];
  const pat = `%${escapeIlike(raw)}%`;
  const [phoneRes, phone2Res, landlineRes] = await Promise.all([
    supabase.from("contacts").select("id").ilike("phone", pat),
    supabase.from("contacts").select("id").ilike("phone2", pat),
    supabase.from("contacts").select("id").ilike("landline", pat),
  ]);
  const ids = new Set<string>();
  for (const row of phoneRes.data ?? []) ids.add((row as { id: string }).id);
  for (const row of phone2Res.data ?? []) ids.add((row as { id: string }).id);
  for (const row of landlineRes.data ?? []) ids.add((row as { id: string }).id);
  return [...ids];
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
  if (resolution.handlerAssignedValues?.length) {
    query =
      resolution.handlerAssignedValues.length === 1
        ? query.eq("assigned_to", resolution.handlerAssignedValues[0])
        : query.in("assigned_to", resolution.handlerAssignedValues);
  }

  if (resolution.categoryNames.length === 1) {
    query = query.eq("category", resolution.categoryNames[0]);
  } else if (resolution.categoryNames.length > 1) {
    query = query.in("category", resolution.categoryNames);
  }
  query = applyCategoryExcludeFilter(query, resolution.excludeCategoryNames);

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
    query =
      resolution.requesterRequestIds.length > 0
        ? applyRequestIdIncludeFilter(query, resolution.requesterRequestIds)
        : query.eq("id", EMPTY_UUID);
  }

  if (resolution.affectedRequestIds) {
    query =
      resolution.affectedRequestIds.length > 0
        ? applyRequestIdIncludeFilter(query, resolution.affectedRequestIds)
        : query.eq("id", EMPTY_UUID);
  }

  if (resolution.helperRequestIds) {
    query =
      resolution.helperRequestIds.length > 0
        ? applyRequestIdIncludeFilter(query, resolution.helperRequestIds)
        : query.eq("id", EMPTY_UUID);
  }

  if (resolution.notesRequestIds) {
    query = applyRequestIdIncludeFilter(query, resolution.notesRequestIds);
  }

  if (f.search.trim()) {
    const qpat = quotedIlikePattern(f.search.trim());
    const parts = [
      `title.ilike.${qpat}`,
      `description.ilike.${qpat}`,
      `request_code.ilike.${qpat}`,
    ];
    if (opts?.withSearchEmbed) {
      parts.push(`contacts.first_name.ilike.${qpat}`, `contacts.last_name.ilike.${qpat}`);
    }
    if (opts?.contactIdsFromPhone?.length) {
      parts.push(`contact_id.in.(${quoteCsv(opts.contactIdsFromPhone)})`);
    }
    if (resolution.searchNotesRequestIds?.length) {
      const noteIds = resolution.searchNotesRequestIds;
      if (noteIds.length <= MAX_ID_IN_CLAUSE) {
        parts.push(`id.in.(${quoteCsv(noteIds)})`);
      } else {
        for (let i = 0; i < noteIds.length; i += MAX_ID_IN_CLAUSE) {
          const chunk = noteIds.slice(i, i + MAX_ID_IN_CLAUSE);
          parts.push(`id.in.(${quoteCsv(chunk)})`);
        }
      }
    }
    query = query.or(parts.join(","));
  }

  return query;
}
