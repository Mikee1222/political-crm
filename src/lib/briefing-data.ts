import type { SupabaseClient } from "@supabase/supabase-js";
import { athensDayRange, pad2 } from "@/lib/athens-ranges";
import { listAllCalendarsEventsHttp } from "@/lib/google-calendar";
import { tallyOutcomes } from "@/lib/campaign-stats";
import { contactCelebratesNameday, resolveNamedayNamesForDay } from "@/lib/namedays";
import { getRequestStatusQueryValues, REQUEST_STATUS_OPEN } from "@/lib/request-statuses";
import { logFetchTimings, timedFetch } from "@/lib/server-timing";

function monthDay(d: Date) {
  return { month: d.getMonth() + 1, day: d.getDate() };
}

export { normalizeGreekName as normalizeGreekBrief } from "@/lib/namedays";

function startOfWeekMonday(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

const OPEN_REQUEST_QUERY_VALUES = getRequestStatusQueryValues(REQUEST_STATUS_OPEN);

export type BriefingTodayData = {
  namedays: { names: string[]; matchingContactsCount: number; contactNames: string[] };
  namedayContacts: Array<{ id: string; name: string; phone: string }>;
  overdueTop5: Array<{
    id: string;
    request_code: string | null;
    title: string | null;
    created_at: string;
    status: string | null;
  }>;
  birthdayContacts: Array<{
    id: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    birthday: string | null;
  }>;
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
  overdueTop5: [],
  birthdayContacts: [],
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

  const birthdayPattern = `%-${m}-${d}`;

  const [
    tNamedays,
    tContacts,
    tOpenReq,
    tStalled,
    tOverdueTop5,
    tBirthdays,
    tTasksDue,
    tPendingTasks,
    tWeekContacts,
    tCampaigns,
    tCallsYest,
    tOverdueCount,
    tCalendar,
  ] = await Promise.all([
    timedFetch(
      "namedays",
      supabase.from("name_days").select("names").eq("month", month).eq("day", day).maybeSingle(),
    ),
    timedFetch(
      "contacts_nameday_fields",
      supabase.from("contacts").select("id, first_name, last_name, nickname, phone, created_at"),
    ),
    timedFetch(
      "open_requests",
      supabase
        .from("requests")
        .select("id", { count: "exact", head: true })
        .in("status", OPEN_REQUEST_QUERY_VALUES),
    ),
    timedFetch(
      "stalled_requests",
      supabase
        .from("requests")
        .select("id", { count: "exact", head: true })
        .in("status", OPEN_REQUEST_QUERY_VALUES)
        .lt("created_at", weekAgo.toISOString()),
    ),
    timedFetch(
      "overdue_top5",
      supabase
        .from("requests")
        .select("id, request_code, title, created_at, status")
        .in("status", OPEN_REQUEST_QUERY_VALUES)
        .lt("created_at", weekAgo.toISOString())
        .order("created_at", { ascending: true })
        .limit(5),
    ),
    timedFetch(
      "birthdays",
      supabase
        .from("contacts")
        .select("id, first_name, last_name, phone, birthday")
        .not("birthday", "is", null)
        .ilike("birthday", birthdayPattern)
        .limit(10),
    ),
    timedFetch(
      "tasks_due_today",
      supabase
        .from("tasks")
        .select("id, title, due_date, contact_id, completed, contacts(first_name, last_name)")
        .eq("completed", false)
        .eq("due_date", todayStr),
    ),
    timedFetch(
      "pending_tasks",
      supabase.from("tasks").select("id", { count: "exact", head: true }).eq("completed", false),
    ),
    timedFetch(
      "contacts_this_week",
      supabase
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .gte("created_at", startOfWeekMonday(now).toISOString()),
    ),
    timedFetch(
      "campaigns",
      supabase
        .from("campaigns")
        .select("id, name, started_at")
        .not("started_at", "is", null)
        .order("started_at", { ascending: false }),
    ),
    timedFetch(
      "calls_yesterday",
      supabase
        .from("calls")
        .select("outcome, called_at")
        .gte("called_at", yRange.timeMin)
        .lte("called_at", yRange.timeMax),
    ),
    timedFetch(
      "overdue_request_count",
      supabase
        .from("requests")
        .select("id", { count: "exact", head: true })
        .in("status", OPEN_REQUEST_QUERY_VALUES)
        .lt("sla_due_date", todayStr),
    ),
    timedFetch(
      "calendar",
      userIdForCalendar
        ? listAllCalendarsEventsHttp(userIdForCalendar, athensDayRange(todayStr))
        : Promise.resolve({
            ok: false as const,
            code: "not_connected" as const,
            calendars_found: [] as Array<{
              id: string;
              summary: string | null;
              accessRole: string | null;
              primary?: boolean;
            }>,
            time_range: { timeMin: "", timeMax: "" },
          }),
    ),
  ]);

  logFetchTimings("dashboard", [
    tNamedays,
    tContacts,
    tOpenReq,
    tStalled,
    tOverdueTop5,
    tBirthdays,
    tTasksDue,
    tPendingTasks,
    tWeekContacts,
    tCampaigns,
    tCallsYest,
    tOverdueCount,
    tCalendar,
  ]);

  const nameDayRes = tNamedays.value;
  const allContacts = tContacts.value;
  const reqOpenRes = tOpenReq.value;
  const stalledReqRes = tStalled.value;
  const overdueTop5Res = tOverdueTop5.value;
  const birthdayRes = tBirthdays.value;
  const tasksRes = tTasksDue.value;
  const pendingTasksRes = tPendingTasks.value;
  const weekRes = tWeekContacts.value;
  const campaignsRes = tCampaigns.value;
  const callsYest = tCallsYest.value;
  const overdueCountRes = tOverdueCount.value;
  const calResult = tCalendar.value;

  if (
    nameDayRes.error ||
    allContacts.error ||
    reqOpenRes.error ||
    stalledReqRes.error ||
    overdueTop5Res.error ||
    birthdayRes.error ||
    tasksRes.error ||
    pendingTasksRes.error ||
    weekRes.error ||
    campaignsRes.error ||
    callsYest.error ||
    overdueCountRes.error
  ) {
    return { ...empty, todayYmd: todayStr, todayYmdSla: todayStr };
  }

  let calEvents: BriefingTodayData["calendar"]["events"] = [];
  let calConnected = false;
  if (userIdForCalendar && calResult && "ok" in calResult) {
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

  const overdueRequestCount = overdueCountRes.count ?? 0;

  const todayNames = resolveNamedayNamesForDay(
    (nameDayRes.data?.names as string[] | undefined) ?? [],
    month,
    day,
  );
  const contacts = (allContacts.data ?? []).filter((c) =>
    contactCelebratesNameday(
      (c as { first_name?: string }).first_name,
      (c as { nickname?: string | null }).nickname,
      todayNames,
    ),
  );
  const contactNames = contacts.map((c) => `${c.first_name} ${c.last_name}`.trim());
  const namedayContacts = contacts
    .map((c) => ({
      id: c.id as string,
      name: `${c.first_name} ${c.last_name}`.trim(),
      phone: (c as { phone?: string | null }).phone ?? "—",
    }))
    .slice(0, 50);

  const overdueTop5 = (overdueTop5Res.data ?? []) as BriefingTodayData["overdueTop5"];
  const birthdayContacts = (birthdayRes.data ?? []) as BriefingTodayData["birthdayContacts"];

  const yCalls = (callsYest.data ?? []) as Array<{ outcome: string | null }>;
  const yTally = tallyOutcomes(yCalls.map((c) => ({ outcome: c.outcome })));

  const campaignRows = (campaignsRes.data ?? []) as Array<{
    id: string;
    name: string;
    started_at: string | null;
  }>;

  // Parallel campaign call tallies (was sequential).
  const campaignTimed = await Promise.all(
    campaignRows.map((campaign) =>
      timedFetch(
        `campaign_calls_${campaign.id.slice(0, 8)}`,
        supabase.from("calls").select("outcome").eq("campaign_id", campaign.id),
      ),
    ),
  );
  if (campaignTimed.length > 0) {
    logFetchTimings(
      "dashboard",
      campaignTimed.map((t) => ({ label: t.label, ms: t.ms })),
    );
  }

  const withStats: BriefingTodayData["campaigns"] = [];
  for (let i = 0; i < campaignRows.length; i++) {
    const campaign = campaignRows[i]!;
    const callRes = campaignTimed[i]!.value;
    if (callRes.error) continue;
    const calls = (callRes.data ?? []) as Array<{ outcome: string | null }>;
    const total = calls.length;
    const positive = calls.filter((c) => c.outcome === "Positive").length;
    withStats.push({
      id: campaign.id,
      name: campaign.name,
      started_at: campaign.started_at,
      callsTotal: total,
      positive,
    });
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
    overdueTop5,
    birthdayContacts,
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
