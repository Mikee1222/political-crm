/**
 * Persist advanced-search UI state in sessionStorage so back-navigation
 * (and soft returns) can restore filters + cached results without a re-fetch.
 */

export const SEARCH_STATE_TTL_MS = 5 * 60 * 1000;

export const CONTACTS_SEARCH_STATE_KEY = "contacts-search-state-v1";
export const REQUESTS_SEARCH_STATE_KEY = "requests-search-state-v1";

export const CONTACTS_SEARCH_FRESH_KEY = "contacts-search:fresh";
export const REQUESTS_SEARCH_FRESH_KEY = "requests-search:fresh";

/** Ordered contact IDs from /contacts/search for detail prev/next. */
export const CONTACTS_SEARCH_NAV_KEY = "contacts-search-nav-v1";

/** Legacy key read by contact detail (also written by /contacts list). */
export const CONTACTS_NAV_KEY = "contacts_nav";

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

export type ContactsSearchNavState = {
  savedAt: number;
  /** Ordered result IDs (current page / navigable set). */
  ids: string[];
  /** Display names keyed by contact id (optional, for list chip). */
  labels?: Record<string, string>;
  /** Origin — only show prev/next when opened from search. */
  source: "search";
  /** Total matches reported by search (may exceed ids.length when paginated). */
  total?: number;
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

/** Persist ordered search-result IDs for contact detail prev/next. */
export function saveContactsSearchNav(
  ids: string[],
  opts?: { labels?: Record<string, string>; total?: number },
): void {
  if (!canUseSessionStorage()) return;
  if (!ids.length) {
    clearContactsSearchNav();
    return;
  }
  try {
    const payload: ContactsSearchNavState = {
      savedAt: Date.now(),
      ids: [...ids],
      labels: opts?.labels,
      source: "search",
      total: opts?.total,
    };
    sessionStorage.setItem(CONTACTS_SEARCH_NAV_KEY, JSON.stringify(payload));
    // Keep legacy key in sync so contact detail prev/next works.
    sessionStorage.setItem(
      CONTACTS_NAV_KEY,
      JSON.stringify({ ids: payload.ids, source: "search", total: payload.total }),
    );
  } catch {
    /* quota / private mode */
  }
}

export function loadContactsSearchNav(
  ttlMs: number = SEARCH_STATE_TTL_MS,
): ContactsSearchNavState | null {
  if (!canUseSessionStorage()) return null;
  try {
    const raw = sessionStorage.getItem(CONTACTS_SEARCH_NAV_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ContactsSearchNavState;
    if (!parsed || parsed.source !== "search" || typeof parsed.savedAt !== "number") {
      sessionStorage.removeItem(CONTACTS_SEARCH_NAV_KEY);
      return null;
    }
    if (Date.now() - parsed.savedAt > ttlMs) {
      sessionStorage.removeItem(CONTACTS_SEARCH_NAV_KEY);
      return null;
    }
    if (!Array.isArray(parsed.ids) || parsed.ids.length === 0) {
      sessionStorage.removeItem(CONTACTS_SEARCH_NAV_KEY);
      return null;
    }
    return parsed;
  } catch {
    try {
      sessionStorage.removeItem(CONTACTS_SEARCH_NAV_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
}

export function clearContactsSearchNav(): void {
  if (!canUseSessionStorage()) return;
  try {
    sessionStorage.removeItem(CONTACTS_SEARCH_NAV_KEY);
    const legacy = sessionStorage.getItem(CONTACTS_NAV_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as { source?: string };
      if (parsed?.source === "search") {
        sessionStorage.removeItem(CONTACTS_NAV_KEY);
      }
    }
  } catch {
    /* ignore */
  }
}

/** True when contact detail was opened from /contacts/search results. */
export function isContactsSearchNavActive(contactId: string): boolean {
  const nav = loadContactsSearchNav();
  if (!nav) return false;
  return nav.ids.includes(contactId);
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
