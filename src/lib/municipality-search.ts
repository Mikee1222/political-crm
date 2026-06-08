import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeGreekNameKey } from "@/lib/greek-fuzzy-name";

export type MunicipalitySearchRow = {
  id: string;
  name: string;
  regional_unit: string | null;
};

function stripMunicipalityPrefix(s: string): string {
  return s.replace(/^(?:δημος|δήμος)\s+/iu, "").trim();
}

/** Case- and accent-insensitive partial match for municipality registry names. */
export function municipalityNameMatchesQuery(name: string, query: string): boolean {
  const q = normalizeGreekNameKey(query.trim());
  if (!q || q.length < 2) return false;
  const n = normalizeGreekNameKey(name);
  const nCore = normalizeGreekNameKey(stripMunicipalityPrefix(name));
  const qCore = normalizeGreekNameKey(stripMunicipalityPrefix(query));
  return (
    n.includes(q) ||
    nCore.includes(q) ||
    n.includes(qCore) ||
    nCore.includes(qCore) ||
    q.includes(nCore)
  );
}

export function filterMunicipalityRows(
  rows: MunicipalitySearchRow[],
  query: string,
): MunicipalitySearchRow[] {
  const t = query.trim();
  if (!t) return [];
  return rows.filter((r) => municipalityNameMatchesQuery(r.name, t));
}

let cachedRows: MunicipalitySearchRow[] | null = null;
let cacheAt = 0;
const CACHE_MS = 60_000;

export async function fetchMunicipalityRows(supabase: SupabaseClient): Promise<MunicipalitySearchRow[]> {
  const now = Date.now();
  if (cachedRows && now - cacheAt < CACHE_MS) return cachedRows;
  const { data, error } = await supabase
    .from("municipalities")
    .select("id, name, regional_unit")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  cachedRows = (data ?? []) as MunicipalitySearchRow[];
  cacheAt = now;
  return cachedRows;
}

export async function searchMunicipalities(
  supabase: SupabaseClient,
  query: string,
): Promise<MunicipalitySearchRow[]> {
  const rows = await fetchMunicipalityRows(supabase);
  return filterMunicipalityRows(rows, query);
}

function municipalityQueriesFromFilters(filters: Record<string, unknown>): string[] {
  const out: string[] = [];
  if (typeof filters.municipality === "string" && filters.municipality.trim()) {
    out.push(filters.municipality.trim());
  }
  if (Array.isArray(filters.municipalities)) {
    for (const m of filters.municipalities) {
      const s = String(m ?? "").trim();
      if (s) out.push(s);
    }
  }
  return [...new Set(out)];
}

/**
 * Resolve free-text municipality filter(s) to exact registry names for contact export.
 * When no registry match, keeps original filter for partial (ilike) export fallback.
 */
export async function resolveMunicipalityExportFilters(
  supabase: SupabaseClient,
  filters: Record<string, unknown>,
): Promise<{
  filters: Record<string, unknown>;
  resolved: string[];
  queries: string[];
  municipalityExact: boolean;
}> {
  const queries = municipalityQueriesFromFilters(filters);
  if (!queries.length) {
    return { filters, resolved: [], queries: [], municipalityExact: false };
  }

  const rows = await fetchMunicipalityRows(supabase);
  const resolved = new Set<string>();
  for (const q of queries) {
    for (const hit of filterMunicipalityRows(rows, q)) {
      resolved.add(hit.name);
    }
  }

  if (!resolved.size) {
    return { filters, resolved: [], queries, municipalityExact: false };
  }

  const next = { ...filters };
  delete next.municipality;
  next.municipalities = [...resolved];
  return {
    filters: next,
    resolved: [...resolved],
    queries,
    municipalityExact: true,
  };
}
