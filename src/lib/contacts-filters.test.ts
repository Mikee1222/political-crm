import { describe, expect, it } from "vitest";
import { buildGroupNameToIdMap } from "@/lib/contact-group-members";
import {
  applySavedFilterJson,
  cloneContactListFilters,
  contactFiltersToExportParams,
  contactFiltersToSearchParams,
  getDefaultContactFilters,
  listSearchParamsToExportParams,
  searchParamsToFilters,
} from "@/lib/contacts-filters";

describe("applySavedFilterJson groups_exclude", () => {
  const invalidGroupId = "981ac496-08f8-4348-8200-ffee32df4651";
  const groupsByName = buildGroupNameToIdMap([
    { id: invalidGroupId, name: "ΜΗ ΕΓΚΥΡΟΣ ΑΡΙΘΜΟΣ" },
  ]);

  it("resolves groups_exclude accent-insensitively to group UUIDs", () => {
    const f = applySavedFilterJson(
      { groups_exclude: ["Μη έγκυρος αριθμός"] },
      groupsByName,
    );
    expect(f.exclude_group_ids).toEqual([invalidGroupId]);
    expect(f.group_ids).toEqual([]);
  });

  it("resolves exclude_group_ids accent-insensitively to group UUIDs", () => {
    const f = applySavedFilterJson(
      { exclude_group_ids: ["ΜΗ ΕΓΚΥΡΟΣ ΑΡΙΘΜΟΣ"] },
      groupsByName,
    );
    expect(f.exclude_group_ids).toEqual([invalidGroupId]);
  });
});

describe("contactFiltersToExportParams", () => {
  it("passes individual filter params like /api/contacts (filters=1 is apply flag)", () => {
    const f = {
      ...getDefaultContactFilters(),
      municipalities: ["ΔΗΜΟΣ ΑΓΡΙΝΙΟΥ", "ΔΗΜΟΣ ΑΘΗΝΑΙΩΝ"],
      group_ids: ["g-include-1", "g-include-2"],
      exclude_group_ids: ["g-exclude-1"],
    };
    const p = contactFiltersToExportParams(f);
    expect(p.get("filters")).toBe("1");
    expect(p.get("partial_location")).toBe("1");
    expect(p.get("municipalities")).toBe("ΔΗΜΟΣ ΑΓΡΙΝΙΟΥ,ΔΗΜΟΣ ΑΘΗΝΑΙΩΝ");
    expect(p.get("group_ids")).toBe("g-include-1,g-include-2");
    expect(p.get("exclude_group_ids")).toBe("g-exclude-1");
    expect(p.has("page")).toBe(false);

    const parsed = searchParamsToFilters(p, getDefaultContactFilters());
    expect(parsed.municipalities).toEqual(["ΔΗΜΟΣ ΑΓΡΙΝΙΟΥ", "ΔΗΜΟΣ ΑΘΗΝΑΙΩΝ"]);
    expect(parsed.group_ids).toEqual(["g-include-1", "g-include-2"]);
    expect(parsed.exclude_group_ids).toEqual(["g-exclude-1"]);
  });

  it("municipalities-only / group-only / combined round-trip", () => {
    const muniOnly = contactFiltersToExportParams({
      ...getDefaultContactFilters(),
      municipalities: ["ΔΗΜΟΣ ΑΓΡΙΝΙΟΥ"],
    });
    expect(muniOnly.get("municipalities")).toBe("ΔΗΜΟΣ ΑΓΡΙΝΙΟΥ");
    expect(muniOnly.get("group_ids")).toBeNull();

    const groupOnly = contactFiltersToExportParams({
      ...getDefaultContactFilters(),
      group_ids: ["g1"],
      exclude_group_ids: ["g2"],
    });
    expect(groupOnly.get("group_ids")).toBe("g1");
    expect(groupOnly.get("exclude_group_ids")).toBe("g2");
    expect(groupOnly.get("municipalities")).toBeNull();

    const combined = contactFiltersToExportParams({
      ...getDefaultContactFilters(),
      municipalities: ["ΔΗΜΟΣ ΑΓΡΙΝΙΟΥ"],
      group_ids: ["g1"],
    });
    expect(combined.get("municipalities")).toBe("ΔΗΜΟΣ ΑΓΡΙΝΙΟΥ");
    expect(combined.get("group_ids")).toBe("g1");
  });

  it("listSearchParamsToExportParams mirrors successful /api/contacts query", () => {
    const list = contactFiltersToSearchParams({
      ...getDefaultContactFilters(),
      municipalities: ["ΔΗΜΟΣ ΑΓΡΙΝΙΟΥ"],
      group_ids: ["g1"],
      page: "2",
    });
    list.set("page_size", "50");
    list.set("partial_location", "1");
    const exp = listSearchParamsToExportParams(list);
    expect(exp.get("filters")).toBe("1");
    expect(exp.get("partial_location")).toBe("1");
    expect(exp.get("municipalities")).toBe("ΔΗΜΟΣ ΑΓΡΙΝΙΟΥ");
    expect(exp.get("group_ids")).toBe("g1");
    expect(exp.has("page")).toBe(false);
    expect(exp.has("page_size")).toBe(false);
  });

  it("getDefaultContactFilters deep-clones array fields", () => {
    const a = getDefaultContactFilters();
    const b = getDefaultContactFilters();
    a.group_ids.push("x");
    a.municipalities.push("y");
    expect(b.group_ids).toEqual([]);
    expect(b.municipalities).toEqual([]);
    const c = cloneContactListFilters(a);
    c.group_ids.push("z");
    expect(a.group_ids).toEqual(["x"]);
  });
});
