import { describe, expect, it } from "vitest";
import { buildAliasToProfileMap, formatUnlinkedLegacyNameLabel, resolveAuthorName } from "@/lib/staff-aliases";

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

  it("returns Άγνωστος for null or empty input", () => {
    expect(resolveAuthorName(null, aliases)).toBe("Άγνωστος");
    expect(resolveAuthorName("", aliases)).toBe("Άγνωστος");
    expect(resolveAuthorName("  ", aliases)).toBe("Άγνωστος");
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

describe("formatUnlinkedLegacyNameLabel", () => {
  it("formats name with note count", () => {
    expect(formatUnlinkedLegacyNameLabel({ name: "ΓΑΒΡΙΕΛΑ ΜΗΛΙΩΡΗ", usage_count: 4788 })).toBe(
      "ΓΑΒΡΙΕΛΑ ΜΗΛΙΩΡΗ (4788 σημειώσεις)",
    );
  });
});
