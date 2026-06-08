import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDateAthens } from "@/lib/date-format";
import { fetchGroupNamesByContactId } from "@/lib/contact-group-members";
import { truncateNote } from "@/lib/ai-summary";

export type ContactSummaryInput = {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  municipality?: string | null;
  area?: string | null;
  age?: number | null;
  occupation?: string | null;
  call_status?: string | null;
  political_stance?: string | null;
  notes?: string | null;
  groups?: string[];
  requests_count?: number;
  recent_calls?: string[];
  recent_requests?: string[];
  recent_notes?: string[];
};

export type RequestSummaryInput = {
  title?: string | null;
  request_code?: string | null;
  category?: string | null;
  status?: string | null;
  priority?: string | null;
  created_at?: string | null;
  sla_due_date?: string | null;
  description?: string | null;
  requester_name?: string | null;
  handlers?: string[];
  notes?: string[];
  citizen?: {
    name?: string;
    phone?: string | null;
    area?: string | null;
    age?: number | null;
    occupation?: string | null;
    political_stance?: string | null;
    call_status?: string | null;
  };
};

export function buildContactSummaryPrompt(contact: ContactSummaryInput): string {
  const pack = {
    name: `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim(),
    phone: contact.phone ?? null,
    municipality: contact.municipality ?? null,
    area: contact.area ?? null,
    age: contact.age ?? null,
    occupation: contact.occupation ?? null,
    call_status: contact.call_status ?? null,
    political_stance: contact.political_stance ?? null,
    notes: truncateNote(contact.notes),
    groups: (contact.groups ?? []).slice(0, 5),
    requests_count: contact.requests_count ?? 0,
    recent_calls: contact.recent_calls ?? [],
    recent_requests: contact.recent_requests ?? [],
    recent_notes: contact.recent_notes ?? [],
  };
  return `Σύντομη σύνοψη επαφής (2-3 προτάσεις).\n\n${JSON.stringify(pack)}`;
}

export function buildRequestSummaryPrompt(request: RequestSummaryInput): string {
  const pack = {
    request: {
      code: request.request_code ?? null,
      title: request.title ?? null,
      category: request.category ?? null,
      status: request.status ?? null,
      priority: request.priority ?? null,
      created_at: request.created_at ? formatDateAthens(request.created_at) : null,
      sla_due_date: request.sla_due_date ?? null,
      description: truncateNote(request.description),
      requester: request.requester_name ?? null,
      handlers: (request.handlers ?? []).slice(0, 5),
    },
    citizen: request.citizen ?? null,
    notes: (request.notes ?? []).slice(0, 5),
  };
  return `Σύντομη σύνοψη αιτήματος (2-3 προτάσεις).\n\n${JSON.stringify(pack)}`;
}

export const CONTACT_SUMMARY_SYSTEM =
  "Είσαι βοηθός για βουλευτή. Απαντάς μόνο στα ελληνικά, 2-3 σύντομες προτάσεις, χωρίς τίτλο ή markdown.";

export const REQUEST_SUMMARY_SYSTEM =
  "Είσαι βοηθός πολιτικού γραφείου. Απαντάς μόνο στα ελληνικά, 2-3 σύντομες προτάσεις, χωρίς τίτλο ή markdown.";

export async function fetchContactSummaryPack(supabase: SupabaseClient, contactId: string) {
  const { data: contact, error: ce } = await supabase
    .from("contacts")
    .select(
      "first_name, last_name, phone, municipality, area, age, occupation, call_status, political_stance, notes",
    )
    .eq("id", contactId)
    .maybeSingle();
  if (ce || !contact) return null;

  const [callsRes, requestsRes, notesRes, reqCountRes, groupNames] = await Promise.all([
    supabase
      .from("calls")
      .select("called_at, outcome")
      .eq("contact_id", contactId)
      .order("called_at", { ascending: false })
      .limit(5),
    supabase
      .from("requests")
      .select("title, status")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("contact_notes")
      .select("content")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.from("requests").select("id", { count: "exact", head: true }).eq("contact_id", contactId),
    fetchGroupNamesByContactId(supabase, [contactId]),
  ]);

  const recent_calls = (callsRes.data ?? []).map((row) => {
    const r = row as { called_at?: string; outcome?: string };
    const d = r.called_at ? formatDateAthens(r.called_at) : "—";
    return `${d}: ${r.outcome ?? "—"}`;
  });

  const recent_requests = (requestsRes.data ?? []).map((row) => {
    const r = row as { title?: string; status?: string };
    return `${r.title ?? "—"} (${r.status ?? "—"})`;
  });

  const recent_notes = (notesRes.data ?? []).map((row) =>
    truncateNote((row as { content?: string }).content),
  );

  const input: ContactSummaryInput = {
    first_name: contact.first_name,
    last_name: contact.last_name,
    phone: contact.phone,
    municipality: contact.municipality,
    area: contact.area,
    age: contact.age,
    occupation: contact.occupation,
    call_status: contact.call_status,
    political_stance: contact.political_stance,
    notes: contact.notes,
    groups: (groupNames.get(contactId) ?? []).slice(0, 5),
    requests_count: reqCountRes.count ?? 0,
    recent_calls,
    recent_requests,
    recent_notes,
  };

  return { contact, input, prompt: buildContactSummaryPrompt(input) };
}

export function buildContactAssistantPrompt(contactJson: Record<string, unknown>): string {
  return buildContactSummaryPrompt(contactJson as ContactSummaryInput);
}
