import { fetchWithTimeout } from "@/lib/client-fetch";
import {
  getClientTtlCache,
  invalidateClientTtlCache,
  setClientTtlCache,
} from "@/lib/ttl-cache";
import type { ToponymListRow } from "@/app/api/toponyms/route";

const MUNICIPALITIES_KEY = "geo-lists:municipalities";
const TOPONYMS_KEY = "geo-lists:toponyms";
const TTL_MS = 5 * 60 * 1000;

const inflight = new Map<string, Promise<unknown>>();

function normalizeToponyms(raw: unknown): ToponymListRow[] {
  const rows = Array.isArray(raw)
    ? (raw as ToponymListRow[])
    : ((raw as { toponyms?: ToponymListRow[] } | null)?.toponyms ?? []);
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((t) => t && typeof t.name === "string" && t.name.trim().length > 2)
    .map((t) => ({ ...t, name: t.name.trim() }));
}

function normalizeMunicipalityNames(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((n) => (typeof n === "string" ? n.trim() : ""))
      .filter(Boolean);
  }
  const nested = (raw as { municipalities?: string[] } | null)?.municipalities;
  if (!Array.isArray(nested)) return [];
  return nested
    .map((n) => (typeof n === "string" ? n.trim() : ""))
    .filter(Boolean);
}

async function loadCached<T>(
  key: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  const hit = getClientTtlCache<T>(key);
  if (hit != null) return hit;

  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const promise = fetcher()
    .then((value) => {
      setClientTtlCache(key, value, TTL_MS);
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

/** Sync peek — used to seed React state without a loading flash. */
export function peekMunicipalities(): string[] | null {
  return getClientTtlCache<string[]>(MUNICIPALITIES_KEY);
}

/** Sync peek — used to seed React state without a loading flash. */
export function peekToponyms(): ToponymListRow[] | null {
  return getClientTtlCache<ToponymListRow[]>(TOPONYMS_KEY);
}

export async function getMunicipalitiesCached(): Promise<string[]> {
  return loadCached(MUNICIPALITIES_KEY, async () => {
    const r = await fetchWithTimeout("/api/municipalities");
    if (!r.ok) return [];
    return normalizeMunicipalityNames(await r.json());
  });
}

export async function getToponymsCached(): Promise<ToponymListRow[]> {
  return loadCached(TOPONYMS_KEY, async () => {
    const r = await fetchWithTimeout("/api/toponyms");
    if (!r.ok) return [];
    return normalizeToponyms(await r.json());
  });
}

/** Warm the shared cache (e.g. after a list fetch elsewhere on the page). */
export function seedMunicipalitiesCache(names: string[]): void {
  setClientTtlCache(MUNICIPALITIES_KEY, names, TTL_MS);
}

export function seedToponymsCache(rows: ToponymListRow[]): void {
  setClientTtlCache(TOPONYMS_KEY, normalizeToponyms(rows), TTL_MS);
}

/** Test helper — clears TTL + in-flight maps. */
export function clearGeoListsCacheForTests(): void {
  inflight.clear();
  invalidateClientTtlCache("geo-lists:");
}
