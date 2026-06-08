import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDateAthens } from "@/lib/date-format";
import { fetchGroupNamesByContactId } from "@/lib/contact-group-members";

export type ContactSummaryInput = {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  municipality?: string | null;
  toponym?: string | null;
  gender?: string | null;
  age?: number | null;
  occupation?: string | null;
  call_status?: string | null;
  political_stance?: string | null;
  notes?: string | null;
  is_volunteer?: boolean | null;
  predicted_score?: number | null;
  last_contacted_at?: string | null;
  source?: string | null;
  tags?: string[] | null;
  groups?: string[];
  requests_count?: number;
  recent_calls?: string;
  recent_requests?: string;
  recent_tasks?: string;
  recent_notes?: string;
};

export type RequestSummaryInput = {
  title?: string | null;
  request_code?: string | null;
  category?: string | null;
  status?: string | null;
  priority?: string | null;
  created_at?: string | null;
  sla_due_date?: string | null;
  sla_status?: string | null;
  description?: string | null;
  requester_name?: string | null;
  handlers?: string[];
  notes_text?: string;
  contact_block?: string;
  extra_context?: string;
};

export function buildContactSummaryPrompt(contact: ContactSummaryInput): string {
  const groups = contact.groups?.length ? contact.groups.join(", ") : "Καμία";
  const sources = [
    ...(contact.source?.trim() ? [contact.source.trim()] : []),
    ...(contact.tags ?? []).map((t) => String(t).trim()).filter(Boolean),
  ];
  const sourcesLabel = sources.length ? sources.join(", ") : "—";
  const lastContact = contact.last_contacted_at
    ? formatDateAthens(contact.last_contacted_at)
    : "Ποτέ";

  let prompt = `Είσαι έμπειρος πολιτικός γραμματέας. Γράψε σύνοψη για την επαφή παρακάτω.

ΔΕΔΟΜΕΝΑ ΕΠΑΦΗΣ:
Ονοματεπώνυμο: ${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim();

  prompt += `
Τηλέφωνο: ${contact.phone || "—"}
Δήμος: ${contact.municipality || "—"}
Τοπωνύμιο: ${contact.toponym || "—"}
Φύλο: ${contact.gender || "—"}
Ηλικία: ${contact.age ?? "—"}
Επάγγελμα: ${contact.occupation || "—"}
Κατάσταση κλήσης: ${contact.call_status || "—"}
Πολιτική τοποθέτηση: ${contact.political_stance || "—"}
Ομάδες: ${groups}
Πηγές: ${sourcesLabel}
Αιτήματα: ${contact.requests_count ?? 0} αιτήματα
Τελευταία επικοινωνία: ${lastContact}
Σημειώσεις: ${contact.notes?.trim() || "—"}
Εθελοντής: ${contact.is_volunteer ? "Ναι" : "Όχι"}
Σκορ πειθώ: ${contact.predicted_score ?? "—"}`;

  if (contact.recent_calls) prompt += `\n\nΠΡΟΣΦΑΤΕΣ ΚΛΗΣΕΙΣ:\n${contact.recent_calls}`;
  if (contact.recent_requests) prompt += `\n\nΠΡΟΣΦΑΤΑ ΑΙΤΗΜΑΤΑ:\n${contact.recent_requests}`;
  if (contact.recent_tasks) prompt += `\n\nΕΡΓΑΣΙΕΣ:\n${contact.recent_tasks}`;
  if (contact.recent_notes) prompt += `\n\nΣΗΜΕΙΩΣΕΙΣ ΕΠΑΦΗΣ:\n${contact.recent_notes}`;

  prompt += `

Γράψε σύνοψη σε 3-4 προτάσεις που να καλύπτει:
1. Ποιος είναι (γεωγραφικά, δημογραφικά)
2. Σχέση με το γραφείο (κατάσταση, αιτήματα, επικοινωνία)
3. Πολιτικό προφίλ αν υπάρχει
4. Οτιδήποτε σημαντικό από τις σημειώσεις

Γράψε σε τρίτο πρόσωπο, επαγγελματικά, στα Ελληνικά. Μόνο κείμενο, χωρίς bullets.`;

  return prompt;
}

export function buildRequestSummaryPrompt(request: RequestSummaryInput): string {
  const createdLabel = request.created_at ? formatDateAthens(request.created_at) : "—";
  const slaLabel = request.sla_due_date ? formatDateAthens(request.sla_due_date) : "—";

  let prompt = `Είσαι έμπειρος πολιτικός γραμματέας. Γράψε σύνοψη για το αίτημα παρακάτω.

ΔΕΔΟΜΕΝΑ ΑΙΤΗΜΑΤΟΣ:
Κωδικός: ${request.request_code ?? "—"}
Τίτλος: ${request.title ?? "—"}
Κατηγορία: ${request.category || "—"}
Κατάσταση: ${request.status ?? "—"}
Προτεραιότητα: ${request.priority ?? "—"}
Ημερομηνία: ${createdLabel}
SLA: ${slaLabel}${request.sla_status ? ` (${request.sla_status})` : ""}
Αιτών: ${request.requester_name || "—"}
Χειριστές: ${request.handlers?.length ? request.handlers.join(", ") : "—"}
Περιγραφή: ${request.description?.trim() || "—"}
Σημειώσεις: ${request.notes_text || "—"}`;

  if (request.contact_block) {
    prompt += `\n\nΣΤΟΙΧΕΙΑ ΠΟΛΙΤΗ:\n${request.contact_block}`;
  }
  if (request.extra_context) {
    prompt += `\n\nΕΠΙΠΛΕΟΝ ΠΛΗΡΟΦΟΡΙΕΣ:\n${request.extra_context}`;
  }

  prompt += `

Γράψε σύνοψη σε 3-4 προτάσεις:
1. Τι ζητήθηκε και από ποιον
2. Ποια η τρέχουσα κατάσταση και εξέλιξη
3. Τι ενέργειες έχουν γίνει
4. Τι εκκρεμεί αν υπάρχει κάτι

Επαγγελματικά, στα Ελληνικά. Μόνο κείμενο.`;

  return prompt;
}

export const CONTACT_SUMMARY_SYSTEM =
  "Είσαι έμπειρος πολιτικός γραμματέας. Απαντάς μόνο στα ελληνικά, 2-3 πλήρεις προτάσεις, χωρίς τίτλο ή markdown. Ολοκλήρωσε ΠΑΝΤΑ κάθε πρόταση. Μην κόβεις στη μέση.";

export const REQUEST_SUMMARY_SYSTEM =
  "Είσαι έμπειρος πολιτικός γραμματέας. Απαντάς μόνο στα ελληνικά, 2-3 πλήρεις προτάσεις, χωρίς τίτλο ή markdown. Ολοκλήρωσε ΠΑΝΤΑ κάθε πρόταση. Μην κόβεις στη μέση.";

export async function fetchContactSummaryPack(supabase: SupabaseClient, contactId: string) {
  const { data: contact, error: ce } = await supabase
    .from("contacts")
    .select(
      "first_name, last_name, phone, municipality, toponym, gender, age, occupation, call_status, political_stance, notes, is_volunteer, predicted_score, last_contacted_at, source, tags",
    )
    .eq("id", contactId)
    .maybeSingle();
  if (ce || !contact) return null;

  const [callsRes, requestsRes, tasksRes, notesRes, reqCountRes, groupNames] = await Promise.all([
    supabase
      .from("calls")
      .select("called_at, outcome, notes")
      .eq("contact_id", contactId)
      .order("called_at", { ascending: false })
      .limit(10),
    supabase
      .from("requests")
      .select("title, status, created_at")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("tasks")
      .select("title, due_date, completed")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("contact_notes")
      .select("content, created_at")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase.from("requests").select("id", { count: "exact", head: true }).eq("contact_id", contactId),
    fetchGroupNamesByContactId(supabase, [contactId]),
  ]);

  const recent_calls =
    (callsRes.data ?? []).length > 0
      ? (callsRes.data ?? [])
          .map((row) => {
            const r = row as { called_at?: string; outcome?: string; notes?: string };
            const d = r.called_at ? formatDateAthens(r.called_at) : "—";
            return `- ${d}: ${r.outcome ?? "—"}${r.notes ? ` — ${r.notes}` : ""}`;
          })
          .join("\n")
      : undefined;

  const recent_requests =
    (requestsRes.data ?? []).length > 0
      ? (requestsRes.data ?? [])
          .map((row) => {
            const r = row as { title?: string; status?: string; created_at?: string };
            const d = r.created_at ? formatDateAthens(r.created_at) : "—";
            return `- ${r.title ?? "—"} (${r.status ?? "—"}, ${d})`;
          })
          .join("\n")
      : undefined;

  const recent_tasks =
    (tasksRes.data ?? []).length > 0
      ? (tasksRes.data ?? [])
          .map((row) => {
            const r = row as { title?: string; due_date?: string; completed?: boolean };
            return `- ${r.title ?? "—"}${r.due_date ? ` (${r.due_date})` : ""}${r.completed ? " [ολοκληρώθηκε]" : ""}`;
          })
          .join("\n")
      : undefined;

  const recent_notes =
    (notesRes.data ?? []).length > 0
      ? (notesRes.data ?? [])
          .map((row) => {
            const r = row as { content?: string; created_at?: string };
            const d = r.created_at ? formatDateAthens(r.created_at) : "—";
            return `- ${r.content ?? ""} (${d})`;
          })
          .join("\n")
      : undefined;

  const input: ContactSummaryInput = {
    first_name: contact.first_name,
    last_name: contact.last_name,
    phone: contact.phone,
    municipality: contact.municipality,
    toponym: contact.toponym,
    gender: contact.gender,
    age: contact.age,
    occupation: contact.occupation,
    call_status: contact.call_status,
    political_stance: contact.political_stance,
    notes: contact.notes,
    is_volunteer: contact.is_volunteer,
    predicted_score: contact.predicted_score,
    last_contacted_at: contact.last_contacted_at,
    source: contact.source,
    tags: contact.tags,
    groups: (groupNames.get(contactId) ?? []).slice(0, 5),
    requests_count: reqCountRes.count ?? 0,
    recent_calls,
    recent_requests,
    recent_tasks,
    recent_notes,
  };

  return { contact, input, prompt: buildContactSummaryPrompt(input) };
}

export function buildContactAssistantPrompt(contactJson: Record<string, unknown>): string {
  return `Είσαι έμπειρος πολιτικός γραμματέας. Δώσε σύντομη σύνοψη επαφής για χρήση από το γραφείο.

${JSON.stringify(contactJson, null, 2)}

Γράψε:
- 2-3 προτάσεις σύνοψη
- 1 πρόταση για εκκρεμότητες/σημαντικά θέματα αν υπάρχουν
- 1 πρόταση σύσταση για επόμενη ενέργεια

Στα Ελληνικά, επαγγελματικά.`;
}
