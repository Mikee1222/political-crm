/**
 * Tiny module-level TTL cache for API route aggregates (counts, dashboards).
 * Process-local only — fine for Next.js route handlers in a single Node process.
 */

export type TtlCacheEntry<T> = {
  value: T;
  expiresAt: number;
};

export type TtlCacheHit<T> =
  | { hit: true; value: T; ageMs: number }
  | { hit: false; value?: undefined; ageMs?: undefined };

export function createTtlCache<T>(ttlMs: number) {
  let entry: TtlCacheEntry<T> | null = null;

  return {
    get(): TtlCacheHit<T> {
      if (!entry) return { hit: false };
      const now = Date.now();
      if (now >= entry.expiresAt) {
        entry = null;
        return { hit: false };
      }
      return { hit: true, value: entry.value, ageMs: ttlMs - (entry.expiresAt - now) };
    },
    set(value: T): T {
      entry = { value, expiresAt: Date.now() + ttlMs };
      return value;
    },
    clear(): void {
      entry = null;
    },
    peek(): TtlCacheEntry<T> | null {
      return entry;
    },
  };
}

/** Browser / shared Map keyed by string with TTL. */
const clientStore = new Map<string, TtlCacheEntry<unknown>>();

export function getClientTtlCache<T>(key: string): T | null {
  const entry = clientStore.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    clientStore.delete(key);
    return null;
  }
  return entry.value as T;
}

export function setClientTtlCache<T>(key: string, value: T, ttlMs: number): void {
  clientStore.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function invalidateClientTtlCache(prefixOrKey: string): void {
  if (clientStore.has(prefixOrKey)) {
    clientStore.delete(prefixOrKey);
  }
  for (const key of clientStore.keys()) {
    if (key.startsWith(prefixOrKey)) clientStore.delete(key);
  }
}
