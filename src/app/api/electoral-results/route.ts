import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { user, profile, supabase } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const y = request.nextUrl.searchParams.get("year");
    const year = y != null && y !== "" ? parseInt(y, 10) : 2023;
    if (!Number.isFinite(year)) {
      return NextResponse.json({ error: "Άκυρο year" }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("electoral_results")
      .select("id, municipality, party, percentage, year")
      .eq("year", year)
      .order("municipality", { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ rows: data ?? [], year });
  } catch (e) {
    console.error("[api/electoral-results GET]", e);
    return nextJsonError();
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, profile, supabase } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    if (profile?.role !== "admin") {
      return forbidden();
    }
    const body = (await request.json()) as {
      year?: number;
      replace?: boolean;
      rows?: Array<{ municipality?: string; party?: string; percentage?: number | string }>;
    };
    const year = Number.isFinite(body.year) ? (body.year as number) : 2023;
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (body.replace === true) {
      const { error: delErr } = await supabase.from("electoral_results").delete().eq("year", year);
      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 400 });
      }
    }
    const insert = rows
      .map((r) => {
        const municipality = String(r.municipality ?? "").trim();
        const party = String(r.party ?? "ΝΔ").trim() || "ΝΔ";
        const p = parseFloat(String(r.percentage));
        if (!municipality || !Number.isFinite(p)) {
          return null;
        }
        return { municipality, party, percentage: p, year };
      })
      .filter((x): x is { municipality: string; party: string; percentage: number; year: number } => x != null);

    if (insert.length === 0) {
      return NextResponse.json({ ok: true, inserted: 0 });
    }

    const { error: insErr } = await supabase.from("electoral_results").insert(insert);
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, inserted: insert.length, year });
  } catch (e) {
    console.error("[api/electoral-results POST]", e);
    return nextJsonError();
  }
}
