import type { SupabaseClient } from "@supabase/supabase-js";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import type { Tool } from "@anthropic-ai/sdk/resources/messages/messages";
import Anthropic from "@anthropic-ai/sdk";
import Papa from "papaparse";
import { hasMinRole, type Role } from "@/lib/roles";
import type { UserProfile } from "@/lib/auth-helpers";
import { runIndexRangeWithConcurrency } from "@/lib/async-pool";
import { greekTitleCaseWords, parseGreekPhoneFieldsFromText } from "@/lib/greek-contact-import";

/** Fields allowed when merging spreadsheet row into existing contact (no phone change here). */
const ALEX_BULK_UPDATE_FIELDS = new Set<string>([
  "first_name",
  "last_name",
  "father_name",
  "mother_name",
  "email",
  "phone2",
  "landline",
  "age",
  "gender",
  "occupation",
  "nickname",
  "spouse_name",
  "municipality",
  "electoral_district",
  "toponym",
  "political_stance",
  "priority",
  "call_status",
  "notes",
  "area",
  "tags",
  "influence",
  "name_day",
  "birthday",
  "source",
]);

export type FindRow = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  call_status: string | null;
  contact_code?: string | null;
};

export const ALEX_TOOLS: Tool[] = [
  {
    name: "find_contacts",
    description:
      "Αναζήτηση επαφών. ΠΑΝΤΑ χρησιμοποιεί ασαφή/fuzzy αναζήτηση ονομάτων (tonos, Greek/Latin, ψευδώνυμο, κοινές παραλλαγές Γιάννης–Ιωάννης κ.λπ.): pass το κείμενο στο search. Φίλτρα: call_status, area, municipality, priority",
    input_schema: {
      type: "object" as const,
      properties: {
        search: { type: "string" as const, description: "Όρος αναζήτησης (όνομα, επίθετο, ψευδώνυμο, τηλέφωνο)" },
        call_status: { type: "string" as const, enum: ["Pending", "Positive", "Negative", "No Answer"] as const },
        area: { type: "string" as const },
        municipality: { type: "string" as const },
        priority: { type: "string" as const, enum: ["High", "Medium", "Low"] as const },
      },
    },
  },
  {
    name: "update_contact",
    description:
      "Πλήρης ενημέρωση πεδίων επαφής (απαιτεί δικαίωμα manager). Ένα objeto fields με μόνο τα πεδία προς αλλαγή. Εκτέλεση: PUT /api/contacts/[id]",
    input_schema: {
      type: "object" as const,
      properties: {
        contact_id: { type: "string" as const, description: "UUID επαφής" },
        fields: {
          type: "object" as const,
          description:
            "Κλειδιά: first_name, last_name, father_name, mother_name, phone, email, age, gender, occupation, nickname, spouse_name, municipality, electoral_district, toponym, political_stance, priority, call_status, notes, area, tags (array), influence (bool)",
        },
      },
      required: ["contact_id", "fields"],
    },
  },
  {
    name: "update_contact_status",
    description: "Αλλαγή status επαφής",
    input_schema: {
      type: "object" as const,
      properties: {
        contact_id: { type: "string" as const },
        status: { type: "string" as const, enum: ["Pending", "Positive", "Negative", "No Answer"] as const },
      },
      required: ["contact_id", "status"],
    },
  },
  {
    name: "add_task",
    description: "Προσθήκη νέου task",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string" as const },
        due_date: { type: "string" as const, description: "YYYY-MM-DD format" },
        contact_id: { type: "string" as const, description: "Optional contact ID" },
      },
      required: ["title"],
    },
  },
  {
    name: "create_request",
    description: "Δημιουργία νέου αιτήματος πολίτη",
    input_schema: {
      type: "object" as const,
      properties: {
        contact_id: { type: "string" as const },
        title: { type: "string" as const },
        category: { type: "string" as const, enum: ["Υγεία", "Εκπαίδευση", "Εργασία", "Υποδομές", "Άλλο"] as const },
        description: { type: "string" as const },
      },
      required: ["title", "category"],
    },
  },
  {
    name: "add_note",
    description: "Προσθήκη σημείωσης σε επαφή",
    input_schema: {
      type: "object" as const,
      properties: {
        contact_id: { type: "string" as const },
        note: { type: "string" as const },
      },
      required: ["contact_id", "note"],
    },
  },
  {
    name: "get_contact_details",
    description: "Λεπτομέρειες συγκεκριμένης επαφής",
    input_schema: {
      type: "object" as const,
      properties: {
        contact_id: { type: "string" as const },
      },
      required: ["contact_id"],
    },
  },
  {
    name: "get_stats",
    description: "Στατιστικά CRM — contacts, requests, tasks, campaigns",
    input_schema: {
      type: "object" as const,
      properties: {
        type: { type: "string" as const, enum: ["overview", "contacts", "requests", "tasks", "campaigns"] as const },
      },
    },
  },
  {
    name: "start_call",
    description: "Έναρξη outbound κλήσης σε επαφή μέσω Retell",
    input_schema: {
      type: "object" as const,
      properties: {
        contact_id: { type: "string" as const },
        contact_name: { type: "string" as const },
      },
      required: ["contact_id"],
    },
  },
  {
    name: "create_contact",
    description:
      "Δημιουργία νέας επαφής. Χρησιμοποίησε όταν κάποιος δίνει ονοματεπώνυμο και τηλέφωνο. Εκτέλεση: POST /api/contacts",
    input_schema: {
      type: "object" as const,
      properties: {
        first_name: { type: "string" as const },
        last_name: { type: "string" as const },
        phone: { type: "string" as const },
        municipality: { type: "string" as const },
        area: { type: "string" as const },
        political_stance: { type: "string" as const },
        notes: { type: "string" as const },
        email: { type: "string" as const },
        father_name: { type: "string" as const, description: "Πατρώνυμο" },
        mother_name: { type: "string" as const, description: "Μητρώνυμο" },
      },
      required: ["first_name", "last_name", "phone"],
    },
  },
  {
    name: "edit_contact",
    description:
      "Πλήρης επεξεργασία πεδίων επαφής (ίδιο με update_contact). Χρησιμοποίησε για οποιαδήποτε αλλαγή πεδίου. Εκτέλεση: PUT /api/contacts/[id]",
    input_schema: {
      type: "object" as const,
      properties: {
        contact_id: { type: "string" as const },
        fields: {
          type: "object" as const,
          description:
            "Κλειδιά: first_name, last_name, father_name, mother_name, phone, age, municipality, notes, call_status, political_stance, priority, nickname, spouse_name, occupation, email, area, name_day, …",
        },
      },
      required: ["contact_id", "fields"],
    },
  },
  {
    name: "read_pdf",
    description: "Ανάγνωση PDF ή κειμένου από URL· εξαγωγή κειμένου / σύνοψη. Input: url, question (προαιρετικό).",
    input_schema: {
      type: "object" as const,
      properties: {
        url: { type: "string" as const },
        question: { type: "string" as const },
      },
      required: ["url"],
    },
  },
  {
    name: "write_letter",
    description: "Σύνταξη τυπικής επιστολής (ελληνικά) προς δημόσιο φορέα. Input: recipient, subject, contact_name, issue, letter_type.",
    input_schema: {
      type: "object" as const,
      properties: {
        recipient: { type: "string" as const },
        subject: { type: "string" as const },
        contact_name: { type: "string" as const },
        issue: { type: "string" as const },
        letter_type: {
          type: "string" as const,
          enum: ["αίτηση", "καταγγελία", "ερώτημα", "ευχαριστήρια"] as const,
        },
      },
      required: ["recipient", "subject", "letter_type"],
    },
  },
  {
    name: "import_csv_data",
    description: "Εισαγωγή επαφών από raw CSV/δεδομένα με mapping στηλών σε πεδία CRM. Input: data (string), mapping object.",
    input_schema: {
      type: "object" as const,
      properties: {
        data: { type: "string" as const },
        mapping: { type: "object" as const, description: "Χάρτης: όνομα στήλης CSV → first_name, last_name, phone, ..." },
      },
      required: ["data", "mapping"],
    },
  },
  {
    name: "bulk_create_contacts",
    description:
      "Μαζική δημιουργία επαφών από αρχείο (Excel/CSV) μετά το mapping. Χρήση ΜΟΝΟ μετά επιβεβαίωση. Το mapping (στήλες αρχείου → πεδία CRM) υποχρεωτικό. " +
      "Οι πλήρεις γραμμές έρχονται αυτόματα από το συνημμένο. Μπορείς παραλείψεις το `rows` στο input. " +
      "Υποστηριζόμενα: first_name, last_name, full_name (ελληνική σειρά + Title Case), phone (κελί με πολλούς αριθμούς: 1ο κινητό 69…→phone, 2ο κινητό→phone2, 2… σταθερό→landline), context_municipality (τίτλος αρχείου/φύλλο → municipality+area+toponym όταν λείπουν), email, municipality, area, toponym, notes, political_stance, father_name, mother_name, occupation, ignore.",
    input_schema: {
      type: "object" as const,
      properties: {
        rows: {
          type: "array" as const,
          description: "Ήδη γνωστές γραμμές (object ανά σειρά) — αλλιώς κενό για συνημμένο",
          items: { type: "object" as const },
        },
        mapping: {
          type: "object" as const,
          description: "Πχ. { \"Ονοματεπώνυμο\": \"full_name\", \"Κινητό\": \"phone\" } — κλειδιά: κελί/στήλη όπως το αρχείο",
        },
        context_municipality: {
          type: "string" as const,
          description: "Τόπος από τίτλο/φύλλο (π.χ. Αστακός)· εφαρμόζεται σε municipality, area, toponym όταν λείπουν στις γραμμές",
        },
      },
      required: ["mapping"],
    },
  },
  {
    name: "search_contacts_advanced",
    description:
      "Προχωρημένη αναζήτηση επαφών με πολλαπλά φίλτρα. Input: filters (name, phone, municipality, area, call_status, priority, political_stance, age_min, age_max, tag), limit (προαιρετικό).",
    input_schema: {
      type: "object" as const,
      properties: {
        filters: { type: "object" as const },
        limit: { type: "number" as const },
      },
      required: ["filters"],
    },
  },
  {
    name: "get_all_contacts",
    description:
      "Λίστα επαφών για ανάλυση/αναφορά (manager). Έως 10.000 εγγραφές. Ίδια φίλτρα με search + limit. Χρησιμοποίησε αντί για μικρό find όταν θες πλήρη εικόνα.",
    input_schema: {
      type: "object" as const,
      properties: {
        filters: {
          type: "object" as const,
          description: "Ίδια με find: search, call_status, municipality, area, priority, tag, group_id, phone, political_stance, age_min, age_max",
        },
        limit: { type: "number" as const, description: "1–10000, default 2000" },
      },
    },
  },
  {
    name: "bulk_update_contacts",
    description:
      "Μαζική ενημέρωση: contact_ids (πίνακας UUID) + fields (object) — ίδια επιτρεπτά πεδία με update_contact. (manager only)",
    input_schema: {
      type: "object" as const,
      properties: {
        contact_ids: { type: "array" as const, items: { type: "string" as const } },
        fields: { type: "object" as const },
      },
      required: ["contact_ids", "fields"],
    },
  },
  {
    name: "bulk_delete_contacts",
    description:
      "Μαζική διαγραφή επαφών: είτε contact_ids είτε filters (ίδιο format με get_all). ΠΑΝΤΑ πρώτα user_confirmed: false — επιστρέφει preview· μετά user_confirmed: true μόνο αφού ο χρήστης απαντήσει Ναι/επιβεβαιώσει. Μπορεί «διέγραψε χωρίς τηλ.» = filters+λογική (προσοχή: το κύριο phone είναι υποχρεωτικό σχεδόν πάντα). (manager)",
    input_schema: {
      type: "object" as const,
      properties: {
        user_confirmed: { type: "boolean" as const, description: "Ψευδές = μόνο προεπισκόπηση" },
        contact_ids: { type: "array" as const, items: { type: "string" as const } },
        filters: { type: "object" as const, description: "Όπως get_all_contacts" },
      },
      required: ["user_confirmed"],
    },
  },
  {
    name: "smart_excel_import",
    description:
      "Έξυπνο import από γραμμές Excel/CSV: rows + mapping, προαιρετικό municipality, skip_duplicates (default true), update_existing (default false) — για διπλότυπα: ίδιο phone = υπάρχουσα επαφή. Αν update_existing=true, κάνει PATCH. Συνδυάζεται με συνημμένο: παράλειψε rows. Χρήση μετά mapping και επιβεβαίωση.",
    input_schema: {
      type: "object" as const,
      properties: {
        rows: { type: "array" as const, items: { type: "object" as const } },
        mapping: { type: "object" as const },
        context_municipality: { type: "string" as const },
        skip_duplicates: { type: "boolean" as const, description: "Προεπιλογή true" },
        update_existing: { type: "boolean" as const, description: "Default false" },
        duplicate_mode: {
          type: "string" as const,
          enum: ["ask_user" as const, "skip" as const, "update" as const],
          description: "ask_user: μόνον αναφορά διπλοτύπων χωρίς εισαγωγή· skip/update: ίδιο με τα flags",
        },
      },
      required: ["mapping"],
    },
  },
  {
    name: "save_memory",
    description: "Αποθήκευσε σημαντική πληροφορία για μελλοντική χρήση (προτιμήσεις, σημαντικά facts).",
    input_schema: {
      type: "object" as const,
      properties: {
        key: { type: "string" as const, description: "π.χ. user_preferences" },
        value: { type: "string" as const },
      },
      required: ["key", "value"],
    },
  },
  {
    name: "get_memories",
    description: "Φόρτωσε αποθηκευμένες πληροφορίες για αυτόν το χρήστη (ήδη συμπεριλαμβάνονται στο system prompt, αλλά μπορείς να το καλέσεις εάν χρειάζεται ανανέωση).",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "schedule_reminder",
    description:
      "Πρόσθεσε υπενθύμιση: δημιουργεί task με title = message και due_date από ημερομηνία. Προαιρετικό contact_id· αλλιώς χρησιμοποίησε την επαφή της τρέχουσας σελίδας. datetime σε ISO 8601.",
    input_schema: {
      type: "object" as const,
      properties: {
        message: { type: "string" as const },
        datetime: { type: "string" as const, description: "ISO 8601, π.χ. 2026-04-27T09:00:00" },
        contact_id: { type: "string" as const, description: "Προαιρετικό" },
      },
      required: ["message", "datetime"],
    },
  },
];

export type ToolContext = {
  supabase: SupabaseClient;
  forward: (path: string, init: RequestInit) => Promise<Response>;
  profile: UserProfile;
  role: Role;
  userId: string;
  /** Επαφή από /contacts/[id] — default για tools με contact_id */
  defaultContactId?: string | null;
  /** Πλήρεις γραμμές import από το τρέχον αίτημα (client attachment) */
  importRows?: Array<Record<string, unknown>>;
  /** Από sheet name / επισύναψη — ιδρύει περιοχή+δήμο όταν κενά στη γραμμή */
  importContextMunicipality?: string;
  onBulkProgress?: (current: number, total: number) => void;
};

function pickContactId(raw: unknown, ctx: ToolContext): string {
  const a = raw != null && String(raw).trim() ? String(raw).trim() : "";
  if (a) return a;
  return ctx.defaultContactId?.trim() ?? "";
}

function buildContactsQueryParams(input: {
  search?: string;
  call_status?: string;
  area?: string;
  municipality?: string;
  priority?: string;
}): string {
  const p = new URLSearchParams();
  if (input.search) p.set("search", input.search);
  if (input.call_status) p.set("call_status", input.call_status);
  if (input.area) p.set("area", input.area);
  if (input.municipality) p.set("municipality", input.municipality);
  if (input.priority) p.set("priority", input.priority);
  return p.toString();
}

const BULK_OPTIONAL_FIELDS = [
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
] as const;

function cellStr(row: Record<string, unknown>, header: string): string {
  const k = header.trim();
  if (row[k] !== undefined && row[k] !== null) return String(row[k]).trim();
  const hit = Object.keys(row).find((x) => x.trim() === k);
  if (hit != null && row[hit] != null) return String(row[hit]).trim();
  return "";
}

/**
 * mapping: column header from sheet → CRM field (first_name, last_name, full_name, phone, …).
 * full_name: last word → first_name, preceding → last_name (Greek order). Title Case for names.
 * Phone: multiple 69…/2… 10-digit numbers from one cell → phone, phone2, landline; context_municipality fills municipality, area, toponym when missing.
 */
export function mapSpreadsheetRowToContactPayload(
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
      const parts = v.split(/\s+/).filter(Boolean);
      if (parts.length === 0) {
        /* leave empty */
      } else if (parts.length === 1) {
        if (!acc.first_name) acc.first_name = parts[0] ?? "";
        if (!acc.last_name) acc.last_name = "—";
      } else {
        if (!acc.first_name) acc.first_name = parts[parts.length - 1] ?? "";
        if (!acc.last_name) acc.last_name = parts.slice(0, -1).join(" ");
      }
    } else {
      acc[f] = v;
    }
  }
  const firstRaw = (acc.first_name ?? "").trim();
  const lastRaw = (acc.last_name ?? "").trim();
  const first_name = firstRaw ? greekTitleCaseWords(firstRaw) : "";
  const last_name = lastRaw ? (lastRaw === "—" ? "—" : greekTitleCaseWords(lastRaw)) : "";

  const { phone, phone2, landline } = parseGreekPhoneFieldsFromText(acc.phone);
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
    call_status: "Pending",
    priority: "Medium",
  };
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
  if (muni && !ar) ar = muni;
  if (ar && !muni) muni = ar;
  if (muni) body.municipality = muni;
  if (ar) body.area = ar;

  for (const k of BULK_OPTIONAL_FIELDS) {
    if (k === "municipality" || k === "area") continue;
    const v = acc[k];
    if (v == null || !String(v).trim()) continue;
    const t = String(v).trim();
    if (k === "email" || k === "notes" || k === "political_stance") {
      body[k] = t;
    } else if (k === "father_name" || k === "mother_name" || k === "occupation" || k === "toponym") {
      body[k] = greekTitleCaseWords(t);
    } else {
      body[k] = t;
    }
  }
  if (ctxPlace) {
    const p = greekTitleCaseWords(ctxPlace);
    if (body.toponym == null || String(body.toponym).trim() === "") {
      body.toponym = p;
    }
  }
  if (acc.age) {
    const n = parseInt(String(acc.age), 10);
    if (Number.isFinite(n)) body.age = n;
  }
  return { payload: body };
}

function buildAdvancedContactFilters(f: Record<string, unknown>, extra?: { limit?: number }): string {
  const p = new URLSearchParams();
  if (f.search) p.set("search", String(f.search));
  if (f.name) p.set("name", String(f.name));
  if (f.phone) p.set("phone", String(f.phone));
  if (f.municipality) p.set("municipality", String(f.municipality));
  if (f.area) p.set("area", String(f.area));
  if (f.call_status) p.set("call_status", String(f.call_status));
  if (f.priority) p.set("priority", String(f.priority));
  if (f.political_stance) p.set("political_stance", String(f.political_stance));
  if (f.tag) p.set("tag", String(f.tag));
  if (f.group_id) p.set("group_id", String(f.group_id));
  if (f.age_min != null) p.set("age_min", String(f.age_min));
  if (f.age_max != null) p.set("age_max", String(f.age_max));
  if (extra?.limit != null) p.set("limit", String(extra.limit));
  return p.toString();
}

export type ToolRunResult = {
  /** String passed back to Anthropic as tool_result */
  content: string;
  findResults?: FindRow[];
  confirmCall?: { contact_id: string; name: string; phone: string };
  /** For UI "✓ Εκτελέστηκε" — false for start_call (χρειάζεται Ναι/Όχι) */
  executedToolName?: string;
  showExecutedTag?: boolean;
};

export async function runAlexTool(
  name: string,
  input: Record<string, unknown> | null | undefined,
  ctx: ToolContext,
): Promise<ToolRunResult> {
  const raw = input && typeof input === "object" ? input : {};
  const isMgr = hasMinRole(ctx.profile.role, "manager");
  const isCaller = ctx.profile.role === "caller";

  if (name === "find_contacts") {
    const i = {
      search: raw.search as string | undefined,
      call_status: raw.call_status as string | undefined,
      area: raw.area as string | undefined,
      municipality: raw.municipality as string | undefined,
      priority: raw.priority as string | undefined,
    };
    const q = buildContactsQueryParams(i);
    const r = await ctx.forward(`/api/contacts?${q}`, { method: "GET" });
    const j = (await r.json()) as { contacts?: FindRow[]; error?: string };
    if (!r.ok) {
      return { content: JSON.stringify({ error: j.error || "Σφάλμα αναζήτησης" }) };
    }
    const list = (j.contacts ?? []).slice(0, 10) as FindRow[];
    return {
      content: JSON.stringify({
        ok: true,
        count: list.length,
        contacts: list,
      }),
      findResults: list,
      executedToolName: "find_contacts",
    };
  }

  if (name === "update_contact" || name === "edit_contact") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο υπεύθυνοι (manager) μπορούν να ενημερώνουν επαφές" }) };
    }
    const contact_id = pickContactId(raw.contact_id, ctx);
    const fields = raw.fields;
    if (!contact_id || !fields || typeof fields !== "object" || Array.isArray(fields) || fields === null) {
      return { content: JSON.stringify({ error: "Χρειάζονται contact_id και fields (object)" }) };
    }
    const allow = new Set<string>([
      "first_name",
      "last_name",
      "phone",
      "phone2",
      "landline",
      "email",
      "age",
      "gender",
      "occupation",
      "nickname",
      "spouse_name",
      "municipality",
      "electoral_district",
      "toponym",
      "political_stance",
      "priority",
      "call_status",
      "notes",
      "area",
      "tags",
      "influence",
      "name_day",
      "father_name",
      "mother_name",
    ]);
    const body: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields as Record<string, unknown>)) {
      if (allow.has(k) && v !== undefined) {
        body[k] = v;
      }
    }
    if (Object.keys(body).length === 0) {
      return { content: JSON.stringify({ error: "Καθόλου επιτρεπτά πεδία" }) };
    }
    const r = await ctx.forward(`/api/contacts/${contact_id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await r.json()) as { error?: string; contact?: unknown };
    if (!r.ok) {
      return { content: JSON.stringify({ error: j.error || "Σφάλμα ενημέρωσης" }) };
    }
    return {
      content: JSON.stringify({
        ok: true,
        message: "Η επαφή ενημερώθηκε.",
        contact: j.contact,
      }),
      executedToolName: name === "edit_contact" ? "edit_contact" : "update_contact",
    };
  }

  if (name === "update_contact_status") {
    const contact_id = pickContactId(raw.contact_id, ctx);
    const status = String(raw.status ?? "");
    if (!contact_id || !status) {
      return { content: JSON.stringify({ error: "Άκυρα δεδομένα" }) };
    }
    if (isCaller) {
      const { data, error } = await ctx.supabase
        .from("contacts")
        .update({ call_status: status })
        .eq("id", contact_id)
        .select("id")
        .single();
      if (error) return { content: JSON.stringify({ error: error.message }) };
      return {
        content: JSON.stringify({ ok: true, message: "Η κατάσταση κλήσης ενημερώθηκε.", id: data?.id }),
        executedToolName: "update_contact_status",
      };
    }
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Δεν έχετε δικαίωμα" }) };
    }
    const { data, error } = await ctx.supabase
      .from("contacts")
      .update({ call_status: status })
      .eq("id", contact_id)
      .select("id")
      .single();
    if (error) return { content: JSON.stringify({ error: error.message }) };
    return {
      content: JSON.stringify({ ok: true, message: "Η κατάσταση ενημερώθηκε.", id: data?.id }),
      executedToolName: "update_contact_status",
    };
  }

  if (name === "add_task") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο manager" }) };
    }
    const title = String(raw.title ?? "").trim();
    const contact_id = pickContactId(raw.contact_id, ctx) || null;
    const due = raw.due_date != null && String(raw.due_date) !== "null" ? String(raw.due_date) : null;
    if (!title) {
      return { content: JSON.stringify({ error: "Κενό τίτλο" }) };
    }
    const { data, error } = await ctx.supabase
      .from("tasks")
      .insert({
        contact_id,
        title,
        due_date: due,
        completed: false,
      })
      .select("id")
      .single();
    if (error) {
      if (error.message.includes("null") || error.message.includes("violates")) {
        return {
          content: JSON.stringify({
            error:
              "Χρειάζεται επαφή (contact_id) ή άνοιγμα σελίδας επαφής, ή find_contacts. Γενικές εργασίες: ενημερώστε τη βάση (contact_id optional).",
            detail: error.message,
          }),
        };
      }
      return { content: JSON.stringify({ error: error.message }) };
    }
    return {
      content: JSON.stringify({ ok: true, message: "Η εργασία προστέθηκε.", id: data?.id }),
      executedToolName: "add_task",
    };
  }

  if (name === "create_request") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο manager" }) };
    }
    const contact_id = pickContactId(raw.contact_id, ctx);
    const title = String(raw.title ?? "").trim();
    const category = String(raw.category ?? "Άλλο");
    const description = raw.description != null ? String(raw.description) : null;
    if (!title) {
      return { content: JSON.stringify({ error: "Κενός τίτλος" }) };
    }
    if (!contact_id) {
      return {
        content: JSON.stringify({
          error: "Χρειάζεται contact_id. Χρησιμοποιήστε find_contacts και επιλέξτε UUID επαφής.",
        }),
      };
    }
    const r = await ctx.forward("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contact_id,
        title,
        category: category || "Άλλο",
        description,
        status: "Νέο",
      }),
    });
    const j = (await r.json()) as { error?: string; request?: unknown };
    if (!r.ok) {
      return { content: JSON.stringify({ error: j.error || "Σφάλμα" }) };
    }
    return {
      content: JSON.stringify({ ok: true, message: "Το αίτημα δημιουργήθηκε.", result: j.request }),
      executedToolName: "create_request",
    };
  }

  if (name === "add_note") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο manager" }) };
    }
    const contact_id = pickContactId(raw.contact_id, ctx);
    const note = String(raw.note ?? "").trim();
    if (!contact_id || !note) {
      return { content: JSON.stringify({ error: "Χρειάζονται contact_id και note" }) };
    }
    const { data: cur, error: e0 } = await ctx.supabase.from("contacts").select("notes").eq("id", contact_id).single();
    if (e0) {
      return { content: JSON.stringify({ error: e0.message }) };
    }
    const nextNote = [cur?.notes, note].filter(Boolean).join("\n\n");
    const { error: e1 } = await ctx.supabase.from("contacts").update({ notes: nextNote }).eq("id", contact_id);
    if (e1) {
      return { content: JSON.stringify({ error: e1.message }) };
    }
    return {
      content: JSON.stringify({ ok: true, message: "Η σημείωση αποθηκεύτηκε." }),
      executedToolName: "add_note",
    };
  }

  if (name === "get_contact_details") {
    const contact_id = pickContactId(raw.contact_id, ctx);
    if (!contact_id) {
      return { content: JSON.stringify({ error: "Χρειάζεται contact_id" }) };
    }
    const { data, error } = await ctx.supabase.from("contacts").select("*").eq("id", contact_id).maybeSingle();
    if (error) {
      return { content: JSON.stringify({ error: error.message }) };
    }
    if (!data) {
      return { content: JSON.stringify({ error: "Η επαφή δεν βρέθηκε" }) };
    }
    return { content: JSON.stringify({ ok: true, contact: data }), executedToolName: "get_contact_details" };
  }

  if (name === "get_stats") {
    const st = (raw.type as string) || "overview";
    const supa = ctx.supabase;

    const { count: totalContacts } = await supa.from("contacts").select("id", { count: "exact", head: true });
    const { data: stRows, error: stErr } = await supa.from("contacts").select("call_status");
    if (stErr) {
      return { content: JSON.stringify({ error: stErr.message }) };
    }
    const byStatus: Record<string, number> = {};
    for (const row of (stRows ?? []) as { call_status: string | null }[]) {
      const k = row.call_status || "Κενό";
      byStatus[k] = (byStatus[k] ?? 0) + 1;
    }
    const { count: openRequests } = await supa
      .from("requests")
      .select("id", { count: "exact", head: true })
      .in("status", ["Νέο", "Σε εξέλιξη"]);
    const { count: pendingTasks } = await supa
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("completed", false);
    const { count: totalRequests } = await supa.from("requests").select("id", { count: "exact", head: true });
    const { count: campaignsN } = await supa.from("campaigns").select("id", { count: "exact", head: true });
    const payload = {
      type: st,
      overview: {
        totalContacts: totalContacts ?? 0,
        byStatus,
        openRequests: openRequests ?? 0,
        totalRequests: totalRequests ?? 0,
        pendingTasks: pendingTasks ?? 0,
        campaigns: campaignsN ?? 0,
      },
    };
    return { content: JSON.stringify(payload), executedToolName: "get_stats" };
  }

  if (name === "start_call") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο manager μπορεί να ξεκινά κλήσεις" }) };
    }
    const contact_id = pickContactId(raw.contact_id, ctx);
    if (!contact_id) {
      return { content: JSON.stringify({ error: "Χρειάζεται contact_id (ή άνοιγμα σελίδας επαφής)" }) };
    }
    const cr = await ctx.forward(`/api/contacts/${contact_id}`, { method: "GET" });
    const j = (await cr.json()) as {
      contact?: { first_name: string; last_name: string; phone: string | null };
    };
    if (!cr.ok || !j.contact) {
      return { content: JSON.stringify({ error: "Η επαφή δεν βρέθηκε" }) };
    }
    const c = j.contact;
    const displayName = `${c.first_name} ${c.last_name}`.trim();
    const phone = c.phone || "—";
    return {
      content: JSON.stringify({
        ok: true,
        confirm_required: true,
        contact_id,
        name: displayName,
        phone,
        message: "Ζητήθηκε επιβεβαίωση — ο χρήστης θα δει κουμπιά Ναι/Όχι.",
      }),
      confirmCall: { contact_id, name: displayName, phone },
      showExecutedTag: false,
    };
  }

  if (name === "create_contact") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο manager" }) };
    }
    const first_name = String(raw.first_name ?? "").trim();
    const last_name = String(raw.last_name ?? "").trim();
    const phone = String(raw.phone ?? "").trim();
    if (!first_name || !last_name || !phone) {
      return { content: JSON.stringify({ error: "Υποχρεωτικά: first_name, last_name, phone" }) };
    }
    const body: Record<string, unknown> = { first_name, last_name, phone, call_status: "Pending", priority: "Medium" };
    for (const k of [
      "municipality",
      "area",
      "political_stance",
      "notes",
      "email",
      "father_name",
      "mother_name",
      "phone2",
      "landline",
    ] as const) {
      if (raw[k] != null && String(raw[k]).trim() !== "") body[k] = raw[k];
    }
    const r = await ctx.forward("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await r.json()) as { error?: string; contact?: unknown };
    if (!r.ok) {
      return { content: JSON.stringify({ error: j.error || "Αποτυχία" }) };
    }
    return {
      content: JSON.stringify({ ok: true, message: "Η επαφή δημιουργήθηκε.", contact: j.contact }),
      executedToolName: "create_contact",
    };
  }

  if (name === "read_pdf") {
    const url = String(raw.url ?? "");
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return { content: JSON.stringify({ error: "Χρειάζεται http(s) URL" }) };
    }
    const question = String(raw.question ?? "Σύνοψη");
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) {
      return { content: JSON.stringify({ error: `Λήψη απέτυχε: ${res.status}` }) };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const maxBytes = 8_000_000;
    if (buf.length > maxBytes) {
      return { content: JSON.stringify({ error: "Πολύ μεγάλο αρχείο" }) };
    }
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    let text = "";
    if (ct.includes("pdf") || url.toLowerCase().endsWith(".pdf")) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const pdfParse = require("pdf-parse") as (b: Buffer) => Promise<{ text?: string }>;
      const d = await pdfParse(buf);
      text = d.text ?? "";
    } else {
      text = buf.toString("utf8");
    }
    const trimmed = text.slice(0, 32_000);
    const key = process.env.ANTHROPIC_API_KEY;
    if (key) {
      const cl = new Anthropic({ apiKey: key });
      const msg = await cl.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `Κείμενο από αρχείο/URL (μπορεί ατελές):\n---\n${trimmed}\n---\n\nΕρώτημα: ${question}\n\nΣύντομη απάντηση στα ελληνικά. Αν δεν αρκεί το κείμενο, πες τι λείπει.`,
          },
        ],
      });
      const t = (msg.content[0] as { type: string; text?: string } | undefined)?.type === "text" ? (msg.content[0] as { text: string }).text : JSON.stringify(msg.content[0]);
      return { content: JSON.stringify({ ok: true, answer: t, excerpt_length: trimmed.length }), executedToolName: "read_pdf" };
    }
    return { content: JSON.stringify({ ok: true, text: trimmed, excerpt_length: trimmed.length }), executedToolName: "read_pdf" };
  }

  if (name === "write_letter") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο manager" }) };
    }
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      return { content: JSON.stringify({ error: "Λείπει ANTHROPIC_API_KEY" }) };
    }
    const recipient = String(raw.recipient ?? "");
    const subject = String(raw.subject ?? "");
    const letterType = String(raw.letter_type ?? "αίτηση");
    const contactName = raw.contact_name != null ? String(raw.contact_name) : "";
    const issue = raw.issue != null ? String(raw.issue) : "";
    if (!recipient || !subject) {
      return { content: JSON.stringify({ error: "Υποχρεωτικά recipient, subject" }) };
    }
    const cl = new Anthropic({ apiKey: key });
    const out = await cl.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2_000,
      messages: [
        {
          role: "user",
          content: `Έγγραψε επιστολή στα ελληνικά, επίσημο ύφος. Τύπος: ${letterType}. Προς: ${recipient}. Θέμα: ${subject}.\nΕπαφή αναφοράς: ${contactName || "—"}\nΖήτημα: ${issue || "—"}\nΧρήση τυπικού format (ημερομηνία, Χαιρετισμός, Σώμα, Υπογραφή «Κ. Καραγκούνη» placeholder).`,
        },
      ],
    });
    const letter =
      (out.content[0] as { type: string; text?: string } | undefined)?.type === "text"
        ? (out.content[0] as { text: string }).text
        : String(out.content[0] ?? "");
    return {
      content: JSON.stringify({ ok: true, letter, letter_type: letterType, recipient, subject }),
      executedToolName: "write_letter",
    };
  }

  if (name === "import_csv_data") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο manager" }) };
    }
    const dataStr = String(raw.data ?? "");
    const mapping = raw.mapping;
    if (!dataStr || !mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
      return { content: JSON.stringify({ error: "Χρειάζονται data και mapping (object)" }) };
    }
    const parsed = Papa.parse<Record<string, string>>(dataStr, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() });
    if (parsed.errors.length) {
      return { content: JSON.stringify({ error: "CSV: " + parsed.errors[0]?.message }) };
    }
    const map = mapping as Record<string, string>;
    const contacts: Array<{
      first_name: string;
      last_name: string;
      phone: string;
      email?: string | null;
      area?: string | null;
      municipality?: string | null;
      electoral_district?: string | null;
      toponym?: string | null;
      political_stance?: string | null;
      notes?: string | null;
    }> = [];
    for (const row of parsed.data) {
      const o: Record<string, string> = {};
      for (const [csvCol, crmField] of Object.entries(map)) {
        if (!crmField) continue;
        const v = row[csvCol] ?? row[csvCol.trim()];
        if (v != null) o[crmField] = String(v).trim();
      }
      const first_name = o.first_name;
      const last_name = o.last_name;
      const phone = o.phone;
      if (!first_name || !last_name || !phone) continue;
      contacts.push({
        first_name,
        last_name,
        phone,
        email: o.email || null,
        area: o.area || null,
        municipality: o.municipality || null,
        electoral_district: o.electoral_district || null,
        toponym: o.toponym || null,
        political_stance: o.political_stance || null,
        notes: o.notes || null,
      });
    }
    if (contacts.length === 0) {
      return { content: JSON.stringify({ error: "Δεν εξήχθησαν έγκυρες γραμμές" }) };
    }
    const r = await ctx.forward("/api/contacts/import-mapped", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contacts }),
    });
    const j = (await r.json()) as { inserted?: number; errors?: number; error?: string };
    if (!r.ok) {
      return { content: JSON.stringify({ error: j.error || "import-mapped" }) };
    }
    return {
      content: JSON.stringify({ ok: true, inserted: j.inserted, error_rows: j.errors, message: "Εισήχθησαν (ή επιχειρήθηκαν) οι εγγραφές." }),
      executedToolName: "import_csv_data",
    };
  }

  if (name === "bulk_create_contacts") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο manager" }) };
    }
    const mapping = raw.mapping;
    if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
      return { content: JSON.stringify({ error: "Χρειάζεται mapping (object): στήλη αρχείου → πεδίο CRM" }) };
    }
    const fromTool = typeof raw.context_municipality === "string" ? raw.context_municipality.trim() : "";
    const contextMunicipality = fromTool || ctx.importContextMunicipality;
    const mapObj = mapping as Record<string, string>;
    let rows: Array<Record<string, unknown>> = [];
    if (Array.isArray(raw.rows) && raw.rows.length > 0) {
      rows = raw.rows as Array<Record<string, unknown>>;
    } else if (ctx.importRows?.length) {
      rows = ctx.importRows;
    }
    if (rows.length === 0) {
      return {
        content: JSON.stringify({
          error:
            "Δεν βρέθηκαν γραμμές. Ζήτα από τον χρήστη να ξανα-ανεβάσει το αρχείο ή βεβαιώσου ότι το import είναι ακόμα ενεργό στο ίδιο αίτημα.",
        }),
      };
    }
    const list = rows;
    const totalRows = list.length;
    const ROW_BATCH = 100;
    const CONCURRENCY = 10;
    type Outcome = "created" | "skip_phone" | "skip_name" | "failed" | "other_skip";
    const perRow: Outcome[] = new Array<Outcome>(totalRows);
    const failed: { index: number; err: string }[] = [];
    for (let batchStart = 0; batchStart < totalRows; batchStart += ROW_BATCH) {
      const batchEnd = Math.min(batchStart + ROW_BATCH, totalRows);
      await runIndexRangeWithConcurrency(batchStart, batchEnd, CONCURRENCY, async (i) => {
        try {
          const { payload, skip } = mapSpreadsheetRowToContactPayload(list[i]!, mapObj, {
            contextMunicipality: contextMunicipality || undefined,
          });
          if (skip === "no_phone") {
            perRow[i] = "skip_phone";
            return;
          }
          if (skip === "incomplete_name") {
            perRow[i] = "skip_name";
            return;
          }
          if (!payload) {
            perRow[i] = "other_skip";
            return;
          }
          const r = await ctx.forward("/api/contacts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          if (!r.ok) {
            perRow[i] = "failed";
            failed.push({ index: i + 1, err: j.error || "POST" });
          } else {
            perRow[i] = "created";
          }
        } catch (e) {
          perRow[i] = "failed";
          failed.push({ index: i + 1, err: e instanceof Error ? e.message : "Σφάλμα" });
        } finally {
          ctx.onBulkProgress?.(i + 1, totalRows);
        }
      });
    }
    let created = 0;
    let skippedNoPhone = 0;
    let skippedName = 0;
    for (const o of perRow) {
      if (o === "created") created += 1;
      if (o === "skip_phone") skippedNoPhone += 1;
      if (o === "skip_name") skippedName += 1;
    }
    const parts = [
      `Δημιουργήθηκαν ${created} επαφές`,
      skippedNoPhone > 0 ? `${skippedNoPhone} παραλείφθηκαν (κενό/μη έγκυρο τηλέφωνο)` : null,
      skippedName > 0 ? `${skippedName} παραλείφθηκαν (ατελές ονοματεπώνυμο)` : null,
      failed.length > 0 ? `${failed.length} απέτυχαν: ${JSON.stringify(failed.slice(0, 5))}` : null,
    ].filter(Boolean);
    return {
      content: JSON.stringify({
        ok: true,
        created,
        skipped_no_phone: skippedNoPhone,
        skipped_incomplete_name: skippedName,
        failed,
        message: parts.join(" · "),
      }),
      executedToolName: "bulk_create_contacts",
    };
  }

  if (name === "search_contacts_advanced") {
    const fl = (raw.filters as Record<string, unknown>) || {};
    const lim = Math.min(100, Math.max(1, Number(raw.limit) || 25));
    const q = buildAdvancedContactFilters(fl, { limit: Math.min(12_000, lim * 4) });
    const r = await ctx.forward(`/api/contacts?${q}`, { method: "GET" });
    const j = (await r.json()) as { contacts?: FindRow[]; error?: string };
    if (!r.ok) {
      return { content: JSON.stringify({ error: j.error || "Σφάλμα" }) };
    }
    const list = (j.contacts ?? []).slice(0, lim) as FindRow[];
    return {
      content: JSON.stringify({ ok: true, count: list.length, contacts: list }),
      findResults: list,
      executedToolName: "search_contacts_advanced",
    };
  }

  if (name === "get_all_contacts") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο manager" }) };
    }
    const fl = (raw.filters as Record<string, unknown>) || {};
    const lim = Math.min(10_000, Math.max(1, Number(raw.limit) || 2000));
    const q = buildAdvancedContactFilters(fl, { limit: lim });
    const r = await ctx.forward(`/api/contacts?${q}`, { method: "GET" });
    const j = (await r.json()) as { contacts?: FindRow[]; error?: string };
    if (!r.ok) {
      return { content: JSON.stringify({ error: j.error || "Σφάλμα" }) };
    }
    const list = (j.contacts ?? []) as FindRow[];
    return {
      content: JSON.stringify({
        ok: true,
        count: list.length,
        contacts: list,
        note: list.length >= lim ? "Φτάσατε το όριο limit· στενέψτε φίλτρα αν χρειάζεται." : null,
      }),
      findResults: list.slice(0, 50),
      executedToolName: "get_all_contacts",
    };
  }

  if (name === "bulk_update_contacts") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο manager" }) };
    }
    const contact_ids = raw.contact_ids;
    const fields = raw.fields;
    if (!Array.isArray(contact_ids) || !fields || typeof fields !== "object" || Array.isArray(fields)) {
      return { content: JSON.stringify({ error: "Χρειάζονται contact_ids (array) και fields (object)" }) };
    }
    const r = await ctx.forward("/api/contacts/manager-bulk-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_ids, fields }),
    });
    const j = (await r.json().catch(() => ({}))) as { error?: string; ok?: boolean; updated?: number; failed?: number };
    if (!r.ok) {
      return { content: JSON.stringify({ error: j.error || "Σφάλμα" }) };
    }
    return {
      content: JSON.stringify({
        ok: true,
        updated: j.updated,
        failed: j.failed,
        sample_errors: (j as { sample_errors?: unknown }).sample_errors,
      }),
      executedToolName: "bulk_update_contacts",
    };
  }

  if (name === "bulk_delete_contacts") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο manager" }) };
    }
    const user_confirmed = raw.user_confirmed === true;
    const body: Record<string, unknown> = { user_confirmed };
    if (Array.isArray(raw.contact_ids) && raw.contact_ids.length > 0) {
      body.contact_ids = raw.contact_ids;
    }
    if (raw.filters && typeof raw.filters === "object" && !Array.isArray(raw.filters) && Object.keys(raw.filters as object).length > 0) {
      body.filters = raw.filters;
    }
    const hasIds = Array.isArray(raw.contact_ids) && raw.contact_ids.length > 0;
    const filt = raw.filters && typeof raw.filters === "object" && !Array.isArray(raw.filters) ? (raw.filters as Record<string, unknown>) : null;
    if (!hasIds && (!filt || Object.keys(filt).length === 0)) {
      return { content: JSON.stringify({ error: "Χρειάζονται contact_ids (μη κενά) ή filters με τουλάχιστον ένα κλειδί" }) };
    }
    const r = await ctx.forward("/api/contacts/manager-bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await r.json().catch(() => ({}))) as {
      error?: string;
      mode?: string;
      would_delete?: number;
      sample?: unknown[];
      deleted?: number;
      message?: string;
    };
    if (!r.ok) {
      return { content: JSON.stringify({ error: j.error || "Σφάλμα" }) };
    }
    if (j.mode === "preview") {
      return {
        content: JSON.stringify({
          ok: true,
          requires_user_confirmation: true,
          would_delete: j.would_delete,
          sample: j.sample,
          message: j.message,
        }),
        showExecutedTag: false,
        executedToolName: "bulk_delete_contacts",
      };
    }
    return {
      content: JSON.stringify({ ok: true, deleted: j.deleted }),
      executedToolName: "bulk_delete_contacts",
    };
  }

  if (name === "smart_excel_import") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο manager" }) };
    }
    const mapping = raw.mapping;
    if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
      return { content: JSON.stringify({ error: "Χρειάζεται mapping (object)" }) };
    }
    const fromTool = typeof raw.context_municipality === "string" ? raw.context_municipality.trim() : "";
    const contextMunicipality = fromTool || ctx.importContextMunicipality;
    const mapObj = mapping as Record<string, string>;
    let rows: Array<Record<string, unknown>> = [];
    if (Array.isArray(raw.rows) && raw.rows.length > 0) {
      rows = raw.rows as Array<Record<string, unknown>>;
    } else if (ctx.importRows?.length) {
      rows = ctx.importRows;
    }
    if (rows.length === 0) {
      return {
        content: JSON.stringify({
          error: "Χρειάζονται γραμμές (rows) ή ενεργό συνημμένο import.",
        }),
      };
    }
    const skip_dup = raw.skip_duplicates !== false;
    const update_ex = raw.update_existing === true;
    const duplicate_mode = (raw.duplicate_mode as string) || (update_ex ? "update" : skip_dup ? "skip" : "skip");
    const list = rows;
    const totalRows = list.length;
    const CONCURRENCY = 8;
    type RowWork = { index1: number; payload: Record<string, unknown> | null; skip?: string };
    const work: RowWork[] = new Array<RowWork>(totalRows);
    for (let i = 0; i < totalRows; i++) {
      const { payload, skip } = mapSpreadsheetRowToContactPayload(list[i]!, mapObj, {
        contextMunicipality: contextMunicipality || undefined,
      });
      if (skip === "no_phone") {
        work[i] = { index1: i + 1, payload: null, skip: "no_phone" };
      } else if (skip === "incomplete_name") {
        work[i] = { index1: i + 1, payload: null, skip: "incomplete_name" };
      } else if (!payload) {
        work[i] = { index1: i + 1, payload: null, skip: "other" };
      } else {
        work[i] = { index1: i + 1, payload };
      }
    }
    const phones = [
      ...new Set(
        work
          .map((w) => w.payload && typeof w.payload.phone === "string" ? w.payload.phone : null)
          .filter((x): x is string => Boolean(x)),
      ),
    ];
    const phoneToId = new Map<string, string>();
    for (let b = 0; b < phones.length; b += 120) {
      const part = phones.slice(b, b + 120);
      const { data: phRows } = await ctx.supabase.from("contacts").select("id, phone").in("phone", part);
      for (const pr of phRows ?? []) {
        if (pr.phone) phoneToId.set(String(pr.phone), String(pr.id));
      }
    }
    const dups: { row: number; phone: string; contact_id: string; name_hint?: string }[] = [];
    for (const w of work) {
      if (!w.payload) continue;
      const ph = String(w.payload.phone ?? "");
      const id = phoneToId.get(ph);
      if (id) {
        dups.push({
          row: w.index1,
          phone: ph,
          contact_id: id,
          name_hint: [w.payload.first_name, w.payload.last_name].filter(Boolean).join(" "),
        });
      }
    }
    if (duplicate_mode === "ask_user" && dups.length > 0) {
      return {
        content: JSON.stringify({
          ok: true,
          duplicate_count: dups.length,
          duplicates: dups,
          message:
            "Βρέθηκαν διπλότυπα (ίδιο phone). Ρώτα τον χρήστη: παράλειψη, ενημέρωση με νέα δεδομένα, ή μόνο λίστα. Ξανακάλεσε smart_excel_import με skip_duplicates / update_existing / duplicate_mode: skip|update αντίστοιχα.",
        }),
        showExecutedTag: false,
        executedToolName: "smart_excel_import",
      };
    }
    const failed: { index: number; err: string }[] = [];
    const outcome = new Array<string>(totalRows).fill("pending");
    await runIndexRangeWithConcurrency(0, totalRows, CONCURRENCY, async (i) => {
      const w = work[i]!;
      if (w.skip === "no_phone") {
        outcome[i] = "skip_no_phone";
        ctx.onBulkProgress?.(i + 1, totalRows);
        return;
      }
      if (w.skip === "incomplete_name") {
        outcome[i] = "skip_incomplete_name";
        ctx.onBulkProgress?.(i + 1, totalRows);
        return;
      }
      if (w.skip === "other" || !w.payload) {
        outcome[i] = "skip_other";
        ctx.onBulkProgress?.(i + 1, totalRows);
        return;
      }
      const pl = w.payload;
      const ph = String(pl.phone);
      const existing = phoneToId.get(ph);
      if (existing) {
        if (update_ex) {
          const body: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(pl)) {
            if (k === "phone") continue;
            if (ALEX_BULK_UPDATE_FIELDS.has(k) && v !== undefined) {
              body[k] = v;
            }
          }
          const r = await ctx.forward(`/api/contacts/${existing}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!r.ok) {
            const j = (await r.json().catch(() => ({}))) as { error?: string };
            failed.push({ index: w.index1, err: j.error || "PATCH" });
            outcome[i] = "failed";
          } else {
            outcome[i] = "updated";
          }
        } else if (skip_dup) {
          outcome[i] = "skipped_dup";
        } else {
          failed.push({ index: w.index1, err: "duplicate_phone" });
          outcome[i] = "failed";
        }
        ctx.onBulkProgress?.(i + 1, totalRows);
        return;
      }
      const r = await ctx.forward("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pl),
      });
      const postBody = (await r.text().catch(() => "")) || "{}";
      let jr: { contact?: { id?: string }; error?: string } = {};
      try {
        jr = JSON.parse(postBody) as { contact?: { id?: string }; error?: string };
      } catch {
        /* ignore */
      }
      if (!r.ok) {
        failed.push({ index: w.index1, err: jr.error || "POST" });
        outcome[i] = "failed";
      } else {
        if (jr.contact?.id) {
          phoneToId.set(ph, String(jr.contact.id));
        }
        outcome[i] = "created";
      }
      ctx.onBulkProgress?.(i + 1, totalRows);
    });
    const created = outcome.filter((o) => o === "created").length;
    const updated = outcome.filter((o) => o === "updated").length;
    const skipped = outcome.filter((o) => o === "skipped_dup" || o === "skip_other").length;
    const skip_no_phone = outcome.filter((o) => o === "skip_no_phone").length;
    const skip_name = outcome.filter((o) => o === "skip_incomplete_name").length;
    return {
      content: JSON.stringify({
        ok: true,
        created,
        updated,
        skipped,
        skipped_no_phone: skip_no_phone,
        skipped_incomplete_name: skip_name,
        failed,
        message: `Νέες: ${created}, ενημερώσεις: ${updated}, παραλείφθηκαν/άλλα: ${skipped} · αποτυχίες: ${failed.length}`,
      }),
      executedToolName: "smart_excel_import",
    };
  }

  if (name === "save_memory") {
    const key = String(raw.key ?? "").trim().slice(0, 200);
    const value = String(raw.value ?? "").trim().slice(0, 32_000);
    if (!key || !value) {
      return { content: JSON.stringify({ error: "Χρειάζονται key και value" }), showExecutedTag: false };
    }
    const { error } = await ctx.supabase.from("alexandra_memory").upsert(
      {
        user_id: ctx.userId,
        key,
        value,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,key" },
    );
    if (error) return { content: JSON.stringify({ error: error.message }), showExecutedTag: false };
    return {
      content: JSON.stringify({ ok: true, message: "Η μνήμη αποθηκεύτηκε." }),
      executedToolName: "save_memory",
    };
  }

  if (name === "get_memories") {
    const { data, error } = await ctx.supabase
      .from("alexandra_memory")
      .select("key, value, updated_at")
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) return { content: JSON.stringify({ error: error.message }), showExecutedTag: false };
    return {
      content: JSON.stringify({ ok: true, memories: data ?? [] }),
      executedToolName: "get_memories",
      showExecutedTag: false,
    };
  }

  if (name === "schedule_reminder") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο manager" }) };
    }
    const message = String(raw.message ?? "").trim();
    const dtStr = String(raw.datetime ?? "").trim();
    const contact_id = pickContactId(raw.contact_id, ctx) || null;
    if (!message || !dtStr) {
      return { content: JSON.stringify({ error: "Χρειάζονται message και datetime" }) };
    }
    const d = new Date(dtStr);
    if (!Number.isFinite(d.getTime())) {
      return { content: JSON.stringify({ error: "Άκυρη ημερομηνία/ώρα (χρησιμοποιήστε ISO 8601)" }) };
    }
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const due_date = `${y}-${m}-${day}`;
    const { data, error } = await ctx.supabase
      .from("tasks")
      .insert({
        contact_id,
        title: message,
        due_date,
        completed: false,
      })
      .select("id")
      .single();
    if (error) {
      return { content: JSON.stringify({ error: error.message }) };
    }
    return {
      content: JSON.stringify({
        ok: true,
        message: `Ρυθμίστηκε υπενθύμιση (εργασία) με ημ/νία ${due_date}.`,
        id: data?.id,
      }),
      executedToolName: "schedule_reminder",
    };
  }

  return { content: JSON.stringify({ error: "Άγνωστο tool" }) };
}

export type SystemPromptBuildOpts = {
  todayDate: string;
  pageContextBlock: string;
  memoriesBlock: string;
};

export function buildSystemPrompt({
  todayDate,
  pageContextBlock,
  memoriesBlock,
}: SystemPromptBuildOpts) {
  return `Είσαι η Αλεξάνδρα, η AI γραμματέας του βουλευτή Κώστα Καραγκούνη (Νέα Δημοκρατία, Αιτωλοακαρνανία).

ΤΑΥΤΟΤΗΤΑ:
Έμπειρη πολιτική γραμματέας — έξυπνη, αποφασιστική, αξιόπιστη.
Μιλάς ΠΑΝΤΑ Ελληνικά. Ποτέ Αγγλικά.
Είσαι σύντομη και συγκεκριμένη. Max 3 προτάσεις ανά απάντηση εκτός αν ζητηθεί περισσότερο.

ΓΝΩΣΗ CRM:
- contacts: first_name, last_name, phone, phone2, landline, municipality, area, toponym, call_status (Pending/Positive/Negative/No Answer), priority, political_stance, father_name, mother_name, notes, tags, group_id, nickname
- requests: title, description, category, status (Νέο/Σε εξέλιξη/Ολοκληρώθηκε/Απορρίφθηκε), assigned_to
- tasks: title, due_date, completed, contact_id
- campaigns: name, status, calls
- calls: outcome, duration_seconds, transferred_to_politician
- Duplicate = ίδιο phone
- contact_code: EP-000001

ΚΑΝΟΝΕΣ TOOLS:
- Χρησιμοποίησε tools ΑΜΕΣΩΣ χωρίς να ρωτάς άδεια για απλές ενέργειες
- Για διαγραφές/μαζικές ενέργειες: πες τι θα κάνεις και περίμενε "ναι"
- Μετά από κάθε tool: επιβεβαίωσε τι έγινε με συγκεκριμένα στοιχεία
- Αν tool αποτύχει: εξήγησε γιατί με συγκεκριμένο error message
- ΠΟΤΕ μην πεις "δεν μπορώ" — βρες πάντα τρόπο ή εξήγησε το τεχνικό εμπόδιο
- Αν είσαι στη σελίδα μιας επαφής, σε εργαλεία που δέχονται contact_id μπορείς να το παραλείψεις: θα χρησιμοποιηθεί αυτόματα η τρέχουσα επαφή.

EXCEL/CSV, διπλότυπα, μαζικές ενέργειες: ίδιο με την τεκμηρίωση (smart_excel_import, bulk_*, get_all_contacts).

ΣΗΜΕΡΑ: ${todayDate}
ΤΡΕΧΟΥΣΑ ΣΕΛΙΔΑ/ΠΛΗΡΟΦΟΡΙΕΣ:
${pageContextBlock}

ΑΠΟΘΗΚΕΥΜΕΝΗ ΜΝΗΜΗ (για προσωποποίηση — μην την επαναλέγεις αδικαιολόγητα):
${memoriesBlock}
`;
}

export function historyToClaude(
  history: { role: "user" | "assistant"; content: string }[],
): MessageParam[] {
  return history.map((h) => ({ role: h.role, content: h.content }));
}
