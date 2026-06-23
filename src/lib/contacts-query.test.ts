import { describe, expect, it } from "vitest";
import { getDefaultContactFilters } from "@/lib/contacts-filters";
import {
  applyColumnContactFiltersToBuilder,
  contactRowMatchesListFilters,
  filterContactRowsByListFilters,
} from "@/lib/contacts-query";
import { fetchContactsByIncludeIdBatches } from "@/lib/contact-group-members";

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
});
