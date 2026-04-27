import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { MUNI_CENTROIDS, findCanonicalMuni, KNOWN_MUNICIPALITY_NAMES } from "@/lib/aitoloakarnania-map-centroids";
import { MUNICIPALITIES } from "@/lib/aitoloakarnania-data";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = "force-dynamic";

type Mode = "contacts" | "positive" | "negative";

type MuniStats = {
  muni: string;
  total: number;
  positive: number;
  negative: number;
  pending: number;
  noAnswer: number;
  /** Value used to drive heat colour for current `mode` */
  heat: number;
  ndPercent?: number;
  syrizaPercent?: number;
  pasokPercent?: number;
  totalElectionVotes?: number;
  crmPositivePercent?: number;
  compareHighlight?: boolean;
};

function tally(status: string | null | undefined, bucket: { positive: number; negative: number; pending: number; noAnswer: number }) {
  const s = status ?? "Pending";
  if (s === "Positive") bucket.positive += 1;
  else if (s === "Negative") bucket.negative += 1;
  else if (s === "No Answer") bucket.noAnswer += 1;
  else bucket.pending += 1;
}

const ndParty = (p: string) => {
  const t = p.trim();
  return (
    t === "ΝΔ" || t.includes("Νέα Δημοκρατία") || t.toLowerCase().includes("nd") || t.includes("Nea")
  );
};

function syrizaParty(p: string) {
  const t = p.trim().toLowerCase();
  return t.includes("συριζα") || t.includes("syriza");
}

function pasokParty(p: string) {
  const t = p.trim().toLowerCase();
  return t.includes("πασοκ") || t.includes("pasok") || t.includes("πα.σο.κ");
}

export async function GET(request: NextRequest) {
  try {
  const crm = await checkCRMAccess();
  if (!crm.allowed) return crm.response;
  const { profile, supabase } = crm;
  if (!hasMinRole(profile?.role, "manager")) {
    return forbidden();
  }

  const view = request.nextUrl.searchParams.get("view") || "crm";
  const yearQ = parseInt(request.nextUrl.searchParams.get("year") ?? "2023", 10);
  const elecYear = Number.isFinite(yearQ) ? yearQ : 2023;

  if (view === "electoral" || view === "compare") {
    const { data: cdata, error: cErr } = await supabase.from("contacts").select("municipality, call_status");
    if (cErr) {
      return NextResponse.json({ error: cErr.message }, { status: 400 });
    }
    const crows = (cdata ?? []) as { municipality: string | null; call_status: string | null }[];
    const { data: edata, error: eErr } = await supabase
      .from("electoral_results")
      .select("municipality, party, percentage, votes")
      .eq("year", elecYear);
    if (eErr) {
      return NextResponse.json({ error: eErr.message }, { status: 400 });
    }
    const ndByMun = new Map<string, number>();
    const syrizaByMun = new Map<string, number>();
    const pasokByMun = new Map<string, number>();
    const votesByMun = new Map<string, number>();
    for (const e of (edata ?? []) as {
      municipality: string;
      party: string;
      percentage: number;
      votes: number | null;
    }[]) {
      const m = e.municipality?.trim() ?? "";
      if (!m) continue;
      const pct = Number(e.percentage) || 0;
      const v = e.votes != null ? Number(e.votes) : 0;
      if (v > 0) {
        votesByMun.set(m, (votesByMun.get(m) ?? 0) + v);
      }
      if (ndParty(e.party)) {
        ndByMun.set(m, Math.max(ndByMun.get(m) ?? 0, pct));
      } else if (syrizaParty(e.party)) {
        syrizaByMun.set(m, Math.max(syrizaByMun.get(m) ?? 0, pct));
      } else if (pasokParty(e.party)) {
        pasokByMun.set(m, Math.max(pasokByMun.get(m) ?? 0, pct));
      }
    }
    const agg = new Map<string, { total: number; positive: number; negative: number; pending: number; noAnswer: number }>();
    for (const name of KNOWN_MUNICIPALITY_NAMES) {
      agg.set(name, { total: 0, positive: 0, negative: 0, pending: 0, noAnswer: 0 });
    }
    for (const row of crows) {
      const muni = findCanonicalMuni(row.municipality) ?? (row.municipality?.trim() ? "__unmatched__" : null);
      if (!muni) {
        continue;
      }
      if (!agg.has(muni)) {
        agg.set(muni, { total: 0, positive: 0, negative: 0, pending: 0, noAnswer: 0 });
      }
      const b = agg.get(muni)!;
      b.total += 1;
      tally(row.call_status, b);
    }
    const byMuni: MuniStats[] = MUNICIPALITIES.map((m) => {
      const b = agg.get(m.name)!;
      const rawNd = ndByMun.get(m.name) ?? ndByMun.get(m.name.replace(/^Δήμος /, "")) ?? 0;
      const rawSy = syrizaByMun.get(m.name) ?? syrizaByMun.get(m.name.replace(/^Δήμος /, "")) ?? 0;
      const rawPa = pasokByMun.get(m.name) ?? pasokByMun.get(m.name.replace(/^Δήμος /, "")) ?? 0;
      const totVotes =
        votesByMun.get(m.name) ?? votesByMun.get(m.name.replace(/^Δήμος /, "")) ?? 0;
      const crmP = b.total > 0 ? (b.positive / b.total) * 100 : 0;
      const highlight = crmP > rawNd;
      if (view === "electoral") {
        return {
          muni: m.name,
          total: b.total,
          positive: b.positive,
          negative: b.negative,
          pending: b.pending,
          noAnswer: b.noAnswer,
          heat: Math.round(Math.min(100, rawNd)),
          ndPercent: rawNd,
          syrizaPercent: rawSy,
          pasokPercent: rawPa,
          totalElectionVotes: totVotes,
          crmPositivePercent: Math.round(crmP * 10) / 10,
          compareHighlight: false,
        };
      }
      const diff = crmP - rawNd;
      return {
        muni: m.name,
        total: b.total,
        positive: b.positive,
        negative: b.negative,
        pending: b.pending,
        noAnswer: b.noAnswer,
        heat: Math.round(50 + Math.max(-50, Math.min(50, diff * 2))),
        ndPercent: rawNd,
        syrizaPercent: rawSy,
        pasokPercent: rawPa,
        totalElectionVotes: totVotes,
        crmPositivePercent: Math.round(crmP * 10) / 10,
        compareHighlight: highlight,
      };
    });
    const maxTot = byMuni.length ? Math.max(1, ...byMuni.map((b) => b.total)) : 1;
    const forMap = MUNICIPALITIES.map((m) => {
      const c = MUNI_CENTROIDS[m.name];
      const s = byMuni.find((x) => x.muni === m.name);
      if (!c || !s) {
        return null;
      }
      const t = s.total;
      const radBase = view === "electoral" ? Math.max(500, (s.heat / 100) * 9_000 + 600) : t;
      const radius = Math.max(500, Math.round(700 + (radBase / maxTot) * Math.min(c.r * 2.2, 12_000)));
      return { ...s, lat: c.lat, lng: c.lng, radius, compareHighlight: s.compareHighlight };
    }).filter((x): x is NonNullable<typeof x> => x != null);
    const top10 = [...byMuni]
      .sort((a, b) => (view === "electoral" ? (b.ndPercent ?? 0) - (a.ndPercent ?? 0) : b.heat - a.heat))
      .slice(0, 10);
    const maxCount = forMap.length ? Math.max(1, ...forMap.map((d) => d.heat)) : 1;
    const maxTotal = byMuni.length ? Math.max(1, ...byMuni.map((b) => b.total)) : 1;
    return NextResponse.json({
      view,
      year: elecYear,
      mode: "contacts" as const,
      mapColorVariant: view === "electoral" ? "nd" : "compare",
      forMap: forMap.map((r) => ({
        ...r,
        ndPercent: (r as MuniStats).ndPercent,
        crmPositivePercent: (r as MuniStats).crmPositivePercent,
        compareHighlight: (r as MuniStats & { compareHighlight?: boolean }).compareHighlight,
      })),
      byMuni,
      top10,
      maxCount,
      maxTotal,
    });
  }

  const mode = (request.nextUrl.searchParams.get("mode") as Mode) || "contacts";
  if (mode !== "contacts" && mode !== "positive" && mode !== "negative") {
    return NextResponse.json({ error: "Άκυρο mode" }, { status: 400 });
  }

  const { data, error } = await supabase.from("contacts").select("municipality, call_status");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const rows = (data ?? []) as { municipality: string | null; call_status: string | null }[];

  const agg = new Map<
    string,
    { total: number; positive: number; negative: number; pending: number; noAnswer: number; other: number }
  >();
  for (const name of KNOWN_MUNICIPALITY_NAMES) {
    agg.set(name, { total: 0, positive: 0, negative: 0, pending: 0, noAnswer: 0, other: 0 });
  }
  // bucket for contacts not matching known municipality
  agg.set("__unmatched__", { total: 0, positive: 0, negative: 0, pending: 0, noAnswer: 0, other: 0 });

  for (const row of rows) {
    const muni = findCanonicalMuni(row.municipality) ?? (row.municipality?.trim() ? "__unmatched__" : null);
    if (!muni) continue;
    if (!agg.has(muni)) {
      agg.set(muni, { total: 0, positive: 0, negative: 0, pending: 0, noAnswer: 0, other: 0 });
    }
    const b = agg.get(muni)!;
    b.total += 1;
    tally(row.call_status, b);
  }

  const byMuni: MuniStats[] = MUNICIPALITIES.map((m) => {
    const b = agg.get(m.name)!;
    let heat = 0;
    if (mode === "contacts") heat = b.total;
    else if (mode === "positive") heat = b.positive;
    else heat = b.negative;
    return {
      muni: m.name,
      total: b.total,
      positive: b.positive,
      negative: b.negative,
      pending: b.pending,
      noAnswer: b.noAnswer,
      heat,
    };
  });

  const maxTot = byMuni.length ? Math.max(1, ...byMuni.map((b) => b.total)) : 1;
  const forMap = MUNICIPALITIES.map((m) => {
    const c = MUNI_CENTROIDS[m.name];
    const s = byMuni.find((x) => x.muni === m.name);
    if (!c || !s) return null;
    const t = s.total;
    const radius = Math.max(500, Math.round(700 + (t / maxTot) * Math.min(c.r * 2.2, 14_000)));
    return { ...s, lat: c.lat, lng: c.lng, radius };
  }).filter((x): x is NonNullable<typeof x> => x != null);

  const top10 = [...byMuni].sort((a, b) => b.total - a.total).slice(0, 10);
  const maxCount = forMap.length ? Math.max(1, ...forMap.map((d) => d.heat)) : 1;
  const maxTotal = byMuni.length ? Math.max(1, ...byMuni.map((b) => b.total)) : 1;

  return NextResponse.json({
    view: "crm" as const,
    mapColorVariant: "gold" as const,
    mode,
    forMap,
    byMuni,
    top10,
    maxCount,
    maxTotal,
  });
  } catch (e) {
    console.error("[api/heatmap/municipalities]", e);
    return nextJsonError();
  }
}
