import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDateAthens } from "@/lib/date-format";
import { buildRequestSummaryPrompt, type RequestSummaryInput } from "@/lib/ai-summary-prompts";
import { truncateNote } from "@/lib/ai-summary";
import { resolveProfileNames } from "@/lib/profile-names";

type ContactRow = {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  area?: string | null;
  municipality?: string | null;
  political_stance?: string | null;
  call_status?: string | null;
  occupation?: string | null;
  age?: number | null;
};

const SELECT_WITH_CONTACT =
  "id, request_code, title, description, category, status, priority, created_at, sla_due_date, contact_id, contacts!contact_id(first_name,last_name,phone,area,municipality,political_stance,call_status,occupation,age)";

function resolveContact(contacts: unknown): ContactRow | null {
  if (!contacts) return null;
  if (Array.isArray(contacts)) return (contacts[0] as ContactRow) ?? null;
  return contacts as ContactRow;
}

export async function fetchRequestSummaryPack(supabase: SupabaseClient, requestId: string) {
  const { data: requestRow, error: reqErr } = await supabase
    .from("requests")
    .select(SELECT_WITH_CONTACT)
    .eq("id", requestId)
    .single();

  if (reqErr || !requestRow) {
    return null;
  }

  const row = requestRow as {
    contact_id?: string | null;
    request_code?: string | null;
    title?: string | null;
    description?: string | null;
    category?: string | null;
    status?: string | null;
    priority?: string | null;
    created_at?: string | null;
    sla_due_date?: string | null;
    contacts?: unknown;
  };

  const [notesRes, personsRes] = await Promise.all([
    supabase
      .from("request_notes")
      .select("content, created_at, created_by, author_name")
      .eq("request_id", requestId)
      .order("created_at", { ascending: true })
      .limit(5),
    supabase
      .from("request_persons")
      .select("role, contacts(first_name, last_name)")
      .eq("request_id", requestId),
  ]);

  const contact = resolveContact(row.contacts);
  const contactName = contact
    ? `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim() || "Άγνωστος"
    : "Άγνωστος";

  const notes = (notesRes.data ?? []).map((n) => {
    const c = n as { content?: string; created_at?: string };
    const d = c.created_at ? formatDateAthens(c.created_at) : "—";
    return `${truncateNote(c.content)} (${d})`;
  });

  const handlerNames: string[] = [];
  const requesters: string[] = [];
  for (const p of personsRes.data ?? []) {
    const pr = p as {
      role?: string;
      contacts?: { first_name?: string; last_name?: string } | { first_name?: string; last_name?: string }[] | null;
    };
    const c = Array.isArray(pr.contacts) ? pr.contacts[0] : pr.contacts;
    if (!c) continue;
    const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
    if (!name) continue;
    if (pr.role === "handler") handlerNames.push(name);
    if (pr.role === "requester") requesters.push(name);
  }

  const noteAuthors = (notesRes.data ?? [])
    .map((n) => (n as { created_by?: string | null }).created_by)
    .filter((id): id is string => Boolean(id));
  const authorMap = noteAuthors.length
    ? await resolveProfileNames([...new Set(noteAuthors)])
    : new Map<string, string | null>();

  const handlerFromNotes = [
    ...new Set(
      (notesRes.data ?? [])
        .map((n) => {
          const note = n as { author_name?: string | null; created_by?: string | null };
          const stored = note.author_name?.trim();
          if (stored) return stored;
          return note.created_by ? authorMap.get(note.created_by) ?? null : null;
        })
        .filter((x): x is string => Boolean(x)),
    ),
  ];

  const input: RequestSummaryInput = {
    request_code: row.request_code,
    title: row.title,
    category: row.category,
    status: row.status,
    priority: row.priority,
    created_at: row.created_at,
    sla_due_date: row.sla_due_date,
    description: row.description,
    requester_name: requesters[0] ?? contactName,
    handlers: [...new Set([...handlerNames, ...handlerFromNotes])].slice(0, 5),
    notes,
    citizen: {
      name: contactName,
      phone: contact?.phone ?? null,
      area: contact?.municipality ?? contact?.area ?? null,
      age: contact?.age ?? null,
      occupation: contact?.occupation ?? null,
      political_stance: contact?.political_stance ?? null,
      call_status: contact?.call_status ?? null,
    },
  };

  return { prompt: buildRequestSummaryPrompt(input) };
}
