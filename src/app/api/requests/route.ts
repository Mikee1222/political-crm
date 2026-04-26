import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { logActivity } from "@/lib/activity-log";
import { firstNameFromFull } from "@/lib/activity-descriptions";
import { nextJsonError } from "@/lib/api-resilience";
import { nextPaddedCode } from "@/lib/codes";
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
  const { user, profile, supabase } = await getSessionWithProfile();
  if (!user) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  }
  if (!hasMinRole(profile?.role, "manager")) {
    return forbidden();
  }

  const status = request.nextUrl.searchParams.get("status");
  const category = request.nextUrl.searchParams.get("category");

  let query = supabase
    .from("requests")
    .select(
      "id, request_code, title, description, category, status, assigned_to, created_at, updated_at, contact_id, contacts(first_name,last_name)",
    )
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (category) query = query.eq("category", category);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const requests = (data ?? []).map((row) => {
    const contact = Array.isArray(row.contacts) ? row.contacts[0] : row.contacts;
    return { ...row, contacts: contact ?? null };
  });
  return NextResponse.json({ requests });
  } catch (e) {
    console.error("[api/requests GET]", e);
    return nextJsonError();
  }
}

export async function POST(request: NextRequest) {
  try {
  const { user, profile, supabase } = await getSessionWithProfile();
  if (!user) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  }
  if (!hasMinRole(profile?.role, "manager")) {
    return forbidden();
  }

  const body = (await request.json()) as Record<string, unknown>;
  delete body.request_code;
  const code = await nextPaddedCode(supabase, "requests", "request_code", "AIT");
  const payload = { ...body, request_code: code, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from("requests").insert(payload).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const title = String((data as { title?: string }).title ?? "Αίτημα");
  await logActivity({
    userId: user.id,
    action: "request_created",
    entityType: "request",
    entityId: (data as { id: string }).id,
    entityName: title,
    details: { actor_name: firstNameFromFull(profile?.full_name) },
  });
  return NextResponse.json({ request: data });
  } catch (e) {
    console.error("[api/requests POST]", e);
    return nextJsonError();
  }
}
