import { describe, expect, it } from "vitest";
import {
  CONTACT_RELATION_TYPES,
  DEFAULT_CONTACT_RELATION_TYPE,
  displayRelationTypeForViewer,
  inverseContactRelationType,
  normalizeRelationTypeForStorage,
} from "@/lib/contact-relation-types";

describe("contact-relation-types", () => {
  it("lists all 16 relationship options", () => {
    expect(CONTACT_RELATION_TYPES).toHaveLength(16);
    expect(DEFAULT_CONTACT_RELATION_TYPE).toBe("Αδερφός του/της");
  });

  it("inverts parent/child and employment relations", () => {
    expect(inverseContactRelationType("Πατέρας του/της")).toBe("Γιός του/της");
    expect(inverseContactRelationType("Γιός του/της")).toBe("Πατέρας του/της");
    expect(inverseContactRelationType("Εργάζεται στον/στην")).toBe("Έχει υπάλληλο τον/την");
    expect(inverseContactRelationType("Έχει υπάλληλο τον/την")).toBe("Εργάζεται στον/στην");
  });

  it("keeps symmetric relations unchanged", () => {
    expect(inverseContactRelationType("Σύζυγος με τον/την")).toBe("Σύζυγος με τον/την");
    expect(inverseContactRelationType("Γνωστός με τον/την")).toBe("Γνωστός με τον/την");
  });

  it("normalizes storage from contact_id_1 perspective", () => {
    const a = "00000000-0000-4000-8000-000000000001";
    const b = "00000000-0000-4000-8000-000000000002";

    expect(normalizeRelationTypeForStorage(a, b, "Πατέρας του/της")).toBe("Πατέρας του/της");
    expect(normalizeRelationTypeForStorage(b, a, "Πατέρας του/της")).toBe("Γιός του/της");
  });

  it("displays inverse label for the other contact", () => {
    const a = "00000000-0000-4000-8000-000000000001";
    const b = "00000000-0000-4000-8000-000000000002";

    expect(displayRelationTypeForViewer("Πατέρας του/της", a, a, b)).toBe("Πατέρας του/της");
    expect(displayRelationTypeForViewer("Πατέρας του/της", b, a, b)).toBe("Γιός του/της");
  });

  it("resolves legacy stored values", () => {
    const a = "00000000-0000-4000-8000-000000000001";
    const b = "00000000-0000-4000-8000-000000000002";

    expect(displayRelationTypeForViewer("family", a, a, b)).toBe("Οικογένεια");
    expect(displayRelationTypeForViewer("colleague", b, a, b)).toBe("Συνάδελφος");
  });
});
