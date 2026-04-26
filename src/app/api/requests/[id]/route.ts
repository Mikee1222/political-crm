import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { logActivity } from "@/lib/activity-log";
import { firstNameFromFull } from "@/lib/activity-descriptions";
import { nextJsonError } from "@/lib/api-resilience";
import { computeSlaStatus } from "@/lib/request-sla";
export const dynamic = "force-dynamic";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
  const { user, profile, supabase } = await getSessionWithProfile();
  if (!user) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  }
  if (!hasMinRole(profile?.role, "manager")) {
    return forbidden();
  }
  const { data: row, error } = await supabase
    .from("requests")
    .select(
      "id, request_code, title, description, category, status, priority, assigned_to, created_at, updated_at, contact_id, affected_contact_id, sla_due_date, sla_status",
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
  const { user, profile, supabase } = await getSessionWithProfile();
  if (!user) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  }
  if (!hasMinRole(profile?.role, "manager")) {
    return forbidden();
  }
  const body = (await request.json()) as Record<string, unknown>;
  const { data: cur } = await supabase
    .from("requests")
    .select("status, sla_due_date")
    .eq("id", params.id)
    .maybeSingle();
  const curRow = cur as { status?: string | null; sla_due_date?: string | null } | null;
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
  await logActivity({
    userId: user.id,
    action: "request_updated",
    entityType: "request",
    entityId: params.id,
    entityName: title,
    details: { actor_name: firstNameFromFull(profile?.full_name) },
  });
  return NextResponse.json({ request: data });
  } catch (e) {
    console.error("[api/requests/id PUT]", e);
    return nextJsonError();
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
  const { user, profile, supabase } = await getSessionWithProfile();
  if (!user) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  }
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
