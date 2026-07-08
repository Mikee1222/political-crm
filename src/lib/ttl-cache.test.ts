import { describe, expect, it, beforeEach } from "vitest";
import {
  createTtlCache,
  getClientTtlCache,
  setClientTtlCache,
  invalidateClientTtlCache,
} from "@/lib/ttl-cache";

describe("createTtlCache", () => {
  it("misses then hits within TTL", () => {
    const cache = createTtlCache<number>(60_000);
    expect(cache.get().hit).toBe(false);
    cache.set(42);
    const hit = cache.get();
    expect(hit.hit).toBe(true);
    if (hit.hit) expect(hit.value).toBe(42);
  });

  it("expires after TTL", () => {
    const cache = createTtlCache<string>(1);
    cache.set("x");
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(cache.get().hit).toBe(false);
        resolve();
      }, 5);
    });
  });
});

describe("client ttl cache", () => {
  beforeEach(() => {
    invalidateClientTtlCache("test:");
  });

  it("stores and retrieves keyed values", () => {
    setClientTtlCache("test:a", { n: 1 }, 30_000);
    expect(getClientTtlCache<{ n: number }>("test:a")).toEqual({ n: 1 });
  });

  it("invalidates by prefix", () => {
    setClientTtlCache("test:a", 1, 30_000);
    setClientTtlCache("test:b", 2, 30_000);
    invalidateClientTtlCache("test:");
    expect(getClientTtlCache("test:a")).toBeNull();
    expect(getClientTtlCache("test:b")).toBeNull();
  });
});
