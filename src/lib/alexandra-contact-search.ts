import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContactListFilters } from "@/lib/contacts-filters";
import { isNameOnlyFilter, searchContactsByName } from "@/lib/contacts-query";

/** Default/max rows returned by Alexandra broad contact search tools. */
export const ALEXANDRA_CONTACT_SEARCH_DEFAULT_LIMIT = 75;
export const ALEXANDRA_CONTACT_SEARCH_MAX_LIMIT = 100;

/** Person-picker comboboxes (requests, related persons, tasks). */
export const CONTACT_COMBOBOX_SEARCH_LIMIT = 50;

function looksLikePhoneQuery(s: string): boolean {
  const digits = s.replace(/[\s+()./-]/g, "");
  return /^\d{6,}$/.test(digits);
}

const CONTACT_SEARCH_SELECT =
  "id, first_name, last_name, phone, phone2, landline, area, municipality, call_status, priority, nickname, contact_code, father_name";

export type AlexandraContactHit = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  call_status?: string | null;
  contact_code?: string | null;
  municipality?: string | null;
  area?: string | null;
  nickname?: string | null;
};

export function alexandraContactSearchLimit(raw: { limit?: unknown }): number {
  const n = Number(raw.limit);
  if (Number.isFinite(n) && n > 0) {
    return Math.min(ALEXANDRA_CONTACT_SEARCH_MAX_LIMIT, Math.max(1, Math.floor(n)));
  }
  return ALEXANDRA_CONTACT_SEARCH_DEFAULT_LIMIT;
}

/** Split free-text name search into RPC name columns (Greek order: first … father … last). */
export function parseNameSearchTokens(search: string): {
  firstName: string | null;
  lastName: string | null;
  fatherName: string | null;
} {
  const terms = search.trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return { firstName: null, lastName: null, fatherName: null };
  if (terms.length === 1) return { firstName: terms[0]!, lastName: null, fatherName: null };
  if (terms.length === 2) return { firstName: terms[0]!, lastName: terms[1]!, fatherName: null };
  return {
    firstName: terms[0]!,
    lastName: terms[terms.length - 1]!,
    fatherName: terms.slice(1, -1).join(" "),
  };
}

/**
 * Normalize Alexandra / advanced filter objects: `name` → `search`, and split multi-token
 * search into first/last/father for accent-insensitive RPC when no explicit columns set.
 */
export function normalizeContactSearchFilters(filters: Record<string, unknown>): Record<string, unknown> {
  const out = { ...filters };
  if (!out.search && typeof out.name === "string" && out.name.trim()) {
    out.search = out.name.trim();
  }
  const hasExplicitName =
    (typeof out.first_name === "string" && out.first_name.trim()) ||
    (typeof out.last_name === "string" && out.last_name.trim()) ||
    (typeof out.father_name === "string" && out.father_name.trim());
  if (!hasExplicitName && typeof out.search === "string" && out.search.trim()) {
    const { firstName, lastName, fatherName } = parseNameSearchTokens(out.search);
    if (firstName && lastName) {
      out.first_name = firstName;
      out.last_name = lastName;
      if (fatherName) out.father_name = fatherName;
      delete out.search;
      delete out.name;
    } else if (firstName) {
      if (looksLikePhoneQuery(firstName)) {
        out.phone = firstName.replace(/[\s+()./-]/g, "");
      } else {
        out.first_name = firstName;
      }
      delete out.search;
      delete out.name;
    }
  }
  return out;
}

export type AlexandraNameSearchOpts = {
  firstName?: string | null;
  lastName?: string | null;
  fatherName?: string | null;
  phone?: string | null;
};

/** Map free-text `search` into first/last/father columns (same as advanced search UI). */
export function normalizeContactListFiltersForNameRpc(f: ContactListFilters): ContactListFilters {
  if (!f.search?.trim()) return f;
  const norm = normalizeContactSearchFilters({ search: f.search });
  const out = { ...f, search: "" };
  if (norm.phone) out.phone = String(norm.phone);
  if (norm.first_name) out.first_name = String(norm.first_name);
  if (norm.last_name) out.last_name = String(norm.last_name);
  if (norm.father_name) out.father_name = String(norm.father_name);
  if (typeof norm.search === "string" && norm.search.trim()) out.search = norm.search.trim();
  return out;
}

/** Build GET /api/contacts query for person-picker comboboxes (RPC-friendly params). */
export function buildContactComboboxSearchParams(
  query: string,
  limit: number = CONTACT_COMBOBOX_SEARCH_LIMIT,
): URLSearchParams {
  const u = new URLSearchParams();
  u.set("limit", String(limit));
  const trimmed = query.trim();
  if (!trimmed) return u;

  const norm = normalizeContactSearchFilters({ search: trimmed });
  if (norm.phone) {
    u.set("phone", String(norm.phone));
    return u;
  }
  if (norm.first_name) {
    u.set("first_name", String(norm.first_name));
    if (norm.last_name) u.set("last_name", String(norm.last_name));
    if (norm.father_name) u.set("father_name", String(norm.father_name));
    return u;
  }
  if (typeof norm.search === "string" && norm.search.trim()) {
    u.set("search", norm.search.trim());
    return u;
  }
  u.set("search", trimmed);
  return u;
}

export function resolveAlexandraNameSearch(f: ContactListFilters): AlexandraNameSearchOpts | null {
  const n = normalizeContactListFiltersForNameRpc(f);
  const phone = n.phone?.trim() || null;
  const firstName = n.first_name?.trim() || null;
  const lastName = n.last_name?.trim() || null;
  const fatherName = n.father_name?.trim() || null;
  if (phone && !firstName && !lastName && !fatherName) return { phone };
  if (!firstName && !lastName && !fatherName) return null;
  return { firstName, lastName, fatherName };
}

/** Name-only or phone-only filters — use search_contacts_by_name RPC (not in-memory scan). */
export function filtersAllowAlexandraNameRpc(f: ContactListFilters): boolean {
  const n = normalizeContactListFiltersForNameRpc(f);
  const hasPhone = Boolean(n.phone?.trim());
  const hasName = Boolean(n.first_name?.trim() || n.last_name?.trim() || n.father_name?.trim());
  if (hasPhone && !hasName) return true;
  if (!hasName) return false;
  return isNameOnlyFilter(n);
}

function mapHits(rows: Record<string, unknown>[]): AlexandraContactHit[] {
  return rows.map((r) => ({
    id: String(r.id),
    first_name: String(r.first_name ?? ""),
    last_name: String(r.last_name ?? ""),
    phone: (r.phone as string | null) ?? null,
    call_status: (r.call_status as string | null) ?? null,
    contact_code: (r.contact_code as string | null) ?? undefined,
    municipality: (r.municipality as string | null) ?? undefined,
    area: (r.area as string | null) ?? undefined,
    nickname: (r.nickname as string | null) ?? undefined,
  }));
}

/**
 * Accent-insensitive contact search for Alexandra context and direct Supabase callers.
 * Phone/code-style lookups keep exact ilike; names use search_contacts_by_name RPC.
 */
export async function countAlexandraContacts(
  supabase: SupabaseClient,
  opts: AlexandraNameSearchOpts,
): Promise<number> {
  const phone = opts.phone?.trim() ?? "";
  if (phone) {
    const { count, error } = await supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .or(`phone.ilike.%${phone}%,phone2.ilike.%${phone}%,landline.ilike.%${phone}%`);
    if (error) throw new Error(error.message);
    return count ?? 0;
  }
  const rows = await searchContactsByName(supabase, {
    firstName: opts.firstName,
    lastName: opts.lastName,
    fatherName: opts.fatherName,
  });
  return rows.length;
}

export async function searchAlexandraContacts(
  supabase: SupabaseClient,
  opts: {
    search?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    fatherName?: string | null;
    phone?: string | null;
    limit?: number;
  },
): Promise<AlexandraContactHit[]> {
  const limit = Math.min(
    ALEXANDRA_CONTACT_SEARCH_MAX_LIMIT,
    Math.max(1, opts.limit ?? ALEXANDRA_CONTACT_SEARCH_DEFAULT_LIMIT),
  );

  const phone = opts.phone?.trim() ?? "";
  if (phone) {
    const { data, error } = await supabase
      .from("contacts")
      .select(CONTACT_SEARCH_SELECT)
      .or(`phone.ilike.%${phone}%,phone2.ilike.%${phone}%,landline.ilike.%${phone}%`)
      .limit(limit);
    if (error) throw new Error(error.message);
    return mapHits((data ?? []) as Record<string, unknown>[]);
  }

  const search = opts.search?.trim() ?? "";
  let firstName = opts.firstName?.trim() || null;
  let lastName = opts.lastName?.trim() || null;
  let fatherName = opts.fatherName?.trim() || null;

  if (!firstName && !lastName && !fatherName && search) {
    const tokens = parseNameSearchTokens(search);
    firstName = tokens.firstName;
    lastName = tokens.lastName;
    fatherName = tokens.fatherName;
  }

  if (!firstName && !lastName && !fatherName) return [];

  const rows = await searchContactsByName(supabase, { firstName, lastName, fatherName });
  return mapHits(rows.slice(0, limit));
}
