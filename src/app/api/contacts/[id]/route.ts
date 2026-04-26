import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { createServiceClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity-log";
import { firstNameFromFull } from "@/lib/activity-descriptions";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const { user, profile, supabase } = await getSessionWithProfile();
  if (!user) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  }
  const role = profile?.role ?? "caller";

  const { data: contact, error } = await supabase.from("contacts").select("*").eq("id", params.id).single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const { data: calls } = await supabase
    .from("calls")
    .select("id, called_at, outcome, notes, duration_seconds")
    .eq("contact_id", params.id)
    .order("called_at", { ascending: false });

  if (role === "caller") {
    return NextResponse.json({
      contact,
      calls: calls ?? [],
      tasks: [],
      requests: [],
    });
  }

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, due_date, completed")
    .eq("contact_id", params.id)
    .order("due_date", { ascending: true });

  const { data: requests } = await supabase
    .from("requests")
    .select("id, title, description, category, status, assigned_to, created_at")
    .eq("contact_id", params.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ contact, calls, tasks, requests });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, profile, supabase } = await getSessionWithProfile();
  if (!user) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  }
  const body = (await request.json()) as Record<string, unknown>;
  const role = profile?.role ?? "caller";

  if (role === "caller") {
    const allowedKeys = new Set(["call_status", "last_contacted_at"]);
    for (const k of Object.keys(body)) {
      if (!allowedKeys.has(k)) {
        return NextResponse.json({ error: "Μόνο call_status / last_contacted_at" }, { status: 400 });
      }
    }
    const updatePayload: { call_status?: string; last_contacted_at?: string } = {};
    if (body.call_status !== undefined) {
      updatePayload.call_status = String(body.call_status);
    }
    if (body.last_contacted_at !== undefined) {
      updatePayload.last_contacted_at = String(body.last_contacted_at);
    }
    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: "Κενό" }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("contacts")
      .update(updatePayload)
      .eq("id", params.id)
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const nm = `${String(data.first_name)} ${String(data.last_name)}`.trim();
    await logActivity({
      userId: user.id,
      action: "contact_updated",
      entityType: "contact",
      entityId: data.id,
      entityName: nm,
      details: { actor_name: firstNameFromFull(profile?.full_name) },
    });
    return NextResponse.json({ contact: data });
  }

  if (!hasMinRole(profile?.role, "manager")) {
    return forbidden();
  }
  const { data, error } = await supabase.from("contacts").update(body).eq("id", params.id).select("*").single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const nm2 = `${String(data.first_name)} ${String(data.last_name)}`.trim();
  await logActivity({
    userId: user.id,
    action: "contact_updated",
    entityType: "contact",
    entityId: data.id,
    entityName: nm2,
    details: { actor_name: firstNameFromFull(profile?.full_name) },
  });
  return NextResponse.json({ contact: data });
}

export const PUT = PATCH;

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const { user, profile } = await getSessionWithProfile();
  if (!user) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  }
  if (profile?.role !== "admin") {
    return forbidden();
  }
  const admin = createServiceClient();
  const { error } = await admin.from("contacts").delete().eq("id", params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
