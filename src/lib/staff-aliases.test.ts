import { describe, expect, it } from "vitest";
import { buildAliasToProfileMap, resolveAuthorName } from "@/lib/staff-aliases";

describe("resolveAuthorName", () => {
  const aliases = [
    {
      id: "1",
      profile_id: "p1",
      alias_name: "ΓΑΒΡΙΕΛΑ ΜΗΛΙΩΡΗ",
      profile_full_name: "Gavriela Miliori",
    },
  ];

  it("resolves known legacy alias to profile name", () => {
    expect(resolveAuthorName("ΓΑΒΡΙΕΛΑ ΜΗΛΙΩΡΗ", aliases)).toBe("Gavriela Miliori");
  });

  it("is case-insensitive", () => {
    expect(resolveAuthorName("γαβριελα μηλιωρη", aliases)).toBe("Gavriela Miliori");
  });

  it("returns original when no alias match", () => {
    expect(resolveAuthorName("Unknown Person", aliases)).toBe("Unknown Person");
  });

  it("returns empty-ish input unchanged", () => {
    expect(resolveAuthorName("  ", aliases)).toBe("  ");
  });
});

describe("buildAliasToProfileMap", () => {
  it("skips aliases without profile name", () => {
    const map = buildAliasToProfileMap([
      { id: "1", profile_id: "p1", alias_name: "LEGACY", profile_full_name: null },
    ]);
    expect(map.size).toBe(0);
  });
});
