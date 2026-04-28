import Papa from "papaparse";

export const CRM_FIELD_IDS = [
  "first_name",
  "last_name",
  "father_name",
  "mother_name",
  "phone",
  "phone2",
  "landline",
  "email",
  "area",
  "municipality",
  "electoral_district",
  "toponym",
  "political_stance",
  "notes",
  "tags",
  "group",
  "priority",
  "call_status",
  "ignore",
] as const;
export type CrmFieldId = (typeof CRM_FIELD_IDS)[number];

const LABELS: Record<CrmFieldId, string> = {
  first_name: "Μικρό Όνομα",
  last_name: "Επίθετο",
  father_name: "Πατρώνυμο",
  mother_name: "Μητρώνυμο",
  phone: "Τηλέφωνο 1",
  phone2: "Τηλέφωνο 2",
  landline: "Σταθερό",
  email: "Email",
  area: "Περιοχή",
  municipality: "Δήμος",
  electoral_district: "Εκλογικό Διαμέρισμα",
  toponym: "Τοπωνύμιο",
  political_stance: "Πολιτική Τοποθέτηση",
  notes: "Σημειώσεις",
  tags: "Ετικέτες",
  group: "Ομάδα (όνομα)",
  priority: "Προτεραιότητα",
  call_status: "Κατάσταση κλήσης",
  ignore: "Αγνόησε",
};

export function crmFieldLabel(id: CrmFieldId): string {
  return LABELS[id];
}

export function onlyDigits(s: string): string {
  return s.replace(/\D/g, "");
}

export function normalizePhone(s: string): string | null {
  const d = onlyDigits(s);
  if (d.length < 8) return null;
  if (d.length === 10) return d;
  if (d.length === 12 && d.startsWith("30")) return d.slice(2);
  if (d.length > 10 && d.startsWith("00")) {
    const x = d.replace(/^0+/, "");
    if (x.length === 12 && x.startsWith("30")) return x.slice(2);
  }
  if (d.length === 11 && d.startsWith("0")) return d.slice(1);
  if (d.length >= 8) return d;
  return null;
}

const RULES: { field: CrmFieldId; patterns: RegExp[] }[] = [
  { field: "first_name", patterns: [/first[\s_]?name/i, /μικρ/i, /forename/i, /^name$/i, /όνομ|ονομ/i, /fname/i, /^onoma$/i, /^mikr/i, /^given/i] },
  { field: "last_name", patterns: [/last[\s_]?name/i, /eponymo|eπίθ|επίθετο|surname|family|επίθ|last/i] },
  {
    field: "father_name",
    patterns: [
      /patr/i,
      /πατρ/i,
      /father/i,
      /του πατέρα/i,
      /patronym/i,
    ],
  },
  {
    field: "mother_name",
    patterns: [
      /m[ée]t[r]?/i,
      /μητρ/i,
      /mother/i,
      /μητέρ/i,
      /μητρώνυμο/i,
    ],
  },
  { field: "phone2", patterns: [/phone2|τηλ2|κινητό 2|δεύτερο/i] },
  { field: "phone", patterns: [/thl|tilef|til|kinito|kιν|miso|misis|phone|mobile|κιν|αριθμ|τηλ/i, /^tel/i, /τηλέφωνο 1/i, /^phone1$/i] },
  { field: "landline", patterns: [/landline|σταθερ|σταθερό|stather/i] },
  { field: "email", patterns: [/e-?mail|ηλεκτ|mail|ημαιλ/i] },
  { field: "area", patterns: [/perioch|περιοχ|region|locality|^area$/i] },
  { field: "municipality", patterns: [/^dimos$/i, /dήμ|δημ|δήμ|municip/i] },
  { field: "electoral_district", patterns: [/^ekl/i, /εκλογ|diam|διαμερ|εκλ\.? ?δ/i, /diam/] },
  { field: "toponym", patterns: [/toponym|topω|τοπων/i, /τόπος/i] },
  { field: "political_stance", patterns: [/πολιτ|polit|stances|stasis|ideol/i, /tάξη|taxi/] },
  { field: "notes", patterns: [/^note|^σημ|remarks|observ|σχόλ|παρα/i] },
  { field: "tags", patterns: [/ετικέτ|tags?|labels/i] },
  { field: "group", patterns: [/^ομάδα$|^omada$/i, /group(?!_id)/i] },
  { field: "priority", patterns: [/προτερ|priority/i] },
  { field: "call_status", patterns: [/κλήση|call_status|κατάσταση/i] },
];

export function suggestCrmField(headerRaw: string): CrmFieldId {
  const h = (headerRaw ?? "").trim();
  if (!h) return "ignore";
  const t = h.toLowerCase().normalize("NFC");
  for (const { field, patterns } of RULES) {
    for (const p of patterns) {
      p.lastIndex = 0;
      if (p.test(t) || p.test(h)) return field;
    }
  }
  if (/^69\d{8}/.test(onlyDigits(t)) || (/(phone|til|thl|υπ)/.test(t) && t.length < 20)) return "phone";
  return "ignore";
}

function emptyRow(o: Record<string, string | undefined>) {
  return !Object.values(o).some((v) => (v ?? "").toString().trim() !== "");
}

export type MappedRowForInsert = {
  first_name: string;
  last_name: string;
  father_name: string | null;
  mother_name: string | null;
  phone: string;
  phone2: string | null;
  landline: string | null;
  email: string | null;
  area: string | null;
  municipality: string | null;
  electoral_district: string | null;
  toponym: string | null;
  political_stance: string | null;
  notes: string | null;
  tags: string[] | null;
  group: string | null;
  call_status: "Pending" | "Positive" | "Negative" | "No Answer";
  priority: "High" | "Medium" | "Low";
};

type Acc = Partial<Record<Exclude<CrmFieldId, "ignore">, string>>;

function buildAcc(raw: Record<string, string>, mapping: Record<string, CrmFieldId>) {
  const acc: Acc = {};
  for (const [h, v] of Object.entries(raw)) {
    const key = mapping[h] ?? "ignore";
    if (key === "ignore") continue;
    const t = (v ?? "").toString().trim();
    if (!t) continue;
    if (key === "phone" || key === "phone2" || key === "landline") {
      acc[key] = t;
      continue;
    }
    const cur = (acc as Record<string, string>)[key] ?? "";
    (acc as Record<string, string>)[key] = cur ? `${cur} ${t}` : t;
  }
  return acc;
}

function pickStr(acc: Acc, f: keyof Acc): string {
  const s = (acc as Record<string, string | undefined>)[f];
  return s == null ? "" : String(s).trim();
}

function parseCallStatus(s: string): "Pending" | "Positive" | "Negative" | "No Answer" | null {
  const u = s.trim().toLowerCase();
  if (!u) return null;
  if (u === "pending" || u.includes("αναμον")) return "Pending";
  if (u === "positive" || u.includes("θετ")) return "Positive";
  if (u === "negative" || u.includes("αρνητ")) return "Negative";
  if (u.includes("no answer") || u.includes("δεν απαν")) return "No Answer";
  return null;
}

function parsePriority(s: string): "High" | "Medium" | "Low" | null {
  const u = s.trim().toLowerCase();
  if (!u) return null;
  if (u.includes("υψηλ") || u === "high") return "High";
  if (u.includes("χαμηλ") || u === "low") return "Low";
  if (u.includes("μεσ") || u === "medium") return "Medium";
  return null;
}

function parseTags(s: string): string[] | null {
  const t = s.trim();
  if (!t) return null;
  const parts = t
    .split(/[;,|]/)
    .map((x) => x.trim())
    .filter(Boolean);
  return parts.length ? parts : null;
}

function splitFullName(s: string): { first: string; last: string } {
  const t = s.trim();
  if (!t) return { first: "—", last: "—" };
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { first: parts[0] ?? "—", last: "—" };
  return { first: parts[0] ?? "—", last: parts.slice(1).join(" ") || "—" };
}

export function mapRowsToContacts(
  data: Record<string, string>[],
  mapping: Record<string, CrmFieldId>,
): { rows: MappedRowForInsert[]; skippedNoPhone: number; skippedEmpty: number } {
  let skippedNoPhone = 0;
  let skippedEmpty = 0;
  const out: MappedRowForInsert[] = [];
  for (const raw of data) {
    if (emptyRow(raw as Record<string, string>)) {
      skippedEmpty += 1;
      continue;
    }
    const acc = buildAcc(raw, mapping);
    let first = pickStr(acc, "first_name");
    let last = pickStr(acc, "last_name");
    if (!first && !last) {
      const n = pickStr(acc, "notes");
      if (n) {
        const sp = splitFullName(n);
        first = sp.first;
        last = sp.last;
      }
    }
    if (first && !last) last = "—";
    if (last && !first) first = "—";
    if (!first) first = "—";
    if (!last) last = "—";
    const phRaw = pickStr(acc, "phone");
    const d = onlyDigits(phRaw);
    const n = normalizePhone(phRaw) ?? (d.length >= 8 ? d : null);
    if (!n) {
      skippedNoPhone += 1;
      continue;
    }
    const fa = pickStr(acc, "father_name");
    const mo = pickStr(acc, "mother_name");
    const p2raw = pickStr(acc, "phone2");
    const landRaw = pickStr(acc, "landline");
    const p2d = normalizePhone(p2raw) ?? (onlyDigits(p2raw).length >= 8 ? onlyDigits(p2raw) : null);
    const landd = normalizePhone(landRaw) ?? (onlyDigits(landRaw).length >= 8 ? onlyDigits(landRaw) : null);
    const cs = parseCallStatus(pickStr(acc, "call_status"));
    const pr = parsePriority(pickStr(acc, "priority"));
    const tg = parseTags(pickStr(acc, "tags"));
    out.push({
      first_name: first,
      last_name: last,
      father_name: fa || null,
      mother_name: mo || null,
      phone: n,
      phone2: p2d,
      landline: landd,
      email: pickStr(acc, "email") || null,
      area: pickStr(acc, "area") || null,
      municipality: pickStr(acc, "municipality") || null,
      electoral_district: pickStr(acc, "electoral_district") || null,
      toponym: pickStr(acc, "toponym") || null,
      political_stance: pickStr(acc, "political_stance") || null,
      notes: pickStr(acc, "notes") || null,
      tags: tg,
      group: pickStr(acc, "group") || null,
      call_status: cs ?? "Pending",
      priority: pr ?? "Medium",
    });
  }
  return { rows: out, skippedNoPhone, skippedEmpty };
}

function finalize(p: Papa.ParseResult<Record<string, string>>): { data: Record<string, string>[]; fields: string[] } | null {
  const raw = (p.meta.fields ?? [])
    .map((f) => (f == null || String(f).trim() === "" ? null : String(f).trim()))
    .filter((f): f is string => f != null);
  if (raw.length === 0) return null;
  const data = (p.data as Record<string, string>[])
    .map((row) => {
      const o: Record<string, string> = {};
      for (const f of raw) {
        o[f] = String(row[f] ?? "");
      }
      return o;
    })
    .filter((row) => !emptyRow(row));
  return { data, fields: raw };
}

export function tryParseDelimited(text: string, opts?: { forceDelimiter?: string }): { data: Record<string, string>[]; fields: string[] } | null {
  if (!text.trim()) return null;
  const list = opts?.forceDelimiter ? [opts.forceDelimiter] : [",", ";", "\t", "|"];
  for (const d of list) {
    const p = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: "greedy", delimiter: d });
    const f = p.meta.fields?.filter((x) => (x ?? "").toString().trim() !== "") ?? [];
    if (f.length >= 1) {
      const o = finalize(p);
      if (o && o.data.length > 0) return o;
    }
  }
  if (!opts?.forceDelimiter) {
    const p2 = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: "greedy" });
    return finalize(p2);
  }
  return null;
}
