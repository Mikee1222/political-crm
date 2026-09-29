import { fetchWithTimeout } from "@/lib/client-fetch";

const NAV_ID_FETCH_TIMEOUT_MS = 45_000;

export type FetchAllSearchIdsOptions = {
  /** Absolute or relative list API path (e.g. `/api/contacts`). */
  apiPath: string;
  /** Build query params for a given 1-based page (must include filters; page/page_size set here). */
  buildParams: (page: number, pageSize: number) => URLSearchParams;
  /** Page size used for pagination — must match the seed page's size. */
  pageSize: number;
  /** Total match count from the first search response. */
  total: number;
  /** IDs from `seedPage` (usually the visible results page). */
  seedIds: string[];
  /** 1-based page that produced `seedIds`. Seed is reused only when this is 1. */
  seedPage?: number;
  /** Extract ordered IDs from a successful list JSON body. */
  extractIds: (json: unknown) => string[];
  /** Abort when a newer search supersedes this fetch. */
  signal?: AbortSignal;
};

/**
 * Silently paginate list pages to assemble the full ordered ID list
 * for search-result prev/next navigation.
 */
export async function fetchAllSearchResultIds(
  opts: FetchAllSearchIdsOptions,
): Promise<string[]> {
  const {
    apiPath,
    buildParams,
    pageSize,
    total,
    seedIds,
    seedPage = 1,
    extractIds,
    signal,
  } = opts;
  if (total <= 0) return [];

  const ids: string[] = [];
  const seen = new Set<string>();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  let startPage = 1;
  if (seedPage === 1 && seedIds.length > 0) {
    for (const id of seedIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
    if (ids.length >= total || totalPages <= 1) {
      return ids.slice(0, total);
    }
    startPage = 2;
  }

  for (let page = startPage; page <= totalPages; page++) {
    if (signal?.aborted) break;
    if (ids.length >= total) break;

    const params = buildParams(page, pageSize);
    params.set("page", String(page));
    params.set("page_size", String(pageSize));

    try {
      const res = await fetchWithTimeout(`${apiPath}?${params.toString()}`, {
        timeoutMs: NAV_ID_FETCH_TIMEOUT_MS,
        signal,
      });
      if (!res.ok) break;
      const json: unknown = await res.json().catch(() => null);
      const pageIds = extractIds(json);
      if (!pageIds.length) break;
      for (const id of pageIds) {
        if (seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
      }
    } catch {
      break;
    }
  }

  return ids.length ? ids : seedIds.slice();
}

export function extractContactListIds(json: unknown): string[] {
  if (!json || typeof json !== "object") return [];
  const contacts = (json as { contacts?: unknown }).contacts;
  if (!Array.isArray(contacts)) return [];
  const out: string[] = [];
  for (const row of contacts) {
    if (row && typeof row === "object" && typeof (row as { id?: unknown }).id === "string") {
      out.push((row as { id: string }).id);
    }
  }
  return out;
}

export function extractRequestListIds(json: unknown): string[] {
  if (!json || typeof json !== "object") return [];
  const o = json as { data?: unknown; requests?: unknown };
  const list = Array.isArray(o.data) ? o.data : Array.isArray(o.requests) ? o.requests : [];
  const out: string[] = [];
  for (const row of list) {
    if (row && typeof row === "object" && typeof (row as { id?: unknown }).id === "string") {
      out.push((row as { id: string }).id);
    }
  }
  return out;
}
