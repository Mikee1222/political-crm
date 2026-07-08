import { describe, expect, it } from "vitest";
import {
  contactCelebratesNameday,
  getNamesForDate,
  normalizeGreekName,
  resolveNamedayNamesForDay,
} from "./namedays";

describe("normalizeGreekName", () => {
  it("strips accents and final sigma", () => {
    expect(normalizeGreekName("Θεόφιλος")).toBe("θεοφιλοσ");
    expect(normalizeGreekName("Προκόπιος")).toBe("προκοπιοσ");
  });
});

describe("July 8 nameday calendar", () => {
  it("includes Θεόφιλος and Προκόπιος variants", () => {
    const names = getNamesForDate(7, 8);
    const norm = new Set(names.map(normalizeGreekName));
    expect(norm.has(normalizeGreekName("Θεόφιλος"))).toBe(true);
    expect(norm.has(normalizeGreekName("Προκόπιος"))).toBe(true);
    expect(norm.has(normalizeGreekName("Προκόπης"))).toBe(true);
  });
});

describe("resolveNamedayNamesForDay", () => {
  it("falls back to bundled calendar when DB is empty", () => {
    const names = resolveNamedayNamesForDay([], 7, 8);
    expect(names.some((n) => normalizeGreekName(n) === normalizeGreekName("Θεόφιλος"))).toBe(true);
  });

  it("expands variants from sparse DB rows", () => {
    const names = resolveNamedayNamesForDay(["Κωνσταντίνος"], 5, 21);
    expect(names.some((n) => normalizeGreekName(n) === normalizeGreekName("Κώστας"))).toBe(true);
  });
});

describe("contactCelebratesNameday", () => {
  const dayNames = getNamesForDate(7, 8);

  it("matches first_name accent-insensitively", () => {
    expect(contactCelebratesNameday("θεόφιλος", null, dayNames)).toBe(true);
    expect(contactCelebratesNameday("Θεοφιλος", null, dayNames)).toBe(true);
  });

  it("matches nickname", () => {
    expect(contactCelebratesNameday("Μαρία", "Προκόπης", dayNames)).toBe(true);
  });

  it("matches first token of multi-part given name", () => {
    expect(contactCelebratesNameday("Θεόφιλος Δημήτριος", null, dayNames)).toBe(true);
  });

  it("rejects unrelated names", () => {
    expect(contactCelebratesNameday("Γιώργος", "Γιώργος", dayNames)).toBe(false);
  });
});
