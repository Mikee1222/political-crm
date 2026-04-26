import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { MUNI_CENTROIDS, findCanonicalMuni, KNOWN_MUNICIPALITY_NAMES } from "@/lib/aitoloakarnania-map-centroids";
import { MUNICIPALITIES } from "@/lib/aitoloakarnania-data";

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
};

function tally(status: string | null | undefined, bucket: { positive: number; negative: number; pending: number; noAnswer: number }) {
  const s = status ?? "Pending";
  if (s === "Positive") bucket.positive += 1;
  else if (s === "Negative") bucket.negative += 1;
  else if (s === "No Answer") bucket.noAnswer += 1;
  else bucket.pending += 1;
}

export async function GET(request: NextRequest) {
  const { user, profile, supabase } = await getSessionWithProfile();
  if (!user) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  }
  if (!hasMinRole(profile?.role, "manager")) {
    return forbidden();
  }
  const mode = (request.nextUrl.searchParams.get("mode") as Mode) || "contacts";
  if (mode !== "contacts" && mode !== "positive" && mode !== "negative") {
    return NextResponse.json({ error: "Άκυρο mode" }, { status: 400 });
  }

  const { data, error } = await supabase.from("contacts").select("municipality, call_status");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
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

  const forMap = MUNICIPALITIES.map((m) => {
    const c = MUNI_CENTROIDS[m.name];
    const s = byMuni.find((x) => x.muni === m.name);
    if (!c || !s) return null;
    return { ...s, lat: c.lat, lng: c.lng, radius: c.r };
  }).filter((x): x is NonNullable<typeof x> => x != null);

  const top10 = [...byMuni].sort((a, b) => b.total - a.total).slice(0, 10);
  const maxCount = forMap.length ? Math.max(1, ...forMap.map((d) => d.heat)) : 1;
  const maxTotal = byMuni.length ? Math.max(1, ...byMuni.map((b) => b.total)) : 1;

  return NextResponse.json({
    mode,
    forMap,
    byMuni,
    top10,
    maxCount,
    maxTotal,
  });
}
