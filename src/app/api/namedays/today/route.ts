import { NextResponse } from "next/server";
import { API_RACE_MS, runWithTimeCap } from "@/lib/api-resilience";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
export const dynamic = 'force-dynamic';


function monthDay(date: Date) {
  return { month: date.getMonth() + 1, day: date.getDate() };
}

function normalizeGreek(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const emptyNamedays = {
  today: [] as string[],
  tomorrow: [] as string[],
  dayAfter: [] as string[],
  celebratingContacts: [] as unknown[],
  birthdaysToday: [] as unknown[],
};

export async function GET() {
  try {
  const { user, profile, supabase } = await getSessionWithProfile();
  if (!user) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  }
  if (!hasMinRole(profile?.role, "manager")) {
    return forbidden();
  }

  return await runWithTimeCap<NextResponse>(
    API_RACE_MS,
    async () => {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const dayAfter = new Date(today);
  dayAfter.setDate(today.getDate() + 2);

  const t = monthDay(today);
  const n1 = monthDay(tomorrow);
  const n2 = monthDay(dayAfter);

  const [todayRows, tomorrowRows, dayAfterRows, contactsRows, birthdaysRows] = await Promise.all([
    supabase.from("name_days").select("names").eq("month", t.month).eq("day", t.day),
    supabase.from("name_days").select("names").eq("month", n1.month).eq("day", n1.day),
    supabase.from("name_days").select("names").eq("month", n2.month).eq("day", n2.day),
    supabase.from("contacts").select("id, first_name, last_name, nickname, phone"),
    supabase
      .from("contacts")
      .select("id, first_name, last_name, birthday, phone")
      .like("birthday", `%-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`),
  ]);

  const todayNames = (todayRows.data ?? []).flatMap((r) => r.names ?? []);
  const tomorrowNames = (tomorrowRows.data ?? []).flatMap((r) => r.names ?? []);
  const dayAfterNames = (dayAfterRows.data ?? []).flatMap((r) => r.names ?? []);

  const normalizedTodayNames = new Set(todayNames.map((n) => normalizeGreek(n)));
  const contacts = (contactsRows.data ?? []).filter((c) => {
    const fn = normalizeGreek(c.first_name ?? "");
    const nn = normalizeGreek(c.nickname ?? "");
    return normalizedTodayNames.has(fn) || (nn.length > 0 && normalizedTodayNames.has(nn));
  });

  return NextResponse.json({
    today: todayNames,
    tomorrow: tomorrowNames,
    dayAfter: dayAfterNames,
    celebratingContacts: contacts,
    birthdaysToday: birthdaysRows.data ?? [],
  });
    },
    NextResponse.json(emptyNamedays) as NextResponse,
  );
  } catch (e) {
    console.error("[api/namedays/today]", e);
    return NextResponse.json(emptyNamedays);
  }
}
