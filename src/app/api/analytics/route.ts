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

function ageBucket(age: number | null | undefined): string {
  if (age == null || !Number.isFinite(age)) return "Άγνωστο";
  if (age < 30) return "<30";
  if (age <= 45) return "30–45";
  if (age <= 60) return "45–60";
  return "60+";
}

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

    const { data: allContacts, error: cErr } = await supabase
      .from("contacts")
      .select("municipality, political_stance, call_status, age, created_at");
    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 });

    type CRow = {
      municipality?: string | null;
      political_stance?: string | null;
      call_status?: string | null;
      age?: number | null;
      created_at?: string | null;
    };

    const rows = (allContacts ?? []) as CRow[];
    let total = 0;
    let positive = 0;
    let new30 = 0;
    let newPrev30 = 0;
    let oldCohortPos = 0;
    let oldCohortTot = 0;

    const muni: Record<string, number> = {};
    const muniPos: Record<string, number> = {};
    const stance: Record<string, number> = {};
    const callSt: Record<string, number> = {};
    const ages: Record<string, number> = { "<30": 0, "30–45": 0, "45–60": 0, "60+": 0, Άγνωστο: 0 };

    const monday0 = startOfWeek(d0, { weekStartsOn: 1 });
    const weekOrder: string[] = [];
    const weekCounts: Record<string, number> = {};
    for (let i = 11; i >= 0; i -= 1) {
      const wstart = addWeeks(monday0, -i);
      const id = format(wstart, "yyyy-MM-dd");
      weekOrder.push(id);
      weekCounts[id] = 0;
    }

    for (const r of rows) {
      total += 1;
      const cs = (r.call_status ?? "").trim();
      if (cs === "Positive") positive += 1;

      const cr = r.created_at;
      if (cr) {
        const t = new Date(cr);
        if (t >= from30d) new30 += 1;
        else if (t >= from60 && t < from30d) newPrev30 += 1;
        if (t < from30d) {
          oldCohortTot += 1;
          if (cs === "Positive") oldCohortPos += 1;
        }
      }

      const mu = r.municipality?.trim() || "Άνευ δήμου";
      muni[mu] = (muni[mu] ?? 0) + 1;
      if (cs === "Positive") muniPos[mu] = (muniPos[mu] ?? 0) + 1;

      const ps = r.political_stance?.trim() || "Άγνωστο";
      stance[ps] = (stance[ps] ?? 0) + 1;
      const cst = cs || "Άγνωστο";
      callSt[cst] = (callSt[cst] ?? 0) + 1;
      const b = ageBucket(r.age ?? null);
      ages[b] = (ages[b] ?? 0) + 1;

      if (cr) {
        try {
          const ws = format(startOfWeek(parseISO(String(cr).slice(0, 10)), { weekStartsOn: 1 }), "yyyy-MM-dd");
          if (weekCounts[ws] !== undefined) weekCounts[ws] += 1;
        } catch {
          // ignore bad dates
        }
      }
    }

    const positivePercent = total > 0 ? Math.round((positive / total) * 1000) / 10 : 0;
    const oldRate = oldCohortTot > 0 ? (oldCohortPos / oldCohortTot) * 100 : positivePercent;
    const positiveTrend = trendDir(positivePercent, Math.round(oldRate * 10) / 10, 0.3);

    const topMunicipalities = Object.entries(muni)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([name, value]) => ({ name, value }));

    const top10Municipalities = Object.entries(muni)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, value]) => ({ name, value }));

    const muniPositiveRows = Object.keys(muni)
      .map((name) => {
        const tot = muni[name] ?? 0;
        const pos = muniPos[name] ?? 0;
        const rate = tot > 0 ? Math.round((pos / tot) * 1000) / 10 : 0;
        return { name, total: tot, positive: pos, rate };
      })
      .filter((x) => x.total >= 2 && x.positive > 0)
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 12);

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
    const newContactsTrend = trendDir(new30, newPrev30, 0.01);

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

    const contactsPerWeek = weekOrder.map((id) => ({
      weekStart: id,
      label: format(parseISO(id), "d MMM", { locale: el }),
      count: weekCounts[id] ?? 0,
    }));

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
      byPoliticalStance: Object.entries(stance).map(([name, value]) => ({ name, value })),
      byCallStatus: Object.entries(callSt).map(([name, value]) => ({ name, value })),
      byAgeGroup: Object.entries(ages)
        .filter(([, v]) => v > 0)
        .map(([name, value]) => ({ name, value })),
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
