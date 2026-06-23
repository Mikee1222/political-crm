import { describe, expect, it } from "vitest";
import {
  isTrivialRelationsCell,
  parseLevel1RelationNames,
  splitRelatedPersonName,
} from "./import-relations-parse";

describe("isTrivialRelationsCell", () => {
  it("treats bare 1ο επίπεδο as trivial", () => {
    expect(isTrivialRelationsCell("1ο επίπεδο")).toBe(true);
    expect(isTrivialRelationsCell("  1ο επίπεδο  ")).toBe(true);
  });

  it("does not treat cells with names as trivial", () => {
    expect(isTrivialRelationsCell("1ο επίπεδοKONSTANTINOS GOULAS,  - 2ο επίπεδο")).toBe(false);
  });
});

describe("parseLevel1RelationNames", () => {
  it("extracts names from bracket format", () => {
    const raw =
      "1ο επίπεδο[ΓΙΩΡΓΟΣ ΠΑΠΑΔΟΠΟΥΛΟΣ, ΜΑΡΙΑ ΚΩΝΣΤΑΝΤΙΝΟΥ] - 2ο επίπεδο[ΝΙΚΟΣ ΑΘΑΝΑΣΙΟΥ]";
    expect(parseLevel1RelationNames(raw)).toEqual([
      "ΓΙΩΡΓΟΣ ΠΑΠΑΔΟΠΟΥΛΟΣ",
      "ΜΑΡΙΑ ΚΩΝΣΤΑΝΤΙΝΟΥ",
    ]);
  });

  it("extracts names from unbracketed export format", () => {
    expect(
      parseLevel1RelationNames("1ο επίπεδοKONSTANTINOS GOULAS,  - 2ο επίπεδο"),
    ).toEqual(["KONSTANTINOS GOULAS"]);
  });

  it("extracts multiple comma-separated names", () => {
    expect(
      parseLevel1RelationNames(
        "1ο επίπεδοΣΤΥΛΙΑΝΟΣ ΓΡΕΝΤΖΕΛΟΣ, ΔΗΜΗΤΡΗΣ ΓΡΕΝΤΖΕΛΟΣ,  - 2ο επίπεδο",
      ),
    ).toEqual(["ΣΤΥΛΙΑΝΟΣ ΓΡΕΝΤΖΕΛΟΣ", "ΔΗΜΗΤΡΗΣ ΓΡΕΝΤΖΕΛΟΣ"]);
  });

  it("returns empty for bare 1ο επίπεδο", () => {
    expect(parseLevel1RelationNames("1ο επίπεδο")).toEqual([]);
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
