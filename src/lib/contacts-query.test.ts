/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, expect, it, vi } from "vitest";
import { getDefaultContactFilters } from "@/lib/contacts-filters";
import {
  applyColumnContactFiltersToBuilder,
  canUseGroupColumnFastPath,
  canUseGroupNameSearchFastPath,
  canUseGroupOnlyFastPath,
  canUseNameColumnFastPath,
  canUseNameOnlyFuzzySearchPath,
  contactRowMatchesListFilters,
  fetchContactRowsInBatches,
  filterContactRowsByListFilters,
  groupRequiresInMemoryPipeline,
  hasNameColumnFilters,
  isGroupColumnOnlyFilter,
  isGroupOnlyFilter,
  isNameOnlyFilter,
  nameRequiresInMemoryPipeline,
  needsInMemoryContactListPipeline,
} from "@/lib/contacts-query";
import {
  fetchContactsByIncludeIdBatches,
  searchContactsByGroupsPaginated,
  searchContactsInGroups,
  searchContactsInGroupsFiltered,
} from "@/lib/contact-group-members";
import { contactFieldMatchesFuzzyName } from "@/lib/greek-fuzzy-name";

describe("contactFieldMatchesFuzzyName", () => {
  it("matches accent variants and maria cluster", () => {
    expect(contactFieldMatchesFuzzyName("Μαρία", "ΜΑΡΙΑ")).toBe(true);
    expect(contactFieldMatchesFuzzyName("ΜΑΡΙΑ", "μαρια")).toBe(true);
    expect(contactFieldMatchesFuzzyName("Μαρια", "ΜΑΡΙΑ")).toBe(true);
    expect(contactFieldMatchesFuzzyName("Γιώργος", "ΜΑΡΙΑ")).toBe(false);
  });
});

describe("hasNameColumnFilters", () => {
  it("detects first, last, and father name filters", () => {
    const base = getDefaultContactFilters();
    expect(hasNameColumnFilters(base)).toBe(false);
    expect(hasNameColumnFilters({ ...base, first_name: "ΜΑΡΙΑ" })).toBe(true);
    expect(hasNameColumnFilters({ ...base, last_name: "ΠΑΠ" })).toBe(true);
    expect(hasNameColumnFilters({ ...base, father_name: "ΝΙΚ" })).toBe(true);
    expect(hasNameColumnFilters({ ...base, search: "μαρια" })).toBe(false);
  });
});

describe("fetchContactRowsInBatches", () => {
  it("pages until a short final batch", async () => {
    const ranges: [number, number][] = [];
    let call = 0;
    const supabase = {
      from() {
        return {
          select() {
            const builder = {
              order() {
                return builder;
              },
              range(from: number, to: number) {
                ranges.push([from, to]);
                call += 1;
                const batchIndex = call - 1;
                if (batchIndex === 0) {
                  return Promise.resolve({
                    data: Array.from({ length: 1000 }, (_, i) => ({ id: `a-${i}` })),
                    error: null,
                  });
                }
                return Promise.resolve({
                  data: Array.from({ length: 181 }, (_, i) => ({ id: `b-${i}` })),
                  error: null,
                });
              },
            };
            return builder;
          },
        };
      },
    };

    const rows = await fetchContactRowsInBatches(supabase, "id", (q) => q, 1000);
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(rows).toHaveLength(1181);
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
        gender: "Γυναίκα",
        municipalities: ["Αθήνα"],
      }),
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
    expect(
      canUseGroupNameSearchFastPath({ ...base, first_name: "ΜΑΡΙΑ" }),
    ).toBe(false);
  });
});

describe("isNameOnlyFilter / canUseNameOnlyFuzzySearchPath", () => {
  it("matches only first/last name with no other filters", () => {
    const base = getDefaultContactFilters();
    expect(isNameOnlyFilter({ ...base, first_name: "ΜΑΡΙΑ" })).toBe(true);
    expect(isNameOnlyFilter({ ...base, last_name: "ΠΑΠ" })).toBe(true);
    expect(isNameOnlyFilter({ ...base, first_name: "ΜΑΡΙΑ", last_name: "ΠΑΠ" })).toBe(true);
    expect(isNameOnlyFilter({ ...base, first_name: "ΜΑΡΙΑ", gender: "Γυναίκα" })).toBe(false);
    expect(isNameOnlyFilter({ ...base, first_name: "ΜΑΡΙΑ", municipalities: ["Αθήνα"] })).toBe(
      false,
    );
    expect(isNameOnlyFilter({ ...base, group_ids: ["g1"], first_name: "ΜΑΡΙΑ" })).toBe(false);
    expect(canUseNameOnlyFuzzySearchPath({ ...base, first_name: "ΜΑΡΙΑ" })).toBe(true);
  });
});

describe("needsInMemoryContactListPipeline routing matrix", () => {
  const base = getDefaultContactFilters();
  const smallGroupIds = Array.from({ length: 10 }, (_, i) =>
    `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`,
  );
  const manyIds = Array.from({ length: 81 }, (_, i) =>
    `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`,
  );

  it("name only → dedicated fuzzy path (not in-memory pipeline)", () => {
    expect(needsInMemoryContactListPipeline({ ...base, first_name: "ΜΑΡΙΑ" }, null)).toBe(false);
    expect(canUseNameOnlyFuzzySearchPath({ ...base, first_name: "ΜΑΡΙΑ" })).toBe(true);
  });

  it("group only → paginated RPC fast path (not in-memory pipeline)", () => {
    expect(needsInMemoryContactListPipeline({ ...base, group_ids: ["g1"] }, smallGroupIds)).toBe(
      false,
    );
    expect(groupRequiresInMemoryPipeline({ ...base, group_ids: ["g1"] })).toBe(false);
    expect(isGroupOnlyFilter({ ...base, group_ids: ["g1"] })).toBe(true);
    expect(canUseGroupOnlyFastPath({ ...base, group_ids: ["g1"] })).toBe(true);
    expect(canUseGroupOnlyFastPath({ ...base, group_ids: ["g1"] }, smallGroupIds)).toBe(true);
    expect(canUseGroupOnlyFastPath({ ...base, group_ids: ["g1"] }, null)).toBe(false);
    expect(
      isGroupOnlyFilter({ ...base, group_ids: ["g1"], gender: "Άντρας" }),
    ).toBe(false);
  });

  it("name + group → fast path RPC (not in-memory)", () => {
    expect(
      needsInMemoryContactListPipeline(
        { ...base, group_ids: ["g1"], first_name: "ΜΑΡΙΑ" },
        null,
      ),
    ).toBe(false);
    expect(canUseGroupNameSearchFastPath({ ...base, group_ids: ["g1"], first_name: "ΜΑΡΙΑ" })).toBe(
      true,
    );
  });

  it("gender only, municipality only, toponym, call_status, political_stance → default DB", () => {
    expect(needsInMemoryContactListPipeline({ ...base, gender: "Άντρας" }, null)).toBe(false);
    expect(needsInMemoryContactListPipeline({ ...base, municipalities: ["Αθήνα"] }, null)).toBe(
      false,
    );
    expect(needsInMemoryContactListPipeline({ ...base, toponyms: ["Κέντρο"] }, null)).toBe(false);
    expect(needsInMemoryContactListPipeline({ ...base, call_status: "Positive" }, null)).toBe(
      false,
    );
    expect(
      needsInMemoryContactListPipeline({ ...base, political_stance: "Center" }, null),
    ).toBe(false);
    expect(
      needsInMemoryContactListPipeline(
        { ...base, gender: "Άντρας", municipalities: ["Αθήνα"] },
        null,
      ),
    ).toBe(false);
  });

  it("name + gender and name + municipality → name RPC + memory (not in-memory pipeline)", () => {
    const nameGender = { ...base, first_name: "ΜΑΡΙΑ", gender: "Γυναίκα" };
    const nameMuni = { ...base, first_name: "ΜΑΡΙΑ", municipalities: ["Αθήνα"] };
    expect(needsInMemoryContactListPipeline(nameGender, null)).toBe(false);
    expect(needsInMemoryContactListPipeline(nameMuni, null)).toBe(false);
    expect(canUseNameColumnFastPath(nameGender)).toBe(true);
    expect(canUseNameColumnFastPath(nameMuni)).toBe(true);
    expect(nameRequiresInMemoryPipeline(nameGender)).toBe(false);
  });

  it("group + gender and group + municipality → filtered group RPC (not in-memory)", () => {
    const groupGender = { ...base, group_ids: ["g1"], gender: "Άντρας" };
    const groupMuni = { ...base, group_ids: ["g1"], municipalities: ["Αθήνα"] };
    expect(needsInMemoryContactListPipeline(groupGender, smallGroupIds)).toBe(false);
    expect(needsInMemoryContactListPipeline(groupMuni, smallGroupIds)).toBe(false);
    expect(canUseGroupColumnFastPath(groupGender)).toBe(true);
    expect(canUseGroupColumnFastPath(groupMuni)).toBe(true);
    expect(isGroupColumnOnlyFilter(groupGender)).toBe(true);
    expect(groupRequiresInMemoryPipeline(groupGender)).toBe(false);
  });

  it("group + gender + priority → in-memory (unsupported RPC column)", () => {
    const combo = { ...base, group_ids: ["g1"], gender: "Άντρας", priority: "High" };
    expect(canUseGroupColumnFastPath(combo)).toBe(false);
    expect(needsInMemoryContactListPipeline(combo, smallGroupIds)).toBe(true);
  });

  it("group + name + gender + municipality → fast RPC (not in-memory)", () => {
    const combo = {
      ...base,
      group_ids: ["g1"],
      first_name: "ΜΑΡΙΑ",
      gender: "Γυναίκα",
      municipalities: ["Αθήνα"],
    };
    expect(needsInMemoryContactListPipeline(combo, null)).toBe(false);
    expect(canUseGroupNameSearchFastPath(combo)).toBe(true);
  });

  it("requires in-memory for search and large include lists", () => {
    expect(needsInMemoryContactListPipeline({ ...base, search: "μαρια" }, null)).toBe(true);
    expect(needsInMemoryContactListPipeline(base, manyIds)).toBe(true);
    expect(needsInMemoryContactListPipeline(base, manyIds.slice(0, 80))).toBe(false);
    const manyExcludeIds = Array.from({ length: 81 }, (_, i) =>
      `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`,
    );
    expect(needsInMemoryContactListPipeline(base, null, manyExcludeIds)).toBe(true);
    expect(needsInMemoryContactListPipeline(base, null, manyExcludeIds.slice(0, 80))).toBe(
      false,
    );
  });
});

describe("searchContactsByName", () => {
  it("calls search_contacts_by_name RPC with name params and paginates", async () => {
    const { searchContactsByName } = await import("@/lib/contacts-query");
    const page1 = Array.from({ length: 1000 }, (_, i) => ({
      id: String(i),
      first_name: "Μαρία",
      last_name: "Α",
    }));
    const page2 = [{ id: "1000", first_name: "Μαρία", last_name: "Β" }];
    const rpc = vi.fn().mockReturnValue({
      range: vi
        .fn()
        .mockResolvedValueOnce({ data: page1, error: null })
        .mockResolvedValueOnce({ data: page2, error: null }),
    });
    const supabase = { rpc };

    const rows = await searchContactsByName(supabase as never, { firstName: "ΜΑΡΙΑ" });

    expect(rpc).toHaveBeenCalledWith("search_contacts_by_name", {
      p_first_name: "ΜΑΡΙΑ",
      p_last_name: null,
      p_father_name: null,
    });
    expect(rows).toHaveLength(1001);
  });

  it("refines RPC rows with accent-insensitive fuzzy matching", async () => {
    const { searchContactsByName } = await import("@/lib/contacts-query");
    const rpc = vi.fn().mockReturnValue({
      range: vi.fn().mockResolvedValue({
        data: [
          { id: "1", first_name: "Μαρία", last_name: "Παπα", nickname: null, father_name: null },
          { id: "2", first_name: "Γιώργος", last_name: "Α", nickname: null, father_name: null },
        ],
        error: null,
      }),
    });
    const supabase = { rpc };

    const rows = await searchContactsByName(supabase as never, { firstName: "ΜΑΡΙΑ" });

    expect(rows.map((r) => r.id)).toEqual(["1"]);
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
