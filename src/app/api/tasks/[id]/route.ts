import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
import { logActivity } from "@/lib/activity-log";
import { firstNameFromFull } from "@/lib/activity-descriptions";
import { fieldDiff } from "@/lib/field-diff";
export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
  const crm = await checkCRMAccess();
  if (!crm.allowed) return crm.response;
  const { user, profile, supabase } = crm;
  if (!hasMinRole(profile?.role, "manager")) {
    return forbidden();
  }

  const body = (await request.json()) as {
    title?: string;
    description?: string | null;
    due_date?: string | null;
    priority?: string;
    category?: string | null;
    contact_id?: string;
    completed?: boolean;
    assigned_to_user_id?: string | null;
  };

  const patch: Record<string, unknown> = {};
  if (body.title !== undefined) patch.title = String(body.title).trim();
  if (body.description !== undefined) patch.description = body.description;
  if (body.due_date !== undefined) patch.due_date = body.due_date;
  if (body.priority !== undefined) {
    const p = String(body.priority);
    if (!["High", "Medium", "Low"].includes(p)) {
      return NextResponse.json({ error: "Άκυρη προτεραιότητα" }, { status: 400 });
    }
    patch.priority = p;
  }
  if (body.category !== undefined) patch.category = body.category;
  if (body.contact_id !== undefined) patch.contact_id = body.contact_id;
  if (body.assigned_to_user_id !== undefined) {
    if (body.assigned_to_user_id === null || body.assigned_to_user_id === "") {
      patch.assigned_to_user_id = null;
    } else {
      const { data: prof, error: pe } = await supabase.from("profiles").select("id").eq("id", body.assigned_to_user_id).maybeSingle();
      if (pe || !prof) {
        return NextResponse.json({ error: "Άκυρος υπεύθυνος χρήστης" }, { status: 400 });
      }
      patch.assigned_to_user_id = body.assigned_to_user_id;
    }
  }
  if (body.completed === true) {
    patch.completed = true;
    patch.completed_at = new Date().toISOString();
  } else if (body.completed === false) {
    patch.completed = false;
    patch.completed_at = null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Καμία αλλαγή" }, { status: 400 });
  }

  const { data: beforeT } = await supabase.from("tasks").select("*").eq("id", params.id).single();
  const beforeTask = (beforeT ?? null) as Record<string, unknown> | null;
  const { data, error } = await supabase
    .from("tasks")
    .update(patch)
    .eq("id", params.id)
    .select("*, contacts(id, first_name, last_name, phone)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const c = (data as { contacts?: unknown }).contacts;
  const contact = Array.isArray(c) ? c[0] : c;
  const { contacts: _c, ...rest } = data as Record<string, unknown> & { contacts?: unknown };
  void _c;
  const ch = beforeTask ? fieldDiff(beforeTask, rest as Record<string, unknown>) : {};
  const titleL = String((data as { title?: string }).title ?? "Εργασία");
  await logActivity({
    userId: user.id,
    action: "task_updated",
    entityType: "task",
    entityId: String((data as { id: string }).id),
    entityName: titleL,
    details:
      Object.keys(ch).length > 0
        ? { actor_name: firstNameFromFull(profile?.full_name), changed_fields: ch, contact_id: (data as { contact_id?: string }).contact_id }
        : { actor_name: firstNameFromFull(profile?.full_name), contact_id: (data as { contact_id?: string }).contact_id },
  });
  const aid = (data as { assigned_to_user_id?: string | null }).assigned_to_user_id;
  let assignee: { id: string; full_name: string | null } | null = null;
  if (aid) {
    const { data: pr } = await supabase.from("profiles").select("id, full_name").eq("id", aid).maybeSingle();
    if (pr) assignee = pr as { id: string; full_name: string | null };
  }
  return NextResponse.json({ task: { ...data, contacts: contact ?? null, assignee } });
  } catch (e) {
    console.error("[api/tasks/id PATCH]", e);
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
  const { error } = await supabase.from("tasks").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/tasks/id DELETE]", e);
    return nextJsonError();
  }
}
