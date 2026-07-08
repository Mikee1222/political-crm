import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSearchSessionState,
  consumeSearchFreshIntent,
  loadSearchSessionState,
  markSearchFreshIntent,
  saveSearchSessionState,
  SEARCH_STATE_TTL_MS,
  urlHasRanSearch,
} from "@/lib/search-session-state";

const KEY = "test-search-state-v1";
const FRESH = "test-search:fresh";

function installMemorySessionStorage() {
  const store = new Map<string, string>();
  const mock: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
  vi.stubGlobal("sessionStorage", mock);
  vi.stubGlobal("window", {
    ...globalThis,
    sessionStorage: mock,
    dispatchEvent: () => true,
  });
}

describe("search-session-state", () => {
  beforeEach(() => {
    installMemorySessionStorage();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-08T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("saves and loads within TTL", () => {
    saveSearchSessionState(KEY, {
      filters: { q: "a" },
      page: 2,
      results: [{ id: "1" }],
      total: 10,
      scrollY: 120,
      urlQuery: "ran=1&page=2",
    });
    const loaded = loadSearchSessionState<{ q: string }, { id: string }>(KEY);
    expect(loaded).not.toBeNull();
    expect(loaded?.filters).toEqual({ q: "a" });
    expect(loaded?.page).toBe(2);
    expect(loaded?.results).toEqual([{ id: "1" }]);
    expect(loaded?.total).toBe(10);
    expect(loaded?.scrollY).toBe(120);
  });

  it("expires after TTL", () => {
    saveSearchSessionState(KEY, {
      filters: {},
      page: 1,
      results: [],
      total: 0,
      scrollY: 0,
    });
    vi.advanceTimersByTime(SEARCH_STATE_TTL_MS + 1);
    expect(loadSearchSessionState(KEY)).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it("clears explicitly", () => {
    saveSearchSessionState(KEY, {
      filters: {},
      page: 1,
      results: [{ id: "x" }],
      total: 1,
      scrollY: 0,
    });
    clearSearchSessionState(KEY);
    expect(loadSearchSessionState(KEY)).toBeNull();
  });

  it("mark/consume fresh intent", () => {
    expect(consumeSearchFreshIntent(FRESH)).toBe(false);
    markSearchFreshIntent(FRESH);
    expect(consumeSearchFreshIntent(FRESH)).toBe(true);
    expect(consumeSearchFreshIntent(FRESH)).toBe(false);
  });

  it("urlHasRanSearch", () => {
    expect(urlHasRanSearch("ran=1&page=2")).toBe(true);
    expect(urlHasRanSearch("page=2")).toBe(false);
  });
});
