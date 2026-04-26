import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { logActivity } from "@/lib/activity-log";
import { firstNameFromFull } from "@/lib/activity-descriptions";
import { getContactIdsForNameDay } from "@/lib/nameday-celebrating";
import { contactMatchesFuzzyGreekSearch } from "@/lib/greek-fuzzy-name";
import { nextJsonError } from "@/lib/api-resilience";
import { nextPaddedCode } from "@/lib/codes";
import { nameDayDateStringFromFirstName } from "@/lib/greek-namedays";
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
  const { user, supabase } = await getSessionWithProfile();
  if (!user) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  }

  const search =
    request.nextUrl.searchParams.get("search") ?? request.nextUrl.searchParams.get("name");
  const callStatus = request.nextUrl.searchParams.get("call_status");
  const area = request.nextUrl.searchParams.get("area");
  const municipality = request.nextUrl.searchParams.get("municipality");
  const priority = request.nextUrl.searchParams.get("priority");
  const tag = request.nextUrl.searchParams.get("tag");
  const phone = request.nextUrl.searchParams.get("phone");
  const politicalStance = request.nextUrl.searchParams.get("political_stance");
  const ageMin = request.nextUrl.searchParams.get("age_min");
  const ageMax = request.nextUrl.searchParams.get("age_max");
  const namedayToday = request.nextUrl.searchParams.get("nameday_today") === "1";
  const groupId = request.nextUrl.searchParams.get("group_id");
  const limitParam = request.nextUrl.searchParams.get("limit");
  const parsedLimit = limitParam != null ? parseInt(limitParam, 10) : NaN;
  const listLimit = Number.isFinite(parsedLimit) ? Math.min(10_000, Math.max(1, parsedLimit)) : null;

  const selectList =
    "id, first_name, last_name, phone, phone2, landline, area, municipality, call_status, priority, tags, nickname, contact_code, age, political_stance, group_id, contact_groups ( id, name, color, description, year )";

  if (namedayToday) {
    const now = new Date();
    const ids = await getContactIdsForNameDay(supabase, now.getMonth() + 1, now.getDate());
    if (ids.length === 0) {
      return NextResponse.json({ contacts: [] });
    }
    let query = supabase.from("contacts").select(selectList).in("id", ids).order("created_at", { ascending: false });
    if (callStatus) query = query.eq("call_status", callStatus);
    if (area) query = query.eq("area", area);
    if (municipality) query = query.ilike("municipality", `%${municipality}%`);
    if (priority) query = query.eq("priority", priority);
    if (tag) query = query.contains("tags", [tag]);
    if (phone) query = query.ilike("phone", `%${phone}%`);
    if (politicalStance) query = query.eq("political_stance", politicalStance);
    if (groupId) query = query.eq("group_id", groupId);
    if (ageMin) {
      const n = parseInt(ageMin, 10);
      if (Number.isFinite(n)) query = query.gte("age", n);
    }
    if (ageMax) {
      const n = parseInt(ageMax, 10);
      if (Number.isFinite(n)) query = query.lte("age", n);
    }
    if (listLimit != null) query = query.limit(listLimit);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const rows = data ?? [];
    if (search) {
      const filtered = rows.filter((c) => contactMatchesFuzzyGreekSearch(c, search));
      return NextResponse.json({ contacts: filtered });
    }
    return NextResponse.json({ contacts: rows });
  }

  let query = supabase.from("contacts").select(selectList).order("created_at", { ascending: false });

  if (callStatus) query = query.eq("call_status", callStatus);
  if (area) query = query.eq("area", area);
  if (municipality) query = query.ilike("municipality", `%${municipality}%`);
  if (priority) query = query.eq("priority", priority);
  if (tag) query = query.contains("tags", [tag]);
  if (phone) query = query.ilike("phone", `%${phone}%`);
  if (politicalStance) query = query.eq("political_stance", politicalStance);
  if (groupId) query = query.eq("group_id", groupId);
  if (ageMin) {
    const n = parseInt(ageMin, 10);
    if (Number.isFinite(n)) query = query.gte("age", n);
  }
  if (ageMax) {
    const n = parseInt(ageMax, 10);
    if (Number.isFinite(n)) query = query.lte("age", n);
  }
  if (search) {
    query = query.limit(12_000);
  } else if (listLimit != null) {
    query = query.limit(listLimit);
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
  delete body.contact_code;
  if (typeof body.phone === "string" && !body.phone.trim()) {
    body.phone = null;
  }
  for (const k of ["phone2", "landline"] as const) {
    if (typeof body[k] === "string" && !String(body[k]).trim()) {
      body[k] = null;
    }
  }
  const code = await nextPaddedCode(supabase, "contacts", "contact_code", "EP");
  body.contact_code = code;
  if (
    (body.name_day == null || body.name_day === "") &&
    body.first_name != null &&
    String(body.first_name).trim() !== ""
  ) {
    const auto = nameDayDateStringFromFirstName(String(body.first_name));
    if (auto) body.name_day = auto;
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
