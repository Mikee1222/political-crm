import { describe, expect, it } from "vitest";
import {
  CONTACT_RELATION_TYPES,
  DEFAULT_CONTACT_RELATION_TYPE,
  displayRelationTypeForViewer,
  inverseContactRelationType,
  normalizeRelationTypeForStorage,
} from "@/lib/contact-relation-types";

describe("contact-relation-types", () => {
  it("lists all 21 relationship options", () => {
    expect(CONTACT_RELATION_TYPES).toHaveLength(21);
    expect(DEFAULT_CONTACT_RELATION_TYPE).toBe("Αδερφός του/της");
    expect(CONTACT_RELATION_TYPES).toContain("Μητέρα του/της");
    expect(CONTACT_RELATION_TYPES).toContain("Κόρη του/της");
    expect(CONTACT_RELATION_TYPES).toContain("Γιαγιά του/της");
    expect(CONTACT_RELATION_TYPES).toContain("Ξάδερφος/η του/της");
    expect(CONTACT_RELATION_TYPES).toContain("Νύφη του/της");
  });

  it("inverts parent/child and employment relations", () => {
    expect(inverseContactRelationType("Πατέρας του/της")).toBe("Γιός του/της");
    expect(inverseContactRelationType("Γιός του/της")).toBe("Πατέρας του/της");
    expect(inverseContactRelationType("Μητέρα του/της")).toBe("Κόρη του/της");
    expect(inverseContactRelationType("Κόρη του/της")).toBe("Μητέρα του/της");
    expect(inverseContactRelationType("Εργάζεται στον/στην")).toBe("Έχει υπάλληλο τον/την");
    expect(inverseContactRelationType("Έχει υπάλληλο τον/την")).toBe("Εργάζεται στον/στην");
  });

  it("keeps symmetric relations unchanged", () => {
    expect(inverseContactRelationType("Σύζυγος με τον/την")).toBe("Σύζυγος με τον/την");
    expect(inverseContactRelationType("Γνωστός με τον/την")).toBe("Γνωστός με τον/την");
    expect(inverseContactRelationType("Ξάδερφος/η του/της")).toBe("Ξάδερφος/η του/της");
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
