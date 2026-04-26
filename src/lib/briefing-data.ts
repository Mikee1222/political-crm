import type { SupabaseClient } from "@supabase/supabase-js";
import { athensDayRange, pad2 } from "@/lib/athens-ranges";
import { listAllCalendarsEventsHttp } from "@/lib/google-calendar";
import { tallyOutcomes } from "@/lib/campaign-stats";

function monthDay(d: Date) {
  return { month: d.getMonth() + 1, day: d.getDate() };
}

export function normalizeGreekBrief(value: string) {
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

export type BriefingTodayData = {
  namedays: { names: string[]; matchingContactsCount: number; contactNames: string[] };
  namedayContacts: Array<{ name: string; phone: string }>;
  tasksDueToday: Array<{ id: string; title: string; contact: string }>;
  pendingTasksCount: number;
  openRequestsCount: number;
  contactsAddedThisWeek: number;
  campaigns: Array<{ id: string; name: string; started_at: string | null; callsTotal: number; positive: number }>;
  calendar: { connected: boolean; events: Array<{ title: string | null; start: string | null; end: string | null }> };
  stalledOpenRequestCount: number;
  callsYesterday: { total: number; positive: number; negative: number; noAnswer: number };
  overdueRequestCount: number;
  /** YYYY-MM-DD in local calendar terms for display */
  todayYmd: string;
  /** YYYY-MM-DD for SLA compare */
  todayYmdSla: string;
};

const empty: BriefingTodayData = {
  namedays: { names: [], matchingContactsCount: 0, contactNames: [] },
  namedayContacts: [],
  tasksDueToday: [],
  pendingTasksCount: 0,
  openRequestsCount: 0,
  contactsAddedThisWeek: 0,
  campaigns: [],
  calendar: { connected: false, events: [] },
  stalledOpenRequestCount: 0,
  callsYesterday: { total: 0, positive: 0, negative: 0, noAnswer: 0 },
  overdueRequestCount: 0,
  todayYmd: "",
  todayYmdSla: "",
};

/**
 * @param userIdForCalendar - χρήστης με google_tokens (για λίστα ημερολογίου). null = χωρίς calendar.
 */
export async function fetchBriefingTodayData(
  supabase: SupabaseClient,
  userIdForCalendar: string | null,
): Promise<BriefingTodayData> {
  const now = new Date();
  const { month, day } = monthDay(now);
  const y = now.getFullYear();
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  const todayStr = `${y}-${m}-${d}`;

  const yest = new Date(now);
  yest.setDate(yest.getDate() - 1);
  const ymdY = `${yest.getFullYear()}-${pad2(yest.getMonth() + 1)}-${pad2(yest.getDate())}`;
  const yRange = athensDayRange(ymdY);
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const [nameDayRes, allContacts, reqOpenRes, stalledReqRes, tasksRes, pendingTasksRes, weekRes, campaignsRes, callsYest] =
    await Promise.all([
      supabase.from("name_days").select("names").eq("month", month).eq("day", day).maybeSingle(),
      supabase.from("contacts").select("id, first_name, last_name, nickname, phone, created_at"),
      supabase
        .from("requests")
        .select("id", { count: "exact", head: true })
        .in("status", ["Νέο", "Σε εξέλιξη"]),
      supabase
        .from("requests")
        .select("id", { count: "exact", head: true })
        .in("status", ["Νέο", "Σε εξέλιξη"])
        .lt("created_at", weekAgo.toISOString()),
      supabase
        .from("tasks")
        .select("id, title, due_date, contact_id, completed, contacts(first_name, last_name)")
        .eq("completed", false)
        .eq("due_date", todayStr),
      supabase.from("tasks").select("id", { count: "exact", head: true }).eq("completed", false),
      supabase
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .gte("created_at", startOfWeekMonday(now).toISOString()),
      supabase.from("campaigns").select("id, name, started_at").not("started_at", "is", null).order("started_at", { ascending: false }),
      supabase
        .from("calls")
        .select("outcome, called_at")
        .gte("called_at", yRange.timeMin)
        .lte("called_at", yRange.timeMax),
    ]);

  if (
    nameDayRes.error ||
    allContacts.error ||
    reqOpenRes.error ||
    stalledReqRes.error ||
    tasksRes.error ||
    pendingTasksRes.error ||
    weekRes.error ||
    campaignsRes.error ||
    callsYest.error
  ) {
    return { ...empty, todayYmd: todayStr, todayYmdSla: todayStr };
  }

  let calEvents: BriefingTodayData["calendar"]["events"] = [];
  let calConnected = false;
  if (userIdForCalendar) {
    const calResult = await listAllCalendarsEventsHttp(userIdForCalendar, athensDayRange(todayStr));
    calEvents =
      calResult.ok && "events" in calResult
        ? calResult.events.map((e) => ({
            title: e.title,
            start: e.start ?? null,
            end: e.end ?? null,
          }))
        : [];
    calConnected = Boolean(calResult.ok);
  }

  const { count: overdueCount, error: overdueErr } = await supabase
    .from("requests")
    .select("id", { count: "exact", head: true })
    .in("status", ["Νέο", "Σε εξέλιξη"])
    .lt("sla_due_date", todayStr);
  const overdueRequestCount = !overdueErr ? overdueCount ?? 0 : 0;

  const todayNames: string[] = (nameDayRes.data?.names as string[] | undefined) ?? [];
  const normalizedTodayNames = new Set(todayNames.map((n) => normalizeGreekBrief(n)));
  const contacts = (allContacts.data ?? []).filter((c) => {
    const fn = normalizeGreekBrief(c.first_name ?? "");
    const nn = normalizeGreekBrief(c.nickname ?? "");
    return normalizedTodayNames.has(fn) || (nn.length > 0 && normalizedTodayNames.has(nn));
  });
  const contactNames = contacts.map((c) => `${c.first_name} ${c.last_name}`.trim());
  const namedayContacts = contacts
    .map((c) => ({
      name: `${c.first_name} ${c.last_name}`.trim(),
      phone: (c as { phone?: string | null }).phone ?? "—",
    }))
    .slice(0, 50);

  const yCalls = (callsYest.data ?? []) as Array<{ outcome: string | null }>;
  const yTally = tallyOutcomes(yCalls.map((c) => ({ outcome: c.outcome })));

  const campaignRows = (campaignsRes.data ?? []) as Array<{ id: string; name: string; started_at: string | null }>;
  const withStats: BriefingTodayData["campaigns"] = [];
  for (const campaign of campaignRows) {
    try {
      const { data: callRows, error: callErr } = await supabase.from("calls").select("outcome").eq("campaign_id", campaign.id);
      if (callErr) continue;
      const calls = (callRows ?? []) as Array<{ outcome: string | null }>;
      const total = calls.length;
      const positive = calls.filter((c) => c.outcome === "Positive").length;
      withStats.push({
        id: campaign.id,
        name: campaign.name,
        started_at: campaign.started_at,
        callsTotal: total,
        positive,
      });
    } catch {
      /* skip */
    }
  }

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

  return {
    namedays: {
      names: todayNames,
      matchingContactsCount: contacts.length,
      contactNames: contactNames.slice(0, 20),
    },
    namedayContacts,
    tasksDueToday,
    pendingTasksCount: pendingTasksRes.count ?? 0,
    openRequestsCount: reqOpenRes.count ?? 0,
    contactsAddedThisWeek: weekRes.count ?? 0,
    campaigns: withStats,
    calendar: { connected: calConnected, events: calEvents.slice(0, 30) },
    stalledOpenRequestCount: stalledReqRes.count ?? 0,
    callsYesterday: {
      total: yTally.total,
      positive: yTally.positive,
      negative: yTally.negative,
      noAnswer: yTally.noAnswer,
    },
    overdueRequestCount,
    todayYmd: todayStr,
    todayYmdSla: todayStr,
  };
}

/** Για cron/telegram: πρώτος χρήστης με Google tokens ή BRIEFING_GOOGLE_USER_ID. */
export async function resolveCalendarUserId(supabase: SupabaseClient): Promise<string | null> {
  const env = process.env.BRIEFING_GOOGLE_USER_ID?.trim();
  if (env) return env;
  const { data, error } = await supabase.from("google_tokens").select("user_id").limit(1).maybeSingle();
  if (error || !data) return null;
  return (data as { user_id: string }).user_id;
}
