import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { logActivity } from "@/lib/activity-log";
import { firstNameFromFull } from "@/lib/activity-descriptions";
import { getContactIdsForNameDay } from "@/lib/nameday-celebrating";
import { contactMatchesFuzzyGreekSearch } from "@/lib/greek-fuzzy-name";
import { nextJsonError } from "@/lib/api-resilience";

export async function GET(request: NextRequest) {
  try {
  const { user, supabase } = await getSessionWithProfile();
  if (!user) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  }

  const search = request.nextUrl.searchParams.get("search");
  const callStatus = request.nextUrl.searchParams.get("call_status");
  const area = request.nextUrl.searchParams.get("area");
  const municipality = request.nextUrl.searchParams.get("municipality");
  const priority = request.nextUrl.searchParams.get("priority");
  const tag = request.nextUrl.searchParams.get("tag");
  const namedayToday = request.nextUrl.searchParams.get("nameday_today") === "1";

  if (namedayToday) {
    const now = new Date();
    const ids = await getContactIdsForNameDay(supabase, now.getMonth() + 1, now.getDate());
    if (ids.length === 0) {
      return NextResponse.json({ contacts: [] });
    }
    let query = supabase
      .from("contacts")
      .select("id, first_name, last_name, phone, area, municipality, call_status, priority, tags, nickname")
      .in("id", ids)
      .order("created_at", { ascending: false });
    if (callStatus) query = query.eq("call_status", callStatus);
    if (area) query = query.eq("area", area);
    if (municipality) query = query.ilike("municipality", `%${municipality}%`);
    if (priority) query = query.eq("priority", priority);
    if (tag) query = query.contains("tags", [tag]);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const rows = data ?? [];
    if (search) {
      const filtered = rows.filter((c) => contactMatchesFuzzyGreekSearch(c, search));
      return NextResponse.json({ contacts: filtered });
    }
    return NextResponse.json({ contacts: rows });
  }

  let query = supabase
    .from("contacts")
    .select("id, first_name, last_name, phone, area, municipality, call_status, priority, tags, nickname")
    .order("created_at", { ascending: false });

  if (callStatus) query = query.eq("call_status", callStatus);
  if (area) query = query.eq("area", area);
  if (municipality) query = query.ilike("municipality", `%${municipality}%`);
  if (priority) query = query.eq("priority", priority);
  if (tag) query = query.contains("tags", [tag]);
  if (search) {
    query = query.limit(12_000);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (search) {
    const list = (data ?? []).filter((c) => contactMatchesFuzzyGreekSearch(c, search));
    return NextResponse.json({ contacts: list });
  }
  return NextResponse.json({ contacts: data });
  } catch (e) {
    console.error("[api/contacts GET]", e);
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
  if (typeof body.phone === "string" && !body.phone.trim()) {
    body.phone = null;
  }
  const { data, error } = await supabase.from("contacts").insert(body).select("*").single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const name = `${String(data.first_name)} ${String(data.last_name)}`.trim();
  await logActivity({
    userId: user.id,
    action: "contact_created",
    entityType: "contact",
    entityId: data.id,
    entityName: name,
    details: { actor_name: firstNameFromFull(profile?.full_name) },
  });
  return NextResponse.json({ contact: data });
  } catch (e) {
    console.error("[api/contacts POST]", e);
    return nextJsonError();
  }
}
