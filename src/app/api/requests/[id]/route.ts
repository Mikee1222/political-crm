import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { logActivity } from "@/lib/activity-log";
import { firstNameFromFull } from "@/lib/activity-descriptions";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = 'force-dynamic';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
  const { user, profile, supabase } = await getSessionWithProfile();
  if (!user) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  }
  if (!hasMinRole(profile?.role, "manager")) {
    return forbidden();
  }
  const { data, error } = await supabase
    .from("requests")
    .select("id, title, description, category, status, assigned_to, created_at, updated_at, contact_id")
    .eq("id", params.id)
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ request: data });
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
  const body = await request.json();
  const { data, error } = await supabase
    .from("requests")
    .update({ ...body, updated_at: new Date().toISOString() })
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
