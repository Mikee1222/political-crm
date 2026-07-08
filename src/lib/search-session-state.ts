/**
 * Persist advanced-search UI state in sessionStorage so back-navigation
 * (and soft returns) can restore filters + cached results without a re-fetch.
 */

export const SEARCH_STATE_TTL_MS = 5 * 60 * 1000;

export const CONTACTS_SEARCH_STATE_KEY = "contacts-search-state-v1";
export const REQUESTS_SEARCH_STATE_KEY = "requests-search-state-v1";

export const CONTACTS_SEARCH_FRESH_KEY = "contacts-search:fresh";
export const REQUESTS_SEARCH_FRESH_KEY = "requests-search:fresh";

export const SEARCH_FRESH_EVENT = "crm-search-fresh-intent";

export type SearchSessionState<TFilters, TResult> = {
  savedAt: number;
  filters: TFilters;
  page: number;
  results: TResult[];
  total: number;
  scrollY: number;
  /** Query string that was on the search page (for URL restore). */
  urlQuery?: string;
};

function canUseSessionStorage(): boolean {
  return typeof window !== "undefined" && typeof sessionStorage !== "undefined";
}

export function saveSearchSessionState<TFilters, TResult>(
  key: string,
  state: Omit<SearchSessionState<TFilters, TResult>, "savedAt"> & { savedAt?: number },
): void {
  if (!canUseSessionStorage()) return;
  try {
    const payload: SearchSessionState<TFilters, TResult> = {
      ...state,
      savedAt: state.savedAt ?? Date.now(),
    };
    sessionStorage.setItem(key, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function loadSearchSessionState<TFilters, TResult>(
  key: string,
  ttlMs: number = SEARCH_STATE_TTL_MS,
): SearchSessionState<TFilters, TResult> | null {
  if (!canUseSessionStorage()) return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SearchSessionState<TFilters, TResult>;
    if (!parsed || typeof parsed.savedAt !== "number") {
      sessionStorage.removeItem(key);
      return null;
    }
    if (Date.now() - parsed.savedAt > ttlMs) {
      sessionStorage.removeItem(key);
      return null;
    }
    if (!Array.isArray(parsed.results) || typeof parsed.page !== "number") {
      sessionStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    return null;
  }
}

export function clearSearchSessionState(key: string): void {
  if (!canUseSessionStorage()) return;
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Mark next visit to the search page as intentional "start fresh" (nav link). */
export function markSearchFreshIntent(freshKey: string): void {
  if (!canUseSessionStorage()) return;
  try {
    sessionStorage.setItem(freshKey, "1");
    window.dispatchEvent(
      new CustomEvent(SEARCH_FRESH_EVENT, { detail: { freshKey } }),
    );
  } catch {
    /* ignore */
  }
}

/**
 * Consume fresh-nav intent. Returns true once if the flag was set, then clears it.
 */
export function consumeSearchFreshIntent(freshKey: string): boolean {
  if (!canUseSessionStorage()) return false;
  try {
    const v = sessionStorage.getItem(freshKey);
    if (v === "1") {
      sessionStorage.removeItem(freshKey);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** True when URL already encodes an active search (`ran=1`). */
export function urlHasRanSearch(search: string): boolean {
  try {
    return new URLSearchParams(search).get("ran") === "1";
  } catch {
    return false;
  }
}
