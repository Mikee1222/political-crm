import { normalizeGreekName, normalizePhoneForMatch } from "@/lib/duplicate-detection";

export const DECEASED_GROUP_NAME = "ΑΠΕΒΙΩΣΕ";
const DECEASED_GROUP_NORMALIZED = normalizeGreekName(DECEASED_GROUP_NAME);

export type ContactForAutoFlags = {
  phone?: string | null;
  phone2?: string | null;
  landline?: string | null;
  email?: string | null;
  is_dead?: boolean | null;
  /** Legacy / import alias for is_dead */
  dead?: boolean | null;
  contact_groups?: { name?: string | null } | null;
  all_groups?: { name?: string | null }[];
  group_names?: string[];
};

export type ContactAutoFlags = {
  noMobile: boolean;
  noLandline: boolean;
  noEmail: boolean;
  deceased: boolean;
};

function phoneFields(contact: ContactForAutoFlags): string[] {
  return [contact.phone, contact.phone2, contact.landline].filter(
    (p): p is string => typeof p === "string" && p.trim() !== "",
  );
}

/** National digits starting with 69 (mobile). */
export function contactHasGreekMobile(contact: ContactForAutoFlags): boolean {
  return phoneFields(contact).some((p) => normalizePhoneForMatch(p).startsWith("69"));
}

/** National digits starting with 2 (landline). */
export function contactHasGreekLandline(contact: ContactForAutoFlags): boolean {
  return phoneFields(contact).some((p) => normalizePhoneForMatch(p).startsWith("2"));
}

function collectGroupNames(contact: ContactForAutoFlags): string[] {
  if (contact.group_names?.length) return contact.group_names;
  const names: string[] = [];
  if (contact.all_groups?.length) {
    for (const g of contact.all_groups) {
      const n = g.name?.trim();
      if (n) names.push(n);
    }
  }
  const primary = contact.contact_groups?.name?.trim();
  if (primary) names.push(primary);
  return names;
}

export function contactInDeceasedGroup(contact: ContactForAutoFlags): boolean {
  return collectGroupNames(contact).some(
    (n) => normalizeGreekName(n) === DECEASED_GROUP_NORMALIZED,
  );
}

export function isContactDeceased(contact: ContactForAutoFlags): boolean {
  return Boolean(contact.is_dead || contact.dead) || contactInDeceasedGroup(contact);
}

/** Badges to show: each flag is true when the condition applies (show badge). */
export function getContactAutoFlags(contact: ContactForAutoFlags): ContactAutoFlags {
  return {
    noMobile: !contactHasGreekMobile(contact),
    noLandline: !contactHasGreekLandline(contact),
    noEmail: !String(contact.email ?? "").trim(),
    deceased: isContactDeceased(contact),
  };
}
