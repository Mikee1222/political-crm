/** Single source of truth for Σχετικά πρόσωπα relationship labels. */

export type ContactRelationTypeGroup = {
  label: string;
  options: readonly string[];
};

export const CONTACT_RELATION_TYPE_GROUPS = [
  {
    label: "ΙΣΧΥΡΕΣ ΣΧΕΣΕΙΣ ΠΡΟΣΩΠΩΝ",
    options: [
      "Αδερφός του/της",
      "Σύζυγος με τον/την",
      "Γιός του/της",
      "Πατέρας του/της",
      "Διαζευγμένος με τον/την",
    ],
  },
  {
    label: "ΧΑΛΑΡΕΣ ΣΧΕΣΕΙΣ ΠΡΟΣΩΠΩΝ",
    options: [
      "Παππούς του/της",
      "Εγγονός του/της",
      "Πεθερός του/της",
      "Γαμπρός του/της",
      "Ανηψιός του/της",
    ],
  },
  {
    label: "ΆΛΛΕΣ ΣΧΕΣΕΙΣ",
    options: [
      "Κουμπάρος του/της",
      "Στενός φίλος με τον/την",
      "Γνωστός με τον/την",
      "Συνεργάτης με τον/την",
      "Εργάζεται στον/στην",
      "Έχει υπάλληλο τον/την",
    ],
  },
] as const satisfies readonly ContactRelationTypeGroup[];

export const CONTACT_RELATION_TYPES = CONTACT_RELATION_TYPE_GROUPS.flatMap((g) => g.options);

export const DEFAULT_CONTACT_RELATION_TYPE = CONTACT_RELATION_TYPES[0]!;

/** Legacy values stored before the expanded relationship types. */
const LEGACY_RELATION_LABELS: Record<string, string> = {
  family: "Οικογένεια",
  colleague: "Συνάδελφος",
  friend: "Φίλος",
  other: "Άλλο",
};

/** Inverse map: label from contact_id_1 toward contact_id_2 → label from contact_id_2 toward contact_id_1. */
const INVERSE_RELATION_TYPE: Record<string, string> = {
  "Αδερφός του/της": "Αδερφός του/της",
  "Σύζυγος με τον/την": "Σύζυγος με τον/την",
  "Γιός του/της": "Πατέρας του/της",
  "Πατέρας του/της": "Γιός του/της",
  "Διαζευγμένος με τον/την": "Διαζευγμένος με τον/την",
  "Παππούς του/της": "Εγγονός του/της",
  "Εγγονός του/της": "Παππούς του/της",
  "Πεθερός του/της": "Γαμπρός του/της",
  "Γαμπρός του/της": "Πεθερός του/της",
  "Ανηψιός του/της": "Ανηψιός του/της",
  "Κουμπάρος του/της": "Κουμπάρος του/της",
  "Στενός φίλος με τον/την": "Στενός φίλος με τον/την",
  "Γνωστός με τον/την": "Γνωστός με τον/την",
  "Συνεργάτης με τον/την": "Συνεργάτης με τον/την",
  "Εργάζεται στον/στην": "Έχει υπάλληλο τον/την",
  "Έχει υπάλληλο τον/την": "Εργάζεται στον/στην",
};

export function isContactRelationType(value: string): boolean {
  return (CONTACT_RELATION_TYPES as readonly string[]).includes(value);
}

export function resolveRelationTypeLabel(stored: string | null | undefined): string {
  if (!stored) return "—";
  if (isContactRelationType(stored)) return stored;
  return LEGACY_RELATION_LABELS[stored] ?? stored;
}

export function inverseContactRelationType(label: string): string {
  if (INVERSE_RELATION_TYPE[label]) return INVERSE_RELATION_TYPE[label]!;
  return resolveRelationTypeLabel(label);
}

/**
 * Normalize a label chosen from `viewerContactId`'s perspective toward `relatedContactId`
 * into storage form: relation from contact_id_1 toward contact_id_2.
 */
export function normalizeRelationTypeForStorage(
  viewerContactId: string,
  relatedContactId: string,
  chosenLabel: string,
): string {
  const label = chosenLabel.trim() || DEFAULT_CONTACT_RELATION_TYPE;
  const contactId1 =
    viewerContactId < relatedContactId ? viewerContactId : relatedContactId;

  if (viewerContactId === contactId1) {
    return label;
  }
  return inverseContactRelationType(label);
}

/**
 * Display label for a viewer seeing a related contact.
 * `storedType` is always from contact_id_1's perspective toward contact_id_2.
 */
export function displayRelationTypeForViewer(
  storedType: string | null | undefined,
  viewerContactId: string,
  contactId1: string,
  contactId2: string,
): string {
  if (!storedType) return "—";
  const resolved = resolveRelationTypeLabel(storedType);
  if (!isContactRelationType(storedType)) {
    return resolved;
  }
  if (viewerContactId === contactId1) {
    return storedType;
  }
  if (viewerContactId === contactId2) {
    return inverseContactRelationType(storedType);
  }
  return resolved;
}
