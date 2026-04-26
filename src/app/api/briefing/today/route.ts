import { NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";

function monthDay(d: Date) {
  return { month: d.getMonth() + 1, day: d.getDate() };
}

function normalizeGreek(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function startOfWeekMonday(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

export async function GET() {
  const { user, profile, supabase } = await getSessionWithProfile();
  if (!user) return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  if (!hasMinRole(profile?.role, "manager")) return forbidden();

  const now = new Date();
  const { month, day } = monthDay(now);
  const y = now.getFullYear();
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  const todayStr = `${y}-${m}-${d}`;

  const [
    nameDayRes,
    allContacts,
    reqOpenRes,
    tasksRes,
    weekRes,
    campaignsRes,
  ] = await Promise.all([
    supabase.from("name_days").select("names").eq("month", month).eq("day", day).maybeSingle(),
    supabase.from("contacts").select("id, first_name, last_name, nickname, phone, created_at"),
    supabase
      .from("requests")
      .select("id", { count: "exact", head: true })
      .in("status", ["Νέο", "Σε εξέλιξη"]),
    supabase
      .from("tasks")
      .select("id, title, due_date, contact_id, completed, contacts(first_name, last_name)")
      .eq("completed", false)
      .eq("due_date", todayStr),
    supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startOfWeekMonday(now).toISOString()),
    supabase.from("campaigns").select("id, name, started_at").not("started_at", "is", null).order("started_at", { ascending: false }),
  ]);

  const todayNames: string[] = (nameDayRes.data?.names as string[] | undefined) ?? [];
  const normalizedTodayNames = new Set(todayNames.map((n) => normalizeGreek(n)));
  const contacts = (allContacts.data ?? []).filter((c) => {
    const fn = normalizeGreek(c.first_name ?? "");
    const nn = normalizeGreek(c.nickname ?? "");
    return normalizedTodayNames.has(fn) || (nn.length > 0 && normalizedTodayNames.has(nn));
  });
  const contactNames = contacts.map((c) => `${c.first_name} ${c.last_name}`.trim());

  const campaignRows = (campaignsRes.data ?? []) as Array<{ id: string; name: string; started_at: string | null }>;
  const withStats = await Promise.all(
    campaignRows.map(async (campaign) => {
      const { data: callRows } = await supabase.from("calls").select("outcome").eq("campaign_id", campaign.id);
      const calls = (callRows ?? []) as Array<{ outcome: string | null }>;
      const total = calls.length;
      const positive = calls.filter((c) => c.outcome === "Positive").length;
      return {
        id: campaign.id,
        name: campaign.name,
        started_at: campaign.started_at,
        callsTotal: total,
        positive,
      };
    }),
  );

  const tasks = (tasksRes.data ?? []) as Array<{
    id: string;
    title: string;
    due_date: string | null;
    contacts: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
  }>;
  const tasksDueToday = tasks.map((t) => {
    const c = t.contacts;
    const rel = Array.isArray(c) ? c[0] : c;
    return {
      id: t.id,
      title: t.title,
      contact: rel ? `${rel.first_name} ${rel.last_name}` : "—",
    };
  });

  return NextResponse.json({
    namedays: {
      names: todayNames,
      matchingContactsCount: contacts.length,
      contactNames: contactNames.slice(0, 20),
    },
    tasksDueToday,
    openRequestsCount: reqOpenRes.count ?? 0,
    contactsAddedThisWeek: weekRes.count ?? 0,
    campaigns: withStats,
  });
}
