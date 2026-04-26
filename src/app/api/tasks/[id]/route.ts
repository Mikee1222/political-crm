import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
  const { user, profile, supabase } = await getSessionWithProfile();
  if (!user) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  }
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

  const { data, error } = await supabase
    .from("tasks")
    .update(patch)
    .eq("id", params.id)
    .select("*, contacts(id, first_name, last_name, phone)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const c = (data as { contacts?: unknown }).contacts;
  const contact = Array.isArray(c) ? c[0] : c;
  return NextResponse.json({ task: { ...data, contacts: contact ?? null } });
  } catch (e) {
    console.error("[api/tasks/id PATCH]", e);
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
  const { error } = await supabase.from("tasks").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/tasks/id DELETE]", e);
    return nextJsonError();
  }
}
