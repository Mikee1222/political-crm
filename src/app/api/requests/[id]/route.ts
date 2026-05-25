import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { logActivity } from "@/lib/activity-log";
import { firstNameFromFull } from "@/lib/activity-descriptions";
import { nextJsonError } from "@/lib/api-resilience";
import { computeSlaStatus } from "@/lib/request-sla";
import { fieldDiff } from "@/lib/field-diff";
import { notifyRequestStatusToCitizen } from "@/lib/request-notifications";
import { resolveProfileNames } from "@/lib/profile-names";
export const dynamic = "force-dynamic";

type RequestNoteRow = {
  id: string;
  content: string;
  created_at: string;
  created_by: string | null;
  author_name: string | null;
};

function noteAuthorDisplay(row: RequestNoteRow, nameMap: Map<string, string | null>) {
  const stored = row.author_name?.trim();
  if (stored) return stored;
  return row.created_by ? (nameMap.get(row.created_by) ?? "—") : "—";
}

type ContactBrief = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  phone2: string | null;
  landline: string | null;
};

type PersonRow = {
  role: string;
  contact_id: string;
  contacts: ContactBrief | ContactBrief[] | null;
};

function contactFromPersonRow(p: PersonRow): ContactBrief | null {
  const c = p.contacts;
  if (c == null) return null;
  return Array.isArray(c) ? c[0] ?? null : c;
}

function groupPersons(rows: PersonRow[]) {
  const requesters: ContactBrief[] = [];
  const affected: ContactBrief[] = [];
  const helpers: ContactBrief[] = [];
  const handlers: ContactBrief[] = [];
  const seen = {
    requester: new Set<string>(),
    affected: new Set<string>(),
    helper: new Set<string>(),
    handler: new Set<string>(),
  };
  for (const p of rows) {
    const c = contactFromPersonRow(p);
    if (!c) continue;
    if (p.role === "requester" && !seen.requester.has(c.id)) {
      seen.requester.add(c.id);
      requesters.push(c);
    } else if (p.role === "affected" && !seen.affected.has(c.id)) {
      seen.affected.add(c.id);
      affected.push(c);
    } else if (p.role === "helper" && !seen.helper.has(c.id)) {
      seen.helper.add(c.id);
      helpers.push(c);
    } else if (p.role === "handler" && !seen.handler.has(c.id)) {
      seen.handler.add(c.id);
      handlers.push(c);
    }
  }
  return { requesters, affected, helpers, handlers };
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
  const crm = await checkCRMAccess();
  if (!crm.allowed) return crm.response;
  const { profile, supabase } = crm;
  if (!hasMinRole(profile?.role, "manager")) {
    return forbidden();
  }
  const { data: row, error } = await supabase
    .from("requests")
    .select(
      "id, request_code, title, description, category, status, priority, assigned_to, created_at, updated_at, contact_id, affected_contact_id, sla_due_date, sla_status, portal_message, portal_visible",
    )
    .eq("id", params.id)
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const r = row as {
    id: string;
    contact_id: string;
    affected_contact_id: string | null;
  };

  const { data: personRows } = await supabase
    .from("request_persons")
    .select(
      "role, contact_id, contacts(id, first_name, last_name, phone, phone2, landline)",
    )
    .eq("request_id", params.id);

  let grouped = groupPersons((personRows ?? []) as PersonRow[]);

  const cids = [r.contact_id, r.affected_contact_id].filter(
    (x): x is string => x != null && x !== "",
  );
  const uniqCids = [...new Set(cids)];
  let cRows: ContactBrief[] = [];
  if (uniqCids.length > 0) {
    const { data } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, phone, phone2, landline")
      .in("id", uniqCids);
    cRows = (data ?? []) as ContactBrief[];
  }
  const byId = new Map(cRows.map((c) => [c.id, c] as const));

  if (grouped.requesters.length === 0 && r.contact_id) {
    const c = byId.get(r.contact_id);
    if (c) grouped = { ...grouped, requesters: [c] };
  }
  if (grouped.affected.length === 0 && r.affected_contact_id) {
    const c = byId.get(r.affected_contact_id);
    if (c) grouped = { ...grouped, affected: [c] };
  }

  const requester = grouped.requesters[0] ?? byId.get(r.contact_id) ?? null;
  const affectedOne = grouped.affected[0] ?? (r.affected_contact_id != null ? byId.get(r.affected_contact_id) ?? null : null);

  const { data: noteRows } = await supabase
    .from("request_notes")
    .select("id, content, created_at, created_by:user_id, author_name")
    .eq("request_id", params.id)
    .order("created_at", { ascending: false });

  const rawNotes = (noteRows ?? []) as RequestNoteRow[];
  const nameMap = await resolveProfileNames(rawNotes.map((n) => n.created_by));
  const notesData = rawNotes.map((n) => ({
    ...n,
    author_name: n.author_name?.trim() || null,
    author_full_name: noteAuthorDisplay(n, nameMap),
  }));

  const allNotes = notesData ?? [];

  const handlers = allNotes
    .filter((n: any) => n.content?.startsWith('[Χειριστής:'))
    .map((n: any) => {
      const match = n.content.match(/\[Χειριστής: (.+?)\]/);
      return match ? match[1].trim() : null;
    })
    .filter(Boolean);

  const regularNotes = allNotes.filter((n: any) => !n.content?.startsWith('[Χειριστής:'));

  return NextResponse.json({
    request: {
      ...row,
      requester,
      affected: affectedOne,
      requesters: grouped.requesters,
      affected_list: grouped.affected,
      helpers: grouped.helpers,
      person_handlers: grouped.handlers,
      handlers,
      notes: regularNotes,
    },
  });
  } catch (e) {
    console.error("[api/requests/id GET]", e);
    return nextJsonError();
  }
}

export async function PATCH(request: NextRequest, ctx: { params: { id: string } }) {
  return PUT(request, ctx);
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
  const crm = await checkCRMAccess();
  if (!crm.allowed) return crm.response;
  const { user, profile, supabase } = crm;
  if (!hasMinRole(profile?.role, "manager")) {
    return forbidden();
  }
  const body = (await request.json()) as Record<string, unknown>;
  const { data: before } = await supabase.from("requests").select("*").eq("id", params.id).single();
  if (!before) {
    return NextResponse.json({ error: "Δεν βρέθηκε" }, { status: 404 });
  }
  const beforeRow = before as Record<string, unknown>;
  const curRow = before as { status?: string | null; sla_due_date?: string | null };
  const newStatus = (body as { status?: string }).status != null ? String((body as { status?: string }).status) : curRow?.status;
  const newDue =
    (body as { sla_due_date?: string }).sla_due_date != null
      ? String((body as { sla_due_date?: string }).sla_due_date)
      : curRow?.sla_due_date;
  const mergedSla =
    newDue && newStatus != null && newStatus !== undefined
      ? computeSlaStatus(String(newDue), String(newStatus))
      : null;
  const { data, error } = await supabase
    .from("requests")
    .update({
      ...body,
      updated_at: new Date().toISOString(),
      ...(mergedSla != null ? { sla_status: mergedSla } : {}),
    })
    .eq("id", params.id)
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const title = String((data as { title?: string }).title ?? "Αίτημα");
  const afterRow = data as Record<string, unknown>;
  const changed = fieldDiff(beforeRow, afterRow);
  const actor = firstNameFromFull(profile?.full_name);
  await logActivity({
    userId: user.id,
    action: "request_updated",
    entityType: "request",
    entityId: params.id,
    entityName: title,
    details:
      Object.keys(changed).length > 0
        ? { actor_name: actor, changed_fields: changed }
        : { actor_name: actor },
  });
  const oldS = String((beforeRow as { status?: string }).status ?? "");
  const newS = String((afterRow as { status?: string }).status ?? "");
  if (oldS !== newS) {
    const code = String((data as { request_code?: string }).request_code ?? "");
    const contactId = String((data as { contact_id: string }).contact_id ?? "");
    if (code && contactId) {
      void notifyRequestStatusToCitizen({
        contactId,
        requestCode: code,
        oldStatus: oldS,
        newStatus: newS,
      });
    }
  }
  return NextResponse.json({ request: data });
  } catch (e) {
    console.error("[api/requests/id PUT]", e);
    return nextJsonError();
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
  const crm = await checkCRMAccess();
  if (!crm.allowed) return crm.response;
  const { profile, supabase } = crm;
  if (!hasMinRole(profile?.role, "manager")) {
    return forbidden();
  }
  const { error } = await supabase.from("requests").delete().eq("id", params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/requests/id DELETE]", e);
    return nextJsonError();
  }
}
