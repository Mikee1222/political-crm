import { describe, expect, it } from "vitest";
import { buildGroupNameToIdMap } from "@/lib/contact-group-members";
import { applySavedFilterJson } from "@/lib/contacts-filters";

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
