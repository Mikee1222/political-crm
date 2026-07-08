import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { getCampaignRollup } from "@/lib/campaign-stats";
import { nextJsonError } from "@/lib/api-resilience";
import { addWeeks, format, parseISO, startOfWeek, subDays } from "date-fns";
import { el } from "date-fns/locale";
import type { ActivityAction } from "@/lib/activity-log";
import { activityGreekLine, firstNameFromFull, formatTimeAgo } from "@/lib/activity-descriptions";
import {
  isOpenRequestStatus,
  normalizeRequestStatus,
  REQUEST_STATUS_COMPLETED_SUCCESS,
} from "@/lib/request-statuses";
import { ATHENS_TZ, formatDateAthens } from "@/lib/date-format";
import { getContactIdsForNameDay } from "@/lib/nameday-celebrating";
import { resolveNamedayNamesForDay } from "@/lib/namedays";

export const dynamic = "force-dynamic";

type Trend = "up" | "down" | "flat";

function trendDir(cur: number, prev: number, eps = 0.5): Trend {
  if (cur > prev + eps) return "up";
  if (cur < prev - eps) return "down";
  return "flat";
}

function pct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 1000) / 10 : 0;
}

/** Athens calendar YMD for an instant. */
function ymdAthens(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ATHENS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Start of Athens calendar day as UTC Date (for timestamptz / timestamp comparisons). */
function athensDayStartUtc(ymd: string): Date {
  // Probe noon UTC to get the correct Athens offset for that calendar day (DST-safe).
  const probe = new Date(`${ymd}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ATHENS_TZ,
    timeZoneName: "longOffset",
  }).formatToParts(probe);
  const tz = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+03:00";
  const m = tz.match(/GMT([+-]\d{2}):(\d{2})/);
  const off = m ? `${m[1]}:${m[2]}` : "+03:00";
  return new Date(`${ymd}T00:00:00${off}`);
}

type RangeKey = "7d" | "30d" | "90d" | "6mo" | "1yr" | "custom";

function parseRange(req: NextRequest): {
  key: RangeKey;
  fromIso: string;
  toIso: string;
  days: number;
  months: number;
  weeks: number;
} {
  const sp = req.nextUrl.searchParams;
  const key = (sp.get("range") ?? "30d") as RangeKey;
  const todayYmd = ymdAthens(new Date());
  const todayStart = athensDayStartUtc(todayYmd);
  const tomorrowStart = athensDayStartUtc(
    ymdAthens(new Date(todayStart.getTime() + 36 * 3600 * 1000)),
  );

  let days = 30;
  if (key === "7d") days = 7;
  else if (key === "30d") days = 30;
  else if (key === "90d") days = 90;
  else if (key === "6mo") days = 183;
  else if (key === "1yr") days = 365;
  else if (key === "custom") {
    const from = sp.get("from");
    const to = sp.get("to");
    if (from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
      const fromD = athensDayStartUtc(from);
      const toExclusive = athensDayStartUtc(
        ymdAthens(new Date(athensDayStartUtc(to).getTime() + 36 * 3600 * 1000)),
      );
      const span = Math.max(1, Math.round((toExclusive.getTime() - fromD.getTime()) / 86400000));
      return {
        key,
        fromIso: fromD.toISOString(),
        toIso: toExclusive.toISOString(),
        days: span,
        months: Math.max(1, Math.ceil(span / 30)),
        weeks: Math.max(1, Math.ceil(span / 7)),
      };
    }
  }

  const fromD = athensDayStartUtc(ymdAthens(subDays(todayStart, days)));
  return {
    key,
    fromIso: fromD.toISOString(),
    toIso: tomorrowStart.toISOString(),
    days,
    months: Math.max(1, Math.ceil(days / 30)),
    weeks: Math.max(1, Math.min(52, Math.ceil(days / 7))),
  };
}

function addCalendarDaysAthens(ymd: string, delta: number): string {
  const d = athensDayStartUtc(ymd);
  return ymdAthens(new Date(d.getTime() + delta * 86400000 + 12 * 3600000));
}

export async function GET(req: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }

    const range = parseRange(req);
    const from30Iso = athensDayStartUtc(ymdAthens(subDays(new Date(), 30))).toISOString();
    const from60Iso = athensDayStartUtc(ymdAthens(subDays(new Date(), 60))).toISOString();
    const from30d = new Date(from30Iso);
    const from60 = new Date(from60Iso);

    const monday0 = startOfWeek(new Date(), { weekStartsOn: 1 });
    const weekOrder: string[] = [];
    for (let i = 11; i >= 0; i -= 1) {
      const wstart = addWeeks(monday0, -i);
      weekOrder.push(format(wstart, "yyyy-MM-dd"));
    }
    const twelveWeeksSince = addWeeks(monday0, -11).toISOString();

    // Run `NOTIFY pgrst, 'reload schema';` in Supabase SQL editor if RPC calls fail (schema cache).

    const [
      totalR,
      groupKpisR,
      new30R,
      newPrev30R,
      municipalityRes,
      callStatusRes,
      groupRes,
      ageRes,
      muniPosRes,
      weeklyRes,
      requestsByMonthR,
      requestsByAssigneeR,
      requestsByStatusR,
      requestsBySourceR,
      callsByUserR,
      callsByOutcomeR,
      topGroupsR,
      fullMuniR,
      activityTimelineR,
      positiveByMonthR,
      callsLastR,
      callsPrevR,
      reqMetaR,
    ] = await Promise.all([
      supabase.from("contacts").select("*", { count: "exact", head: true }),
      supabase.rpc("get_analytics_group_kpis"),
      supabase.from("contacts").select("*", { count: "exact", head: true }).gte("created_at", from30Iso),
      supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .gte("created_at", from60Iso)
        .lt("created_at", from30Iso),
      supabase.rpc("get_municipality_contact_counts", {}),
      supabase.rpc("get_call_status_distribution", {}),
      supabase.rpc("get_group_distribution", {}),
      supabase.rpc("get_age_group_distribution", {}),
      supabase.rpc("get_municipality_positive_breakdown", {}),
      supabase.rpc("get_contacts_created_weekly_counts", { since_ts: twelveWeeksSince }),
      supabase.rpc("get_requests_by_month", { p_months: Math.max(range.months, 12) }),
      supabase.rpc("get_requests_by_assignee"),
      supabase.rpc("get_requests_by_status"),
      supabase.rpc("get_requests_by_source"),
      supabase.rpc("get_calls_by_user"),
      supabase.rpc("get_calls_by_outcome"),
      supabase.rpc("get_top_groups", { p_limit: 10 }),
      supabase.rpc("get_full_municipality_breakdown"),
      supabase.rpc("get_weekly_activity_timeline", { p_weeks: Math.max(range.weeks, 26) }),
      supabase.rpc("get_positive_members_by_month", { p_months: Math.max(range.months, 12) }),
      supabase
        .from("calls")
        .select("*", { count: "exact", head: true })
        .gte("called_at", from30Iso),
      supabase
        .from("calls")
        .select("*", { count: "exact", head: true })
        .gte("called_at", from60Iso)
        .lt("called_at", from30Iso),
      supabase.from("requests").select("category, status, updated_at"),
    ]);

    const rpcErr =
      totalR.error ??
      groupKpisR.error ??
      new30R.error ??
      newPrev30R.error ??
      municipalityRes.error ??
      callStatusRes.error ??
      groupRes.error ??
      ageRes.error ??
      muniPosRes.error ??
      weeklyRes.error ??
      requestsByMonthR.error ??
      requestsByAssigneeR.error ??
      requestsByStatusR.error ??
      requestsBySourceR.error ??
      callsByUserR.error ??
      callsByOutcomeR.error ??
      topGroupsR.error ??
      fullMuniR.error ??
      activityTimelineR.error ??
      positiveByMonthR.error ??
      callsLastR.error ??
      callsPrevR.error ??
      reqMetaR.error;

    if (rpcErr) {
      return NextResponse.json({ error: rpcErr.message }, { status: 400 });
    }

    const total = totalR.count ?? 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gk = ((groupKpisR.data ?? []) as any[])[0] as
      | {
          positive_count?: number;
          deceased_count?: number;
          no_number_count?: number;
          negative_count?: number;
          no_phone_count?: number;
        }
      | undefined;

    const positive = Number(gk?.positive_count ?? 0);
    const deceased = Number(gk?.deceased_count ?? 0);
    const noNumber = Number(gk?.no_number_count ?? 0);
    const negative = Number(gk?.negative_count ?? 0);
    const noPhone = Number(gk?.no_phone_count ?? 0);

    const new30 = new30R.count ?? 0;
    const newPrev30 = newPrev30R.count ?? 0;
    const positivePercent = pct(positive, total);
    const newContactsTrend = trendDir(new30, newPrev30, 0.01);

    const calls30 = callsLastR.count ?? 0;
    const callsPrev30 = callsPrevR.count ?? 0;
    const callsTrend = trendDir(calls30, callsPrev30, 0.01);

    const municipalityRows = (municipalityRes.data ?? []) as Array<{ municipality: string; count: number }>;
    const topMunicipalities = municipalityRows.map((r) => ({
      name: r.municipality,
      value: Number(r.count),
    }));
    const top10Municipalities = topMunicipalities.slice(0, 10);

    const byCallStatus = ((callStatusRes.data ?? []) as Array<{ call_status: string; count: number }>).map(
      (r) => ({
        name: r.call_status,
        value: Number(r.count),
      }),
    );

    const byPoliticalStance = ((groupRes.data ?? []) as Array<{ group_name: string; count: number }>)
      .filter((r) => Number(r.count) > 0)
      .map((r) => ({
        name: r.group_name,
        value: Number(r.count),
      }));

    const byAgeGroup = ((ageRes.data ?? []) as Array<{ age_group: string; count: number }>).map((r) => ({
      name: r.age_group,
      value: Number(r.count),
    }));

    const muniPositiveRows = ((muniPosRes.data ?? []) as Array<{
      municipality: string;
      total: number;
      positive: number;
    }>).map((r) => {
      const tot = Number(r.total);
      const pos = Number(r.positive);
      return { name: r.municipality, total: tot, positive: pos, rate: pct(pos, tot) };
    });

    const weekMap = new Map<string, number>();
    for (const id of weekOrder) weekMap.set(id, 0);
    for (const row of (weeklyRes.data ?? []) as Array<{ week_start: string; count: number }>) {
      const key = String(row.week_start).slice(0, 10);
      if (weekMap.has(key)) weekMap.set(key, Number(row.count));
    }
    const contactsPerWeek = weekOrder.map((id) => ({
      weekStart: id,
      label: format(parseISO(id), "d MMM", { locale: el }),
      count: weekMap.get(id) ?? 0,
    }));

    const { data: callsRange, error: callErr } = await supabase
      .from("calls")
      .select("called_at")
      .not("called_at", "is", null)
      .gte("called_at", range.fromIso)
      .lt("called_at", range.toIso);
    if (callErr) return NextResponse.json({ error: callErr.message }, { status: 400 });

    const byDay: Record<string, number> = {};
    for (const c of callsRange ?? []) {
      const ca = (c as { called_at?: string }).called_at;
      if (!ca) continue;
      const k = ymdAthens(new Date(ca.includes("T") || ca.includes("Z") ? ca : `${ca}Z`));
      byDay[k] = (byDay[k] ?? 0) + 1;
    }
    const callsOverTime = Object.keys(byDay)
      .sort()
      .map((k) => ({ date: k, count: byDay[k]! }));

    const { data: camps, error: campErr } = await supabase
      .from("campaigns")
      .select("id, name, created_at")
      .order("created_at", { ascending: true });
    if (campErr) return NextResponse.json({ error: campErr.message }, { status: 400 });

    const campaignSuccess = await Promise.all(
      (camps ?? []).map(async (row) => {
        const { id, name } = row as { id: string; name: string };
        const rollup = await getCampaignRollup(supabase, id);
        const t = rollup.stats.total;
        const p = rollup.stats.positive;
        const rate = t > 0 ? Math.round((p / t) * 1000) / 10 : 0;
        return { id, name, totalCalls: t, positive: p, successRate: rate };
      }),
    );

    let completedReq = 0;
    let completedLast30 = 0;
    let completedPrev30 = 0;
    let totalRequests = 0;
    let openRequests = 0;
    const catCount: Record<string, number> = {};
    for (const rq of (reqMetaR.data ?? []) as {
      category?: string | null;
      status?: string | null;
      updated_at?: string | null;
    }[]) {
      totalRequests += 1;
      const st = (rq.status ?? "").trim();
      const cat = (rq.category ?? "").trim() || "Άλλο";
      catCount[cat] = (catCount[cat] ?? 0) + 1;
      if (isOpenRequestStatus(st) || normalizeRequestStatus(st) === "Ανοικτό") {
        openRequests += 1;
      }
      if (normalizeRequestStatus(st) === REQUEST_STATUS_COMPLETED_SUCCESS) {
        completedReq += 1;
        const u = rq.updated_at ? new Date(rq.updated_at) : null;
        if (u && u >= from30d) completedLast30 += 1;
        else if (u && u >= from60 && u < from30d) completedPrev30 += 1;
      }
    }
    const requestCategories = Object.entries(catCount)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));

    const completedTrend = trendDir(completedLast30, completedPrev30, 0.01);

    const { data: actRows } = await supabase
      .from("activity_log")
      .select("id, user_id, action, entity_name, details, created_at")
      .order("created_at", { ascending: false })
      .limit(14);

    const actList = (actRows ?? []) as Array<{
      id: string;
      user_id: string | null;
      action: string;
      entity_name: string | null;
      details: Record<string, unknown> | null;
      created_at: string;
    }>;
    const uids = [...new Set(actList.map((r) => r.user_id).filter(Boolean))] as string[];
    const { data: profs } =
      uids.length > 0
        ? await supabase.from("profiles").select("id, full_name").in("id", uids)
        : { data: [] as { id: string; full_name: string | null }[] };
    const pmap = new Map((profs ?? []).map((p) => [p.id, p.full_name] as [string, string | null]));

    const activityFeed = actList.map((r) => {
      const fullName = r.user_id ? pmap.get(r.user_id) ?? null : null;
      const first = firstNameFromFull(
        (r.details as { actor_name?: string } | null)?.actor_name
          ? String((r.details as { actor_name?: string }).actor_name)
          : fullName,
      );
      const text = activityGreekLine({
        action: r.action as ActivityAction,
        actorFirstName: first,
        entityName: r.entity_name ?? "—",
      });
      return { id: r.id, text, timeAgo: formatTimeAgo(r.created_at) };
    });

    const monthLabel = (d: string) => {
      try {
        return format(parseISO(String(d).slice(0, 10)), "MMM yy", { locale: el });
      } catch {
        return String(d).slice(0, 7);
      }
    };

    const requestsByMonth = ((requestsByMonthR.data ?? []) as Array<{ month_start: string; count: number }>).map(
      (r) => ({
        monthStart: String(r.month_start).slice(0, 10),
        label: monthLabel(String(r.month_start)),
        count: Number(r.count),
      }),
    );

    const requestsByAssignee = (
      (requestsByAssigneeR.data ?? []) as Array<{ assignee: string; count: number }>
    ).map((r) => ({ name: r.assignee, value: Number(r.count) }));

    const requestsByStatus = ((requestsByStatusR.data ?? []) as Array<{ status: string; count: number }>).map(
      (r) => ({
        name: normalizeRequestStatus(r.status) || r.status,
        value: Number(r.count),
      }),
    );

    const requestsBySource = ((requestsBySourceR.data ?? []) as Array<{ source: string; count: number }>).map(
      (r) => ({ name: r.source, value: Number(r.count) }),
    );

    const callsByUser = ((callsByUserR.data ?? []) as Array<{ user_label: string; count: number }>).map(
      (r) => ({
        name: r.user_label,
        value: Number(r.count),
      }),
    );

    const callsByOutcome = ((callsByOutcomeR.data ?? []) as Array<{ outcome: string; count: number }>).map(
      (r) => ({
        name: r.outcome,
        value: Number(r.count),
      }),
    );

    const topGroups = (
      (topGroupsR.data ?? []) as Array<{ group_name: string; color: string | null; count: number }>
    ).map((r) => ({
      name: r.group_name,
      value: Number(r.count),
      color: r.color,
    }));

    const municipalityBreakdown = (
      (fullMuniR.data ?? []) as Array<{
        municipality: string;
        total: number;
        positive: number;
        negative: number;
        deceased: number;
        requests: number;
        positive_pct: number;
      }>
    ).map((r) => ({
      name: r.municipality,
      total: Number(r.total),
      positive: Number(r.positive),
      negative: Number(r.negative),
      deceased: Number(r.deceased),
      requests: Number(r.requests),
      positivePct: Number(r.positive_pct),
    }));

    const activityTimeline = (
      (activityTimelineR.data ?? []) as Array<{
        week_start: string;
        contacts: number;
        requests: number;
        calls: number;
      }>
    ).map((r) => ({
      weekStart: String(r.week_start).slice(0, 10),
      label: format(parseISO(String(r.week_start).slice(0, 10)), "d MMM", { locale: el }),
      contacts: Number(r.contacts),
      requests: Number(r.requests),
      calls: Number(r.calls),
    }));

    const positiveByMonth = (
      (positiveByMonthR.data ?? []) as Array<{
        month_start: string;
        new_members: number;
        cumulative: number;
      }>
    ).map((r) => ({
      monthStart: String(r.month_start).slice(0, 10),
      label: monthLabel(String(r.month_start)),
      newMembers: Number(r.new_members),
      cumulative: Number(r.cumulative),
    }));

    // Nameday summary: today + week calendar names (single contact scan for today count)
    const now = new Date();
    const todayYmd = ymdAthens(now);
    const [, tm, td] = todayYmd.split("-").map((x) => parseInt(x, 10));
    const todayIds = await getContactIdsForNameDay(supabase, tm!, td!);

    const weekday = new Date(`${todayYmd}T12:00:00+03:00`).getDay();
    const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
    const weekDayPairs: Array<{ month: number; day: number }> = [];
    for (let i = 0; i < 7; i += 1) {
      const ymd = addCalendarDaysAthens(todayYmd, mondayOffset + i);
      const [, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
      weekDayPairs.push({ month: m!, day: d! });
    }
    const weekNames: string[] = [];
    for (const { month, day } of weekDayPairs) {
      const { data: nd } = await supabase.from("name_days").select("names").eq("month", month).eq("day", day);
      const dayNames = resolveNamedayNamesForDay(
        (nd ?? []).flatMap((r) => (r as { names?: string[] }).names ?? []),
        month,
        day,
      );
      for (const n of dayNames) {
        if (!weekNames.includes(n)) weekNames.push(n);
      }
    }

    const { data: todayNd } = await supabase
      .from("name_days")
      .select("names")
      .eq("month", tm!)
      .eq("day", td!);
    const todayNames = resolveNamedayNamesForDay(
      (todayNd ?? []).flatMap((r) => (r as { names?: string[] }).names ?? []),
      tm!,
      td!,
    );
    // Week contact count ≈ today for now (full week scan of all contacts is too heavy);
    // link to /namedays for exploration.
    const weekContactCount = todayIds.length;

    return NextResponse.json({
      range: {
        key: range.key,
        from: range.fromIso,
        to: range.toIso,
        days: range.days,
      },
      meta: {
        positiveSource: "contact_group_members ∩ group name ΘΕΤΙΚΟΣ (accent-insensitive exact)",
        positiveByMonthSource:
          "contact_group_members.created_at for ΘΕΤΙΚΟΣ (bulk import may cluster in one month)",
        requestsBySourceNote:
          "requests has no source column — attributed via linked contact.source",
        callsUserField: "calls.marked_by_user_id → profiles.full_name (fallback marked_by_name)",
        completedTrendWindows: {
          last30: completedLast30,
          prev30: completedPrev30,
        },
      },
      kpis: {
        totalContacts: total,
        newContacts30d: new30,
        newContactsTrend,
        positiveCount: positive,
        positivePercent,
        positiveTrend: "flat" as Trend,
        completedRequests: completedReq,
        completedRequestsTrend: completedTrend,
        totalRequests,
        openRequests,
        calls30d: calls30,
        callsTrend,
        noPhone,
        noPhonePercent: pct(noPhone, total),
        deceased,
        deceasedPercent: pct(deceased, total),
        noNumber,
        noNumberPercent: pct(noNumber, total),
        negative,
        negativePercent: pct(negative, total),
      },
      byMunicipality: topMunicipalities,
      top10Municipalities,
      byPoliticalStance,
      byCallStatus,
      byAgeGroup,
      callsOverTime,
      campaignSuccess,
      contactsPerWeek,
      requestCategories,
      muniPositiveRows,
      activityFeed,
      requestsByStatus,
      requestsByMonth,
      requestsByAssignee,
      callsByUser,
      callsByOutcome,
      positiveByMonth,
      topGroups,
      requestsBySource,
      municipalityBreakdown,
      activityTimeline,
      namedaySummary: {
        todayLabel: formatDateAthens(now, { day: "numeric", month: "long", year: "numeric" }),
        todayNames,
        todayContactCount: todayIds.length,
        weekNames,
        weekContactCount,
        link: "/namedays",
        contactsTodayLink: "/contacts?nameday_today=1",
      },
    });
  } catch (e) {
    console.error("[api/analytics]", e);
    return nextJsonError();
  }
}
