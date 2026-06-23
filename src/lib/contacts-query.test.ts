/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, expect, it } from "vitest";
import { getDefaultContactFilters } from "@/lib/contacts-filters";
import {
  applyColumnContactFiltersToBuilder,
  canUseGroupNameSearchFastPath,
  contactRowMatchesListFilters,
  filterContactRowsByListFilters,
  needsInMemoryContactListPipeline,
} from "@/lib/contacts-query";
import { fetchContactsByIncludeIdBatches, searchContactsInGroups } from "@/lib/contact-group-members";
import { contactFieldMatchesFuzzyName } from "@/lib/greek-fuzzy-name";

describe("contactFieldMatchesFuzzyName", () => {
  it("matches accent variants and maria cluster", () => {
    expect(contactFieldMatchesFuzzyName("Μαρία", "ΜΑΡΙΑ")).toBe(true);
    expect(contactFieldMatchesFuzzyName("ΜΑΡΙΑ", "μαρια")).toBe(true);
    expect(contactFieldMatchesFuzzyName("Μαρια", "ΜΑΡΙΑ")).toBe(true);
    expect(contactFieldMatchesFuzzyName("Γιώργος", "ΜΑΡΙΑ")).toBe(false);
  });
});

describe("canUseGroupNameSearchFastPath", () => {
  it("enables RPC path for group + first/last name without search or father_name", () => {
    const base = getDefaultContactFilters();
    expect(canUseGroupNameSearchFastPath(base)).toBe(false);
    expect(
      canUseGroupNameSearchFastPath({ ...base, group_ids: ["g1"], first_name: "ΜΑΡΙΑ" }),
    ).toBe(true);
    expect(
      canUseGroupNameSearchFastPath({ ...base, group_id: "g1", last_name: "ΠΑΠ" }),
    ).toBe(true);
    expect(
      canUseGroupNameSearchFastPath({
        ...base,
        group_ids: ["g1"],
        first_name: "ΜΑΡΙΑ",
        search: "μαρια",
      }),
    ).toBe(false);
    expect(
      canUseGroupNameSearchFastPath({
        ...base,
        group_ids: ["g1"],
        first_name: "ΜΑΡΙΑ",
        father_name: "ΝΙΚ",
      }),
    ).toBe(false);
  });
});

describe("needsInMemoryContactListPipeline", () => {
  it("requires in-memory pipeline for name filters and large include lists", () => {
    const base = getDefaultContactFilters();
    expect(needsInMemoryContactListPipeline(base, null)).toBe(false);
    expect(needsInMemoryContactListPipeline({ ...base, first_name: "ΜΑΡΙΑ" }, null)).toBe(true);
    expect(needsInMemoryContactListPipeline({ ...base, search: "μαρια" }, null)).toBe(true);
    const smallGroupIds = Array.from({ length: 10 }, (_, i) =>
      `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`,
    );
    expect(needsInMemoryContactListPipeline({ ...base, first_name: "ΜΑΡΙΑ" }, smallGroupIds)).toBe(
      true,
    );
    expect(
      needsInMemoryContactListPipeline({ ...base, group_ids: ["g1"], first_name: "ΜΑΡΙΑ" }, null),
    ).toBe(false);
    const manyIds = Array.from({ length: 81 }, (_, i) =>
      `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`,
    );
    expect(needsInMemoryContactListPipeline(base, manyIds)).toBe(true);
    expect(needsInMemoryContactListPipeline(base, manyIds.slice(0, 80))).toBe(false);
  });
});

describe("contactRowMatchesListFilters", () => {
  const base = getDefaultContactFilters();

  it("matches municipality and gender with AND logic", () => {
    const f = { ...base, municipalities: ["Αθήνα"], gender: "Άντρας" };
    expect(
      contactRowMatchesListFilters(
        { id: "1", municipality: "Αθήνα", gender: "Άντρας" },
        f,
      ),
    ).toBe(true);
    expect(
      contactRowMatchesListFilters(
        { id: "2", municipality: "Αθήνα", gender: "Γυναίκα" },
        f,
      ),
    ).toBe(false);
    expect(
      contactRowMatchesListFilters(
        { id: "3", municipality: "Πάτρα", gender: "Άντρας" },
        f,
      ),
    ).toBe(false);
  });

  it("supports partial location matching", () => {
    const f = { ...base, municipalities: ["Αστακ"] };
    expect(
      contactRowMatchesListFilters(
        { id: "1", municipality: "Αστακός" },
        f,
        { partialLocation: true },
      ),
    ).toBe(true);
    expect(
      contactRowMatchesListFilters(
        { id: "2", municipality: "Αστακός" },
        f,
        { partialLocation: false },
      ),
    ).toBe(false);
  });

  it("filters rows in memory", () => {
    const f = { ...base, call_status: "Positive" };
    const rows = [
      { id: "a", call_status: "Positive" },
      { id: "b", call_status: "Negative" },
    ];
    expect(filterContactRowsByListFilters(rows, f).map((r) => r.id)).toEqual(["a"]);
  });

  it("matches first_name with fuzzy Greek logic", () => {
    const f = { ...base, first_name: "ΜΑΡΙΑ" };
    const rows = [
      { id: "a", first_name: "Μαρία" },
      { id: "b", first_name: "Γιώργος" },
    ];
    expect(filterContactRowsByListFilters(rows, f).map((r) => r.id)).toEqual(["a"]);
  });
});

describe("fetchContactsByIncludeIdBatches filter order", () => {
  it("applies column filters before id.in()", async () => {
    const order: string[] = [];
    const supabase = {
      from() {
        return {
          select() {
            const builder = {
              eq(..._: unknown[]) {
                order.push("eq");
                return builder;
              },
              ilike(..._: unknown[]) {
                order.push("ilike");
                return builder;
              },
              in(..._: unknown[]) {
                order.push("in");
                return Promise.resolve({
                  data: [{ id: "11111111-1111-1111-1111-111111111111", created_at: "2026-01-01" }],
                  error: null,
                });
              },
            };
            return builder;
          },
        };
      },
    };

    const f = getDefaultContactFilters();
    f.municipalities = ["Αθήνα"];

    await fetchContactsByIncludeIdBatches(
      supabase,
      ["11111111-1111-1111-1111-111111111111"],
      "id, municipality, created_at",
      (q) => applyColumnContactFiltersToBuilder(q, f, { partialLocation: true }),
    );

    expect(order).toEqual(["ilike", "in"]);
  });

  it("fetches every id chunk and merges results", async () => {
    const ids = Array.from({ length: 165 }, (_, i) =>
      `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`,
    );
    const fetchedChunks: string[][] = [];
    const supabase = {
      from() {
        return {
          select() {
            const builder = {
              eq(..._: unknown[]) {
                return builder;
              },
              in(_col: string, chunk: string[]) {
                fetchedChunks.push(chunk);
                const data = chunk.map((id, idx) => ({
                  id,
                  first_name: idx % 2 === 0 ? "Μαρία" : "Γιώργος",
                  created_at: `2026-01-${String((idx % 28) + 1).padStart(2, "0")}`,
                }));
                return Promise.resolve({ data, error: null });
              },
            };
            return builder;
          },
        };
      },
    };

    const f = getDefaultContactFilters();
    f.first_name = "ΜΑΡΙΑ";

    const rows = await fetchContactsByIncludeIdBatches(
      supabase,
      ids,
      "id, first_name, created_at",
      (q) =>
        applyColumnContactFiltersToBuilder(q, f, {
          partialLocation: true,
          skipNameColumnFilters: true,
        }),
    );

    expect(fetchedChunks).toHaveLength(3);
    expect(fetchedChunks[0]).toHaveLength(80);
    expect(fetchedChunks[1]).toHaveLength(80);
    expect(fetchedChunks[2]).toHaveLength(5);
    expect(rows).toHaveLength(165);
  });
});
