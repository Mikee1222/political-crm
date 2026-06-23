import { describe, expect, it } from "vitest";
import { parseLevel1RelationNames, splitRelatedPersonName } from "./import-relations-parse";

describe("parseLevel1RelationNames", () => {
  it("extracts comma-separated names from 1ο επίπεδο bracket", () => {
    const raw =
      "1ο επίπεδο[ΓΙΩΡΓΟΣ ΠΑΠΑΔΟΠΟΥΛΟΣ, ΜΑΡΙΑ ΚΩΝΣΤΑΝΤΙΝΟΥ] - 2ο επίπεδο[ΝΙΚΟΣ ΑΘΑΝΑΣΙΟΥ]";
    expect(parseLevel1RelationNames(raw)).toEqual([
      "ΓΙΩΡΓΟΣ ΠΑΠΑΔΟΠΟΥΛΟΣ",
      "ΜΑΡΙΑ ΚΩΝΣΤΑΝΤΙΝΟΥ",
    ]);
  });

  it("returns empty for missing bracket", () => {
    expect(parseLevel1RelationNames("χωρίς σχέσεις")).toEqual([]);
  });
});

describe("splitRelatedPersonName", () => {
  it("splits last token as surname", () => {
    expect(splitRelatedPersonName("ΓΙΩΡΓΟΣ ΠΑΠΑΔΟΠΟΥΛΟΣ")).toEqual({
      first_name: "ΓΙΩΡΓΟΣ",
      last_name: "ΠΑΠΑΔΟΠΟΥΛΟΣ",
    });
  });

  it("handles multi-word first names", () => {
    expect(splitRelatedPersonName("ΜΑΡΙΑ ΕΛΕΝΗ ΠΑΠΑ")).toEqual({
      first_name: "ΜΑΡΙΑ ΕΛΕΝΗ",
      last_name: "ΠΑΠΑ",
    });
  });

  it("returns null for single token", () => {
    expect(splitRelatedPersonName("ΜΟΝΟ")).toBeNull();
  });
});
