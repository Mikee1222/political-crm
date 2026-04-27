import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { createServiceClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity-log";
import { firstNameFromFull } from "@/lib/activity-descriptions";
import { nextJsonError } from "@/lib/api-resilience";
import { nameDayDateStringFromFirstName } from "@/lib/greek-namedays";
import { resolveProfileNames } from "@/lib/profile-names";
import { fieldDiff } from "@/lib/field-diff";
export const dynamic = "force-dynamic";

function enrichContact(
  c: Record<string, unknown> | null,
  names: { created?: string | null; updated?: string | null },
) {
  if (!c) return null;
  return {
    ...c,
    created_by_name: names.created ?? null,
    updated_by_name: names.updated ?? null,
  };
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
  const crm = await checkCRMAccess();
  if (!crm.allowed) return crm.response;
  const { profile, supabase } = crm;
  const role = profile?.role ?? "caller";

  const { data: contact, error } = await supabase
    .from("contacts")
    .select("*, contact_groups ( id, name, color, description, year )")
    .eq("id", params.id)
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const raw = contact as Record<string, unknown>;
  const nameMap = await resolveProfileNames([raw?.created_by as string | null, raw?.updated_by as string | null]);
  const cb = (raw?.created_by as string | null) ?? null;
  const ub = (raw?.updated_by as string | null) ?? null;
  const contactOut = enrichContact(raw, {
    created: cb ? (nameMap.get(cb) ?? null) : null,
    updated: ub ? (nameMap.get(ub) ?? null) : null,
  });

  const { data: calls } = await supabase
    .from("calls")
    .select("id, called_at, outcome, notes, duration_seconds")
    .eq("contact_id", params.id)
    .order("called_at", { ascending: false });

  if (role === "caller") {
    return NextResponse.json({
      contact: contactOut,
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

  return NextResponse.json({ contact: contactOut, calls, tasks, requests });
  } catch (e) {
    console.error("[api/contacts/id GET]", e);
    return nextJsonError();
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
  const crm = await checkCRMAccess();
  if (!crm.allowed) return crm.response;
  const { user, profile, supabase } = crm;
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
    const { data: beforeC } = await supabase.from("contacts").select("*").eq("id", params.id).single();
    const beforeR = (beforeC ?? null) as Record<string, unknown> | null;
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("contacts")
      .update({
        ...updatePayload,
        updated_at: now,
        updated_by: user.id,
      })
      .eq("id", params.id)
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const nm = `${String(data.first_name)} ${String(data.last_name)}`.trim();
    const ch = beforeR
      ? fieldDiff(beforeR, data as Record<string, unknown>, [...Object.keys(updatePayload), "updated_at", "updated_by"])
      : {};
    const actorU = firstNameFromFull(profile?.full_name);
    await logActivity({
      userId: user.id,
      action: "contact_updated",
      entityType: "contact",
      entityId: data.id,
      entityName: nm,
      details: Object.keys(ch).length > 0 ? { actor_name: actorU, changed_fields: ch } : { actor_name: actorU },
    });
    return NextResponse.json({ contact: data });
  }

  if (!hasMinRole(profile?.role, "manager")) {
    return forbidden();
  }
  delete body.contact_code;
  delete (body as { created_by?: unknown }).created_by;
  delete (body as { updated_by?: unknown }).updated_by;
  if (!("name_day" in body) && body.first_name !== undefined) {
    const iso = nameDayDateStringFromFirstName(String(body.first_name));
    if (iso) body.name_day = iso;
  }
  const { data: beforeM } = await supabase.from("contacts").select("*").eq("id", params.id).single();
  const beforeMr = (beforeM ?? null) as Record<string, unknown> | null;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("contacts")
    .update({ ...body, updated_at: now, updated_by: user.id } as Record<string, unknown>)
    .eq("id", params.id)
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const nm2 = `${String(data.first_name)} ${String(data.last_name)}`.trim();
  const ch2 = beforeMr ? fieldDiff(beforeMr, data as Record<string, unknown>) : {};
  const actM = firstNameFromFull(profile?.full_name);
  await logActivity({
    userId: user.id,
    action: "contact_updated",
    entityType: "contact",
    entityId: data.id,
    entityName: nm2,
    details: Object.keys(ch2).length > 0 ? { actor_name: actM, changed_fields: ch2 } : { actor_name: actM },
  });
  return NextResponse.json({ contact: data });
  } catch (e) {
    console.error("[api/contacts/id PATCH]", e);
    return nextJsonError();
  }
}

export const PUT = PATCH;

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
  const crm = await checkCRMAccess();
  if (!crm.allowed) return crm.response;
  const { profile } = crm;
  if (profile?.role !== "admin") {
    return forbidden();
  }
  const admin = createServiceClient();
  const { error } = await admin.from("contacts").delete().eq("id", params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/contacts/id DELETE]", e);
    return nextJsonError();
  }
}
