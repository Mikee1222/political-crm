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
    const year = parseInt(request.nextUrl.searchParams.get("year") ?? "2023", 10);
    const y = Number.isFinite(year) ? year : 2023;
    const { data, error } = await supabase.from("electoral_results").select("municipality, party, percentage, year").eq("year", y);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ year: y, results: data ?? [] });
  } catch (e) {
    console.error("[api/heatmap/electoral]", e);
    return nextJsonError();
  }
}
