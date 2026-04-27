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
export const dynamic = "force-dynamic";

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
  const cids = [r.contact_id, r.affected_contact_id].filter(
    (x): x is string => x != null && x !== "",
  );
  const uniqCids = [...new Set(cids)];
  let cRows: { id: string; first_name: string; last_name: string; phone: string | null; phone2: string | null; landline: string | null }[] =
    [];
  if (uniqCids.length > 0) {
    const { data } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, phone, phone2, landline")
      .in("id", uniqCids);
    cRows = (data ?? []) as typeof cRows;
  }
  const byId = new Map(cRows.map((c) => [c.id, c] as const));
  const requester = byId.get(r.contact_id) ?? null;
  const affected = r.affected_contact_id != null ? byId.get(r.affected_contact_id) ?? null : null;
  return NextResponse.json({ request: { ...row, requester, affected } });
  } catch (e) {
    console.error("[api/requests/id GET]", e);
    return nextJsonError();
  }
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
