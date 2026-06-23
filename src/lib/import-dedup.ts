import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanPhone } from "@/lib/spreadsheet-import";

export type DuplicateMatchField = "phone" | "phone2" | "landline" | "name_father";

export type ImportContactRow = {
  first_name: string;
  last_name: string;
  phone: string;
  phone2?: string | null;
  landline?: string | null;
  father_name?: string | null;
};

export type DuplicateMatch = {
  row_index: number;
  contact_id: string;
  matched_field: DuplicateMatchField;
  matched_value: string;
  name_hint: string;
  existing_name: string;
};

const GREEK_ACCENT_MAP: [RegExp, string][] = [
  [/ά|α|Α/g, "α"],
  [/έ|ε|Ε/g, "ε"],
  [/ή|η|Η/g, "η"],
  [/ί|ι|Ι|ϊ|ΐ/g, "ι"],
  [/ό|ο|Ο/g, "ο"],
  [/ύ|υ|Υ|ϋ|ΰ/g, "υ"],
  [/ώ|ω|Ω/g, "ω"],
];

/** Normalize Greek text for exact name+father dedup. */
export function normalizeDedupText(s: string | null | undefined): string {
  let t = String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  for (const [re, rep] of GREEK_ACCENT_MAP) {
    t = t.replace(re, rep);
  }
  return t;
}

export function nameFatherKey(
  first: string,
  last: string,
  father: string | null | undefined,
): string {
  return `${normalizeDedupText(first)}|${normalizeDedupText(last)}|${normalizeDedupText(father ?? "")}`;
}

type IndexedContact = {
  id: string;
  first_name: string;
  last_name: string;
  father_name: string | null;
  phone: string | null;
  phone2: string | null;
  landline: string | null;
};

function collectPhones(row: ImportContactRow): string[] {
  const out: string[] = [];
  for (const raw of [row.phone, row.phone2, row.landline]) {
    const p = raw ? cleanPhone(raw) || String(raw).trim() : "";
    if (p) out.push(p);
  }
  return [...new Set(out)];
}

function registerPhone(
  map: Map<string, { contact: IndexedContact; field: DuplicateMatchField }>,
  phone: string,
  contact: IndexedContact,
  field: DuplicateMatchField,
) {
  if (!phone) return;
  if (!map.has(phone)) {
    map.set(phone, { contact, field });
  }
}

async function loadContactsByPhones(
  supabase: SupabaseClient,
  phones: string[],
): Promise<IndexedContact[]> {
  const found = new Map<string, IndexedContact>();
  for (let i = 0; i < phones.length; i += 80) {
    const chunk = phones.slice(i, i + 80);
    if (!chunk.length) continue;
    const quoted = chunk.map((p) => `"${p}"`).join(",");
    const { data } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, father_name, phone, phone2, landline")
      .or(`phone.in.(${quoted}),phone2.in.(${quoted}),landline.in.(${quoted})`);
    for (const row of data ?? []) {
      const c = row as IndexedContact;
      found.set(c.id, c);
    }
  }
  return [...found.values()];
}

async function loadContactsByNameFather(
  supabase: SupabaseClient,
  keys: { first_name: string; last_name: string; father_name: string | null }[],
): Promise<IndexedContact[]> {
  const found = new Map<string, IndexedContact>();
  for (const k of keys) {
    const fn = k.first_name.trim();
    const ln = k.last_name.trim();
    const fa = k.father_name?.trim() || null;
    if (!fn || !ln || !fa) continue;
    const q = supabase
      .from("contacts")
      .select("id, first_name, last_name, father_name, phone, phone2, landline")
      .ilike("first_name", fn)
      .ilike("last_name", ln)
      .ilike("father_name", fa)
      .limit(3);
    const { data } = await q;
    for (const row of data ?? []) {
      const c = row as IndexedContact;
      if (nameFatherKey(c.first_name, c.last_name, c.father_name) === nameFatherKey(fn, ln, fa)) {
        found.set(c.id, c);
      }
    }
  }
  return [...found.values()];
}

export async function buildImportDedupIndex(
  supabase: SupabaseClient,
  rows: ImportContactRow[],
): Promise<{
  byPhone: Map<string, { contact: IndexedContact; field: DuplicateMatchField }>;
  byNameFather: Map<string, IndexedContact>;
}> {
  const allPhones = [...new Set(rows.flatMap(collectPhones))];
  const nameFatherRows = rows
    .filter((r) => r.father_name?.trim() && r.first_name.trim() && r.last_name.trim())
    .map((r) => ({
      first_name: r.first_name.trim(),
      last_name: r.last_name.trim(),
      father_name: r.father_name?.trim() || null,
    }));
  const uniqueNameFather = [
    ...new Map(nameFatherRows.map((r) => [nameFatherKey(r.first_name, r.last_name, r.father_name), r])).values(),
  ];

  const [phoneContacts, nameContacts] = await Promise.all([
    loadContactsByPhones(supabase, allPhones),
    loadContactsByNameFather(supabase, uniqueNameFather),
  ]);

  const byPhone = new Map<string, { contact: IndexedContact; field: DuplicateMatchField }>();
  for (const c of phoneContacts) {
    if (c.phone) registerPhone(byPhone, cleanPhone(c.phone) || c.phone, c, "phone");
    if (c.phone2) registerPhone(byPhone, cleanPhone(c.phone2) || c.phone2, c, "phone2");
    if (c.landline) registerPhone(byPhone, cleanPhone(c.landline) || c.landline, c, "landline");
  }

  const byNameFather = new Map<string, IndexedContact>();
  for (const c of nameContacts) {
    byNameFather.set(nameFatherKey(c.first_name, c.last_name, c.father_name), c);
  }

  return { byPhone, byNameFather };
}

export function findDuplicateForRow(
  row: ImportContactRow,
  rowIndex: number,
  index: {
    byPhone: Map<string, { contact: IndexedContact; field: DuplicateMatchField }>;
    byNameFather: Map<string, IndexedContact>;
  },
): DuplicateMatch | null {
  for (const ph of collectPhones(row)) {
    const hit = index.byPhone.get(ph);
    if (hit) {
      return {
        row_index: rowIndex,
        contact_id: hit.contact.id,
        matched_field: hit.field,
        matched_value: ph,
        name_hint: [row.first_name, row.last_name].filter(Boolean).join(" "),
        existing_name: [hit.contact.first_name, hit.contact.last_name].filter(Boolean).join(" "),
      };
    }
  }
  const fa = row.father_name?.trim();
  if (fa && row.first_name.trim() && row.last_name.trim()) {
    const key = nameFatherKey(row.first_name, row.last_name, fa);
    const hit = index.byNameFather.get(key);
    if (hit) {
      return {
        row_index: rowIndex,
        contact_id: hit.id,
        matched_field: "name_father",
        matched_value: `${row.first_name} ${row.last_name} (${fa})`,
        name_hint: [row.first_name, row.last_name].filter(Boolean).join(" "),
        existing_name: [hit.first_name, hit.last_name].filter(Boolean).join(" "),
      };
    }
  }
  return null;
}

export async function findImportDuplicates(
  supabase: SupabaseClient,
  rows: ImportContactRow[],
): Promise<DuplicateMatch[]> {
  const index = await buildImportDedupIndex(supabase, rows);
  const dups: DuplicateMatch[] = [];
  for (let i = 0; i < rows.length; i++) {
    const dup = findDuplicateForRow(rows[i]!, i + 1, index);
    if (dup) dups.push(dup);
  }
  return dups;
}

export const DUPLICATE_FIELD_LABELS: Record<DuplicateMatchField, string> = {
  phone: "Κινητό",
  phone2: "Κινητό 2",
  landline: "Σταθερό",
  name_father: "Όνομα + πατρώνυμο",
};
