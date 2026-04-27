import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { getCampaignRollup } from "@/lib/campaign-stats";
import { nextJsonError } from "@/lib/api-resilience";
import { startOfDay, subDays } from "date-fns";
export const dynamic = "force-dynamic";

function ageBucket(age: number | null | undefined): string {
  if (age == null || !Number.isFinite(age)) return "Άγνωστο";
  if (age <= 30) return "18–30";
  if (age <= 45) return "31–45";
  if (age <= 60) return "46–60";
  return "60+";
}

export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }

    const { data: allContacts, error: cErr } = await supabase
      .from("contacts")
      .select("municipality, political_stance, call_status, age");
    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 });

    const muni: Record<string, number> = {};
    const stance: Record<string, number> = {};
    const callSt: Record<string, number> = {};
    const ages: Record<string, number> = { "18–30": 0, "31–45": 0, "46–60": 0, "60+": 0, Άγνωστο: 0 };

    for (const r of allContacts ?? []) {
      const row = r as {
        municipality?: string | null;
        political_stance?: string | null;
        call_status?: string | null;
        age?: number | null;
      };
      const mu = row.municipality?.trim() || "Άνευ δήμου";
      muni[mu] = (muni[mu] ?? 0) + 1;
      const ps = row.political_stance?.trim() || "Άγνωστο";
      stance[ps] = (stance[ps] ?? 0) + 1;
      const cs = row.call_status?.trim() || "Άγνωστο";
      callSt[cs] = (callSt[cs] ?? 0) + 1;
      const b = ageBucket(row.age ?? null);
      ages[b] = (ages[b] ?? 0) + 1;
    }

    const topMunicipalities = Object.entries(muni)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([name, value]) => ({ name, value }));

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

    return NextResponse.json({
      byMunicipality: topMunicipalities,
      byPoliticalStance: Object.entries(stance).map(([name, value]) => ({ name, value })),
      byCallStatus: Object.entries(callSt).map(([name, value]) => ({ name, value })),
      byAgeGroup: Object.entries(ages)
        .filter(([, v]) => v > 0)
        .map(([name, value]) => ({ name, value })),
      callsOverTime,
      campaignSuccess,
    });
  } catch (e) {
    console.error("[api/analytics]", e);
    return nextJsonError();
  }
}
