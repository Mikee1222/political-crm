import type { SupabaseClient } from "@supabase/supabase-js";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import type { Tool } from "@anthropic-ai/sdk/resources/messages/messages";
import { hasMinRole, type Role } from "@/lib/roles";
import type { UserProfile } from "@/lib/auth-helpers";

export type FindRow = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  call_status: string | null;
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
            "Κλειδιά: first_name, last_name, phone, email, age, gender, occupation, nickname, spouse_name, municipality, electoral_district, toponym, political_stance, priority, call_status, notes, area, tags (array), influence (bool)",
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
];

type ToolContext = {
  supabase: SupabaseClient;
  forward: (path: string, init: RequestInit) => Promise<Response>;
  profile: UserProfile;
  role: Role;
};

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

  if (name === "update_contact") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο υπεύθυνοι (manager) μπορούν να ενημερώνουν επαφές" }) };
    }
    const contact_id = String(raw.contact_id ?? "");
    const fields = raw.fields;
    if (!contact_id || !fields || typeof fields !== "object" || Array.isArray(fields) || fields === null) {
      return { content: JSON.stringify({ error: "Χρειάζονται contact_id και fields (object)" }) };
    }
    const allow = new Set<string>([
      "first_name",
      "last_name",
      "phone",
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
      executedToolName: "update_contact",
    };
  }

  if (name === "update_contact_status") {
    const contact_id = String(raw.contact_id ?? "");
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
    const contact_id = raw.contact_id != null ? String(raw.contact_id) : "";
    const due = raw.due_date != null && String(raw.due_date) !== "null" ? String(raw.due_date) : null;
    if (!title) {
      return { content: JSON.stringify({ error: "Κενό τίτλο" }) };
    }
    if (!contact_id) {
      return {
        content: JSON.stringify({
          error:
            "Για task απαιτείται contact_id. Χρησιμοποιήστε find_contacts για να βρείτε την επαφή και ξαναλάβετε contact_id.",
        }),
      };
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
    if (error) return { content: JSON.stringify({ error: error.message }) };
    return {
      content: JSON.stringify({ ok: true, message: "Η εργασία προστέθηκε.", id: data?.id }),
      executedToolName: "add_task",
    };
  }

  if (name === "create_request") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο manager" }) };
    }
    const contact_id = raw.contact_id != null ? String(raw.contact_id) : "";
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
    const contact_id = String(raw.contact_id ?? "");
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
    const contact_id = String(raw.contact_id ?? "");
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
    const contact_id = String(raw.contact_id ?? "");
    if (!contact_id) {
      return { content: JSON.stringify({ error: "Χρειάζεται contact_id" }) };
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

  return { content: JSON.stringify({ error: "Άγνωστο tool" }) };
}

export function buildSystemPrompt(today: string) {
  return `Είσαι η Αλεξάνδρα, η AI γραμματέας του βουλευτή Κώστα Καραγκούνη (Νέα Δημοκρατία, Αιτωλοακαρνανία).

ΧΑΡΑΚΤΗΡΑΣ:
- Επαγγελματική, έξυπνη, αποφασιστική — σαν έμπειρη πολιτική γραμματέας
- Μιλάς ΠΑΝΤΑ Ελληνικά
- Είσαι σύντομη και συγκεκριμένη — δεν κάνεις μακροσκελείς εισαγωγές
- Χρησιμοποιείς tools ΑΜΕΣΩΣ χωρίς να ρωτάς άδεια για απλές ενέργειες
- Για σημαντικές ενέργειες (κλήσεις, διαγραφές) ζητάς επιβεβαίωση
- Θυμάσαι τα πάντα από την τρέχουσα συνομιλία

ΚΑΝΟΝΕΣ:
- Όταν αναζητάς άνθρωπο → find_contacts: η αναζήτηση είναι ασαφής (Greek, χωρίς tonos, Latin, ψευδώνυμα, παραλλαγές ονόματος). ΧΡΗΣΙΜΟΠΟΙΗΣΕ find_contacts ΠΑΝΤΑ μ’ ασαφή/φυσική γλώσσα στο search — μην ζητάς ακριβές ορθογραφικό.
- Για να αλλάξεις ΟΠΟΙΔΗΠΟΤΕ πεδίο επαφής (first_name, last_name, notes, area, call_status, tags …) → update_contact (manager).
- Όταν σε ζητούν απλά κατάσταση κλήσης → μπορείς update_contact_status ή update_contact
- Όταν λες "βρήκα X επαφές" → δείξε τις με ονόματα και τηλέφωνα
- Όταν ρωτούν στατιστικά → get_stats
- Μετά από κάθε action επιβεβαίωσε συγκεκριμένα τι έκανες
- Αν αποτύχει → εξήγησε και πρότεινε εναλλακτική

ΣΗΜΕΡΙΝΗ ΗΜΕΡΟΜΗΝΙΑ: ${today}`;
}

export function historyToClaude(
  history: { role: "user" | "assistant"; content: string }[],
): MessageParam[] {
  return history.map((h) => ({ role: h.role, content: h.content }));
}
