import { extractGreekPhone10, greekTitleCaseWords, parseGreekPhoneFieldsFromText } from "@/lib/greek-contact-import";
import { callStatusLabel } from "@/lib/luxury-styles";

/** Maps normalized header aliases → CRM field keys. */
export const COLUMN_ALIASES: Record<string, string> = {
  ονομα: "first_name",
  name: "first_name",
  "first name": "first_name",
  firstname: "first_name",
  επιθετο: "last_name",
  επωνυμο: "last_name",
  lastname: "last_name",
  surname: "last_name",
  "last name": "last_name",
  ονοματεπωνυμο: "full_name",
  fullname: "full_name",
  "full name": "full_name",
  πατρωνυμο: "father_name",
  πατερας: "father_name",
  μητρωνυμο: "mother_name",
  μητερα: "mother_name",
  τηλεφωνο: "phone",
  τηλ: "phone",
  κινητο: "phone",
  mobile: "phone",
  cell: "phone",
  τηλ2: "phone2",
  κινητο2: "phone2",
  "δευτερο τηλ": "phone2",
  "δευτερο κινητο": "phone2",
  σταθερο: "landline",
  "σταθερο τηλ": "landline",
  δημος: "municipality",
  περιοχη: "area",
  πολη: "municipality",
  city: "municipality",
  τοπωνυμιο: "toponym",
  χωριο: "toponym",
  email: "email",
  ηλεκτρονικο: "email",
  mail: "email",
  φυλο: "gender",
  gender: "gender",
  ηλικια: "age",
  age: "age",
  "ετος γεννησης": "birth_year",
  χρονολογια: "birth_year",
  γενεθλια: "birthday",
  birthday: "birthday",
  σχολια: "notes",
  notes: "notes",
  παρατηρησεις: "notes",
  επαγγελμα: "occupation",
  profession: "occupation",
  job: "occupation",
  κατασταση: "call_status",
  status: "call_status",
  ομαδα: "group",
  group: "group",
  πολιτικη: "political_stance",
  "πολιτικη τοποθετηση": "political_stance",
  εκλογικη: "electoral_district",
  προτεραιοτητα: "priority",
  priority: "priority",
};

/** Greek column headers for contact export. */
export const GREEK_HEADERS: Record<string, string> = {
  contact_code: "Κωδικός",
  last_name: "Επώνυμο",
  first_name: "Όνομα",
  father_name: "Πατρώνυμο",
  mother_name: "Μητρώνυμο",
  phone: "Κινητό",
  phone2: "Κινητό 2",
  landline: "Σταθερό",
  email: "Email",
  area: "Περιοχή",
  municipality: "Δήμος",
  toponym: "Τοπωνύμιο",
  electoral_district: "Εκλογική Περιφέρεια",
  gender: "Φύλο",
  age: "Ηλικία",
  call_status: "Κατάσταση",
  priority: "Προτεραιότητα",
  political_stance: "Πολιτική Τοποθέτηση",
  notes: "Σημειώσεις",
  occupation: "Επάγγελμα",
  groups: "Ομάδες",
  tags: "Ετικέτες",
  birthday: "Γενέθλια",
  name_day: "Ονομαστική",
  created_at: "Ημ. Εισαγωγής",
};

export const DEFAULT_EXPORT_FIELDS = [
  "contact_code",
  "last_name",
  "first_name",
  "father_name",
  "phone",
  "phone2",
  "landline",
  "email",
  "municipality",
  "toponym",
  "gender",
  "call_status",
  "notes",
  "groups",
] as const;

const GREEK_ACCENT_MAP: [RegExp, string][] = [
  [/ά|α|Α/g, "α"],
  [/έ|ε|Ε/g, "ε"],
  [/ή|η|Η/g, "η"],
  [/ί|ι|Ι|ϊ|ΐ/g, "ι"],
  [/ό|ο|Ο/g, "ο"],
  [/ύ|υ|Υ|ϋ|ΰ/g, "υ"],
  [/ώ|ω|Ω/g, "ω"],
];

/** Normalize Greek header text for alias matching. */
export function normalizeGreekHeader(header: string): string {
  let s = header.toLowerCase().trim().replace(/\s+/g, " ");
  for (const [re, rep] of GREEK_ACCENT_MAP) {
    s = s.replace(re, rep);
  }
  return s.replace(/[^\w\sα-ω]/gi, " ").replace(/\s+/g, " ").trim();
}

/** Auto-detect column mapping from spreadsheet headers. */
export function detectColumns(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const usedFields = new Set<string>();

  for (const header of headers) {
    const normalized = normalizeGreekHeader(header);
    if (!normalized) continue;

    let field = COLUMN_ALIASES[normalized];
    if (!field) {
      for (const [alias, f] of Object.entries(COLUMN_ALIASES)) {
        if (normalized.includes(alias) || alias.includes(normalized)) {
          field = f;
          break;
        }
      }
    }
    if (field && field !== "ignore" && !usedFields.has(field)) {
      mapping[header] = field;
      usedFields.add(field);
    }
  }
  return mapping;
}

/**
 * Split full name — Greek CRM order: last token = given name (first_name), preceding = surname.
 */
export function splitFullName(fullName: string): { first_name: string; last_name: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first_name: "", last_name: "" };
  if (parts.length === 1) return { first_name: parts[0]!, last_name: "—" };
  return {
    first_name: parts[parts.length - 1]!,
    last_name: parts.slice(0, -1).join(" "),
  };
}

/** Clean and normalize a Greek phone number to 10-digit national format. */
export function cleanPhone(phone: unknown): string {
  if (phone == null) return "";
  const s = String(phone).trim();
  if (!s) return "";
  return extractGreekPhone10(s) ?? "";
}

/** Heuristic gender from Greek first name endings. */
export function detectGender(firstName: string): "Άντρας" | "Γυναίκα" | null {
  const name = firstName?.trim().toLocaleLowerCase("el-GR") || "";
  if (!name || name === "—") return null;
  const femaleEndings = ["α", "η", "ού", "ίνα", "ένη", "ούλα", "ίτα", "έλα", "ία", "ω"];
  const maleEndings = ["ος", "ης", "ας", "ιος", "εος", "ής"];
  if (femaleEndings.some((e) => name.endsWith(e))) return "Γυναίκα";
  if (maleEndings.some((e) => name.endsWith(e))) return "Άντρας";
  return null;
}

export function isValidGreekPhone10(phone: string | null | undefined): boolean {
  if (!phone) return false;
  return /^[26]\d{9}$/.test(phone);
}

export type ImportValidationSummary = {
  total: number;
  valid_phones: number;
  invalid_phones: number;
  missing_names: number;
  skip_no_phone: number;
  skip_incomplete_name: number;
};

export type ImportRowPreview = {
  index: number;
  first_name: string;
  last_name: string;
  phone: string;
  municipality?: string;
  status: "ok" | "no_phone" | "incomplete_name" | "invalid_phone";
};

/** Build preview rows and validation stats from raw spreadsheet rows. */
export function buildImportPreview(
  rows: Array<Record<string, unknown>>,
  mapping: Record<string, string>,
  options?: { contextMunicipality?: string },
): {
  work: Array<{ index1: number; payload: Record<string, unknown> | null; skip?: string }>;
  validation: ImportValidationSummary;
  sample: ImportRowPreview[];
} {
  const work: Array<{ index1: number; payload: Record<string, unknown> | null; skip?: string }> = [];
  let valid_phones = 0;
  let invalid_phones = 0;
  let missing_names = 0;
  let skip_no_phone = 0;
  let skip_incomplete_name = 0;
  const sample: ImportRowPreview[] = [];

  for (let i = 0; i < rows.length; i++) {
    const { payload, skip } = transformSpreadsheetRow(rows[i]!, mapping, options);
    work.push({ index1: i + 1, payload, skip });

    if (skip === "no_phone") {
      skip_no_phone += 1;
      if (sample.length < 5) {
        sample.push({
          index: i + 1,
          first_name: "",
          last_name: "",
          phone: "",
          status: "no_phone",
        });
      }
      continue;
    }
    if (skip === "incomplete_name") {
      skip_incomplete_name += 1;
      missing_names += 1;
      if (sample.length < 5) {
        sample.push({
          index: i + 1,
          first_name: String(payload?.first_name ?? ""),
          last_name: String(payload?.last_name ?? ""),
          phone: String(payload?.phone ?? ""),
          status: "incomplete_name",
        });
      }
      continue;
    }
    if (!payload) continue;

    const ph = String(payload.phone ?? "");
    if (isValidGreekPhone10(ph)) {
      valid_phones += 1;
    } else if (ph) {
      invalid_phones += 1;
    }
    if (!payload.first_name || !payload.last_name) missing_names += 1;

    if (sample.length < 5) {
      sample.push({
        index: i + 1,
        first_name: String(payload.first_name ?? ""),
        last_name: String(payload.last_name ?? ""),
        phone: ph,
        municipality: payload.municipality != null ? String(payload.municipality) : undefined,
        status: isValidGreekPhone10(ph) ? "ok" : ph ? "invalid_phone" : "no_phone",
      });
    }
  }

  return {
    work,
    validation: {
      total: rows.length,
      valid_phones,
      invalid_phones,
      missing_names,
      skip_no_phone,
      skip_incomplete_name,
    },
    sample,
  };
}

function cellStr(row: Record<string, unknown>, header: string): string {
  const k = header.trim();
  if (row[k] !== undefined && row[k] !== null) return String(row[k]).trim();
  const hit = Object.keys(row).find((x) => x.trim() === k);
  if (hit != null && row[hit] != null) return String(row[hit]).trim();
  return "";
}

const OPTIONAL_IMPORT_FIELDS = [
  "email",
  "municipality",
  "area",
  "toponym",
  "political_stance",
  "notes",
  "father_name",
  "mother_name",
  "occupation",
  "nickname",
  "gender",
  "group",
  "call_status",
  "priority",
  "birthday",
  "age",
] as const;

/**
 * Transform one spreadsheet row using column mapping (shared by preview + import).
 */
export function transformSpreadsheetRow(
  row: Record<string, unknown>,
  mapping: Record<string, string>,
  options?: { contextMunicipality?: string },
): { payload: Record<string, unknown> | null; skip?: "no_phone" | "incomplete_name" } {
  const acc: Record<string, string> = {};
  for (const [header, field] of Object.entries(mapping)) {
    if (!field || field === "ignore" || field === "skip") continue;
    const f = String(field).trim();
    const v = cellStr(row, header);
    if (f === "full_name") {
      const { first_name, last_name } = splitFullName(v);
      if (first_name && !acc.first_name) acc.first_name = first_name;
      if (last_name && !acc.last_name) acc.last_name = last_name;
    } else if (f === "phone" || f === "phone2" || f === "landline") {
      acc[f] = cleanPhone(v) || v.replace(/\s+/g, "");
    } else {
      acc[f] = v;
    }
  }

  const firstRaw = (acc.first_name ?? "").trim();
  const lastRaw = (acc.last_name ?? "").trim();
  const first_name = firstRaw ? greekTitleCaseWords(firstRaw) : "";
  const last_name = lastRaw ? (lastRaw === "—" ? "—" : greekTitleCaseWords(lastRaw)) : "";

  const phoneFields = parseGreekPhoneFieldsFromText(acc.phone || acc.phone2 || acc.landline);
  const phone = phoneFields.phone ?? cleanPhone(acc.phone);
  if (!phone) {
    return { payload: null, skip: "no_phone" };
  }
  if (!first_name || !last_name) {
    return { payload: null, skip: "incomplete_name" };
  }

  const body: Record<string, unknown> = {
    first_name,
    last_name,
    phone,
    call_status: acc.call_status?.trim() || "Pending",
    priority: acc.priority?.trim() || "Medium",
  };

  const phone2 = phoneFields.phone2 ?? (acc.phone2 ? cleanPhone(acc.phone2) : null);
  const landline = phoneFields.landline ?? (acc.landline ? cleanPhone(acc.landline) : null);
  if (phone2) body.phone2 = phone2;
  if (landline) body.landline = landline;

  const ctxPlace = options?.contextMunicipality?.trim();
  let muni = (acc.municipality ?? "").trim();
  let ar = (acc.area ?? "").trim();
  if (muni && !ar) ar = muni;
  if (ar && !muni) muni = ar;
  if (ctxPlace) {
    const p = greekTitleCaseWords(ctxPlace);
    if (!muni) muni = p;
    if (!ar) ar = p;
  }
  if (muni) muni = greekTitleCaseWords(muni);
  if (ar) ar = greekTitleCaseWords(ar);
  if (muni) body.municipality = muni;
  if (ar) body.area = ar;

  for (const k of OPTIONAL_IMPORT_FIELDS) {
    if (k === "municipality" || k === "area") continue;
    const v = acc[k];
    if (v == null || !String(v).trim()) continue;
    const t = String(v).trim();
    if (k === "gender") {
      body.gender = normalizeGenderValue(t);
    } else if (k === "email" || k === "notes" || k === "political_stance") {
      body[k] = t;
    } else if (k === "father_name" || k === "mother_name" || k === "occupation" || k === "toponym") {
      body[k] = greekTitleCaseWords(t);
    } else if (k === "age") {
      const n = parseInt(t, 10);
      if (Number.isFinite(n)) body.age = n;
    } else {
      body[k] = t;
    }
  }

  if (!body.gender && first_name) {
    const g = detectGender(first_name);
    if (g) body.gender = g;
  }

  if (ctxPlace) {
    const p = greekTitleCaseWords(ctxPlace);
    if (body.toponym == null || String(body.toponym).trim() === "") {
      body.toponym = p;
    }
  }

  return { payload: body };
}

function normalizeGenderValue(raw: string): string {
  const t = raw.toLocaleLowerCase("el-GR").trim();
  if (t === "male" || t === "m" || t === "ανδρας" || t === "άντρας" || t === "α") return "Άντρας";
  if (t === "female" || t === "f" || t === "γυναικα" || t === "γυναίκα" || t === "γ") return "Γυναίκα";
  if (raw === "Άντρας" || raw === "Γυναίκα") return raw;
  return raw;
}

export function localizeGenderForExport(gender: unknown): string {
  if (gender == null || gender === "") return "";
  const g = String(gender);
  if (g === "male" || g === "Άντρας") return "Άντρας";
  if (g === "female" || g === "Γυναίκα") return "Γυναίκα";
  return g;
}

export function formatExportCell(field: string, contact: Record<string, unknown>): string {
  if (field === "groups") {
    if (Array.isArray(contact.group_names) && contact.group_names.length) {
      return (contact.group_names as string[]).join("; ");
    }
    const g = contact.contact_groups;
    if (Array.isArray(g)) {
      return g.map((x) => (x as { name?: string }).name).filter(Boolean).join("; ");
    }
    if (g && typeof g === "object" && (g as { name?: string }).name) {
      return String((g as { name: string }).name);
    }
    return "";
  }
  if (field === "gender") return localizeGenderForExport(contact.gender);
  if (field === "call_status") return callStatusLabel(String(contact.call_status ?? ""));
  if (field === "created_at" && contact.created_at) {
    try {
      return new Date(String(contact.created_at)).toLocaleDateString("el-GR");
    } catch {
      return String(contact.created_at);
    }
  }
  const v = contact[field];
  if (v == null) return "";
  if (Array.isArray(v)) return v.join("; ");
  return String(v);
}

export function buildExportRows(
  contacts: Record<string, unknown>[],
  fields: string[],
): { headers: string[]; rows: string[][] } {
  const headers = fields.map((f) => GREEK_HEADERS[f] ?? f);
  const rows = contacts.map((c) => fields.map((field) => formatExportCell(field, c)));
  return { headers, rows };
}

const TEMPLATE_HEADERS = [
  "Όνομα",
  "Επώνυμο",
  "Πατρώνυμο",
  "Κινητό",
  "Κινητό 2",
  "Σταθερό",
  "Email",
  "Δήμος",
  "Περιοχή",
  "Τοπωνύμιο",
  "Φύλο",
  "Ηλικία",
  "Κατάσταση",
  "Ομάδα",
  "Σημειώσεις",
];

const TEMPLATE_EXAMPLES: string[][] = [
  ["Μαρία", "Παπαδοπούλου", "Γεώργιος", "6912345678", "", "2641023456", "maria@example.gr", "Αγρίνιο", "Αγρίνιο", "Αγρίνιο", "Γυναίκα", "45", "Pending", "ΕΚΛΟΓΕΣ 2023", "Σημείωση παράδειγμα"],
  ["Νίκος", "Κωνσταντίνου", "Δημήτριος", "6976543210", "", "", "nikos@example.gr", "Μεσολόγγι", "", "Μεσολόγγι", "Άντρας", "38", "Positive", "", ""],
  ["Ελένη", "Αθανασίου", "", "6987654321", "6934567890", "", "", "Ναύπακτος", "Ναύπακτος", "", "", "52", "", "Κλασσικές", ""],
];

const TEMPLATE_NOTES: string[][] = [
  ["ΟΔΗΓΙΕΣ ΕΙΣΑΓΩΓΗΣ"],
  ["Υποχρεωτικά: Όνομα, Επώνυμο, Κινητό (10 ψηφία, 69… ή σταθερό 2…)"] ,
  ["Προαιρετικά: όλες οι υπόλοιπες στήλες"],
  ["Κατάσταση: Pending | Positive | Negative | No Answer"],
  ["Φύλο: Άντρας | Γυναίκα (ή αφήστε κενό για αυτόματη εκτίμηση)"],
  ["Μπορείτε επίσης να χρησιμοποιήσετε μία στήλη «Ονοματεπώνυμο» — η Αλεξάνδρα θα το χωρίσει αυτόματα"],
];

/** Build import template as array-of-arrays for Excel/CSV export. */
export function buildImportTemplateAoa(includeExamples = true): { aoa: string[][]; sheetName: string } {
  const aoa: string[][] = [];
  aoa.push(...TEMPLATE_NOTES);
  aoa.push([]);
  aoa.push(TEMPLATE_HEADERS);
  if (includeExamples) {
    aoa.push(...TEMPLATE_EXAMPLES);
  }
  return { aoa, sheetName: "Πρότυπο Επαφών" };
}
