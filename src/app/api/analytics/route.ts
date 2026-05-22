import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { getCampaignRollup } from "@/lib/campaign-stats";
import { nextJsonError } from "@/lib/api-resilience";
import { addWeeks, format, parseISO, startOfDay, startOfWeek, subDays } from "date-fns";
import { el } from "date-fns/locale";
import type { ActivityAction } from "@/lib/activity-log";
import { activityGreekLine, firstNameFromFull, formatTimeAgo } from "@/lib/activity-descriptions";

export const dynamic = "force-dynamic";

const NIL_GROUP_UUID = "00000000-0000-0000-0000-000000000000";

type Trend = "up" | "down" | "flat";

function trendDir(cur: number, prev: number, eps = 0.5): Trend {
  if (cur > prev + eps) return "up";
  if (cur < prev - eps) return "down";
  return "flat";
}

export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }

    const now = new Date();
    const d0 = startOfDay(now);
    const from60 = startOfDay(subDays(d0, 60));
    const from30d = startOfDay(subDays(d0, 30));
    const from30Iso = from30d.toISOString();
    const from60Iso = from60.toISOString();

    const monday0 = startOfWeek(d0, { weekStartsOn: 1 });
    const weekOrder: string[] = [];
    for (let i = 11; i >= 0; i -= 1) {
      const wstart = addWeeks(monday0, -i);
      weekOrder.push(format(wstart, "yyyy-MM-dd"));
    }
    const twelveWeeksSince = addWeeks(monday0, -11).toISOString();

    const { data: posGroup } = await supabase
      .from("contact_groups")
      .select("id")
      .ilike("name", "ΘΕΤΙΚΟΣ%")
      .single();

    const posGroupId = posGroup?.id ?? NIL_GROUP_UUID;

    const [
      totalR,
      positiveR,
      new30R,
      newPrev30R,
      oldCohortTotR,
      oldCohortPosR,
      municipalityRes,
      callStatusRes,
      groupRes,
      ageRes,
      muniPosRes,
      weeklyRes,
    ] = await Promise.all([
      supabase.from("contacts").select("*", { count: "exact", head: true }),
      supabase.from("contacts").select("*", { count: "exact", head: true }).eq("group_id", posGroupId),
      supabase.from("contacts").select("*", { count: "exact", head: true }).gte("created_at", from30Iso),
      supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .gte("created_at", from60Iso)
        .lt("created_at", from30Iso),
      supabase.from("contacts").select("*", { count: "exact", head: true }).lt("created_at", from30Iso),
      supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .lt("created_at", from30Iso)
        .eq("group_id", posGroupId),
      supabase.rpc("get_municipality_contact_counts"),
      supabase.rpc("get_call_status_distribution"),
      supabase.rpc("get_group_distribution"),
      supabase.rpc("get_age_group_distribution"),
      supabase.rpc("get_municipality_positive_breakdown"),
      supabase.rpc("get_contacts_created_weekly_counts", { since_ts: twelveWeeksSince }),
    ]);

    const contactErr =
      totalR.error ??
      positiveR.error ??
      new30R.error ??
      newPrev30R.error ??
      oldCohortTotR.error ??
      oldCohortPosR.error ??
      municipalityRes.error ??
      callStatusRes.error ??
      groupRes.error ??
      ageRes.error ??
      muniPosRes.error ??
      weeklyRes.error;

    if (contactErr) {
      return NextResponse.json({ error: contactErr.message }, { status: 400 });
    }

    const total = totalR.count ?? 0;
    const positive = positiveR.count ?? 0;
    const new30 = new30R.count ?? 0;
    const newPrev30 = newPrev30R.count ?? 0;
    const oldCohortTot = oldCohortTotR.count ?? 0;
    const oldCohortPos = oldCohortPosR.count ?? 0;

    const positivePercent = total > 0 ? Math.round((positive / total) * 1000) / 10 : 0;
    const oldRate = oldCohortTot > 0 ? Math.round((oldCohortPos / oldCohortTot) * 1000) / 10 : positivePercent;
    const positiveTrend = trendDir(positivePercent, oldRate, 0.3);
    const newContactsTrend = trendDir(new30, newPrev30, 0.01);

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

    const byAgeGroup = ((ageRes.data ?? []) as Array<{ age_group: string; count: number }>)
      .filter((r) => Number(r.count) > 0)
      .map((r) => ({
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
      const rate = tot > 0 ? Math.round((pos / tot) * 1000) / 10 : 0;
      return { name: r.municipality, total: tot, positive: pos, rate };
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

    const from = startOfDay(subDays(new Date(), 30)).toISOString();
    const { data: calls30, error: callErr } = await supabase
      .from("calls")
      .select("called_at")
      .not("called_at", "is", null)
      .gte("called_at", from);
    if (callErr) return NextResponse.json({ error: callErr.message }, { status: 400 });

    const byDay: Record<string, number> = {};
    for (const c of calls30 ?? []) {
      const ca = (c as { called_at?: string }).called_at;
      if (!ca) continue;
      const d = new Date(ca);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

    const { data: reqRows, error: reqErr } = await supabase.from("requests").select("category, status, updated_at");
    if (reqErr) return NextResponse.json({ error: reqErr.message }, { status: 400 });

    let completedReq = 0;
    let completedLast30 = 0;
    let completedPrev30 = 0;
    const catCount: Record<string, number> = {};
    for (const rq of (reqRows ?? []) as { category?: string | null; status?: string | null; updated_at?: string | null }[]) {
      const st = (rq.status ?? "").trim();
      const cat = (rq.category ?? "").trim() || "Άλλο";
      catCount[cat] = (catCount[cat] ?? 0) + 1;
      if (st === "Ολοκληρώθηκε") {
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
      uids.length > 0 ? await supabase.from("profiles").select("id, full_name").in("id", uids) : { data: [] as { id: string; full_name: string | null }[] };
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

    return NextResponse.json({
      kpis: {
        totalContacts: total,
        newContacts30d: new30,
        newContactsTrend: newContactsTrend,
        positivePercent,
        positiveTrend,
        completedRequests: completedReq,
        completedRequestsTrend: completedTrend,
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
    });
  } catch (e) {
    console.error("[api/analytics]", e);
    return nextJsonError();
  }
}
