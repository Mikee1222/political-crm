import { normalizeGreekHeader, splitFullName, cleanPhone } from "@/lib/spreadsheet-import";
import { greekTitleCaseWords } from "@/lib/greek-contact-import";
import { normalizeRequestStatus, REQUEST_STATUS_OPEN } from "@/lib/request-statuses";

export const REQUEST_COLUMN_ALIASES: Record<string, string> = {
  τιτλος: "title",
  title: "title",
  θεμα: "title",
  περιγραφη: "description",
  description: "description",
  κατηγορια: "category",
  category: "category",
  κατασταση: "status",
  status: "status",
  τηλεφωνο: "contact_phone",
  τηλ: "contact_phone",
  phone: "contact_phone",
  κινητο: "contact_phone",
  contact_phone: "contact_phone",
  ονομα: "contact_name",
  ονοματεπωνυμο: "contact_name",
  contact_name: "contact_name",
  full_name: "contact_name",
  σημειωσεις: "notes",
  notes: "notes",
  σχολια: "notes",
};

export type RequestImportRow = {
  title: string;
  description: string | null;
  category: string | null;
  status: string;
  contact_phone: string | null;
  contact_name: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  notes: string | null;
};

export function detectRequestColumns(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const used = new Set<string>();
  for (const header of headers) {
    const normalized = normalizeGreekHeader(header);
    if (!normalized) continue;
    let field = REQUEST_COLUMN_ALIASES[normalized];
    if (!field) {
      for (const [alias, f] of Object.entries(REQUEST_COLUMN_ALIASES)) {
        if (normalized.includes(alias) || alias.includes(normalized)) {
          field = f;
          break;
        }
      }
    }
    if (field && !used.has(field)) {
      mapping[header] = field;
      used.add(field);
    }
  }
  return mapping;
}

function cellStr(row: Record<string, unknown>, header: string): string {
  const k = header.trim();
  if (row[k] !== undefined && row[k] !== null) return String(row[k]).trim();
  const hit = Object.keys(row).find((x) => x.trim() === k);
  if (hit != null && row[hit] != null) return String(row[hit]).trim();
  return "";
}

export function transformRequestSpreadsheetRow(
  row: Record<string, unknown>,
  mapping: Record<string, string>,
): { payload: RequestImportRow | null; skip?: "no_title" | "no_contact_ref" } {
  const acc: Record<string, string> = {};
  for (const [header, field] of Object.entries(mapping)) {
    if (!field || field === "ignore") continue;
    const v = cellStr(row, header);
    if (v) acc[field] = v;
  }

  const title = (acc.title ?? "").trim();
  if (!title) return { payload: null, skip: "no_title" };

  const contact_phone = acc.contact_phone ? cleanPhone(acc.contact_phone) || acc.contact_phone : null;
  let contact_first_name: string | null = null;
  let contact_last_name: string | null = null;
  const contact_name = acc.contact_name?.trim() || null;
  if (contact_name) {
    const { first_name, last_name } = splitFullName(contact_name);
    contact_first_name = first_name || null;
    contact_last_name = last_name !== "—" ? last_name : null;
  }

  if (!contact_phone && !contact_first_name && !contact_last_name) {
    return { payload: null, skip: "no_contact_ref" };
  }

  const statusRaw = (acc.status ?? "").trim();
  const status = statusRaw ? normalizeRequestStatus(statusRaw) : REQUEST_STATUS_OPEN;

  return {
    payload: {
      title: greekTitleCaseWords(title),
      description: acc.description?.trim() || null,
      category: acc.category?.trim() || null,
      status,
      contact_phone,
      contact_name,
      contact_first_name: contact_first_name ? greekTitleCaseWords(contact_first_name) : null,
      contact_last_name: contact_last_name ? greekTitleCaseWords(contact_last_name) : null,
      notes: acc.notes?.trim() || null,
    },
  };
}
