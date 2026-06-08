import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDateAthens } from "@/lib/date-format";
import { buildRequestSummaryPrompt, type RequestSummaryInput } from "@/lib/ai-summary-prompts";
import { resolveProfileNames } from "@/lib/profile-names";

type ContactRow = {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  address?: string | null;
  area?: string | null;
  municipality?: string | null;
  political_stance?: string | null;
  call_status?: string | null;
  occupation?: string | null;
  age?: number | null;
  contact_groups?: { name?: string } | { name?: string }[] | null;
};

const SELECT_WITH_CONTACT =
  "id, request_code, title, description, category, status, priority, created_at, updated_at, sla_due_date, sla_status, contact_id, contacts!contact_id(first_name,last_name,phone,address,area,municipality,political_stance,call_status,occupation,age,contact_groups(name))";

const SELECT_FALLBACK =
  "id, request_code, title, description, category, status, priority, created_at, updated_at, sla_due_date, sla_status, contact_id, contacts!contact_id(first_name,last_name,phone,address,area,municipality,political_stance,call_status,occupation,age)";

function resolveContact(contacts: unknown): ContactRow | null {
  if (!contacts) return null;
  if (Array.isArray(contacts)) return (contacts[0] as ContactRow) ?? null;
  return contacts as ContactRow;
}

function resolveGroupName(contact: ContactRow | null): string {
  const groups = contact?.contact_groups;
  if (Array.isArray(groups)) return groups[0]?.name ?? "Καμία";
  if (groups && typeof groups === "object" && "name" in groups) {
    return (groups as { name?: string }).name ?? "Καμία";
  }
  return "Καμία";
}

function contactBlock(contact: ContactRow | null, contactName: string): string {
  if (!contact) return "Άγνωστος πολίτης";
  return [
    `Ονοματεπώνυμο: ${contactName}`,
    `Τηλέφωνο: ${contact.phone ?? "—"}`,
    `Διεύθυνση: ${contact.address ?? "—"}`,
    `Περιοχή: ${contact.municipality ?? contact.area ?? "—"}`,
    `Ηλικία: ${contact.age ?? "—"}`,
    `Επάγγελμα: ${contact.occupation ?? "—"}`,
    `Πολιτική στάση: ${contact.political_stance ?? "—"}`,
    `Κατάσταση κλήσης: ${contact.call_status ?? "—"}`,
    `Ομάδα: ${resolveGroupName(contact)}`,
  ].join("\n");
}

export async function fetchRequestSummaryPack(supabase: SupabaseClient, requestId: string) {
  let { data: requestRow, error: reqErr } = await supabase
    .from("requests")
    .select(SELECT_WITH_CONTACT)
    .eq("id", requestId)
    .single();

  if (reqErr?.message.includes("contact_groups")) {
    const retry = await supabase.from("requests").select(SELECT_FALLBACK).eq("id", requestId).single();
    requestRow = retry.data as typeof requestRow;
    reqErr = retry.error;
  }

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
    updated_at?: string | null;
    sla_due_date?: string | null;
    sla_status?: string | null;
    contacts?: unknown;
  };

  const [notesRes, personsRes, tasksRes, callsRes] = await Promise.all([
    supabase
      .from("request_notes")
      .select("content, created_at, created_by, author_name")
      .eq("request_id", requestId)
      .order("created_at", { ascending: true })
      .limit(15),
    supabase
      .from("request_persons")
      .select("role, contacts(first_name, last_name)")
      .eq("request_id", requestId),
    row.contact_id
      ? supabase
          .from("tasks")
          .select("title, due_date, completed")
          .eq("contact_id", row.contact_id)
          .order("created_at", { ascending: false })
          .limit(8)
      : Promise.resolve({ data: [] as unknown[], error: null }),
    row.contact_id
      ? supabase
          .from("calls")
          .select("called_at, outcome, notes")
          .eq("contact_id", row.contact_id)
          .order("called_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] as unknown[], error: null }),
  ]);

  const contact = resolveContact(row.contacts);
  const contactName = contact
    ? `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim() || "Άγνωστος"
    : "Άγνωστος";

  const notesText =
    notesRes.data && notesRes.data.length > 0
      ? notesRes.data
          .map((n) => {
            const c = n as { content?: string; created_at?: string };
            const d = c.created_at ? formatDateAthens(c.created_at) : "—";
            return `${c.content ?? ""} (${d})`;
          })
          .join(" | ")
      : "—";

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

  const extraParts: string[] = [];
  if (row.updated_at && row.created_at && row.updated_at !== row.created_at) {
    extraParts.push(`Τελευταία ενημέρωση: ${formatDateAthens(row.updated_at)}`);
  }
  if (tasksRes.data && tasksRes.data.length > 0) {
    extraParts.push(
      "Εργασίες:\n" +
        tasksRes.data
          .map((t) => {
            const task = t as { title?: string; due_date?: string; completed?: boolean };
            return `- ${task.title ?? "—"}${task.due_date ? ` (${task.due_date})` : ""}${task.completed ? " [ολοκληρώθηκε]" : ""}`;
          })
          .join("\n"),
    );
  }
  if (callsRes.data && callsRes.data.length > 0) {
    extraParts.push(
      "Πρόσφατες κλήσεις πολίτη:\n" +
        callsRes.data
          .map((c) => {
            const call = c as { called_at?: string; outcome?: string; notes?: string };
            const d = call.called_at ? formatDateAthens(call.called_at) : "—";
            return `- ${d}: ${call.outcome ?? "—"}${call.notes ? ` — ${call.notes}` : ""}`;
          })
          .join("\n"),
    );
  }

  const input: RequestSummaryInput = {
    request_code: row.request_code,
    title: row.title,
    category: row.category,
    status: row.status,
    priority: row.priority,
    created_at: row.created_at,
    sla_due_date: row.sla_due_date,
    sla_status: row.sla_status,
    description: row.description,
    requester_name: requesters[0] ?? contactName,
    handlers: [...new Set([...handlerNames, ...handlerFromNotes])],
    notes_text: notesText,
    contact_block: contactBlock(contact, contactName),
    extra_context: extraParts.length ? extraParts.join("\n\n") : undefined,
  };

  return { prompt: buildRequestSummaryPrompt(input) };
}
