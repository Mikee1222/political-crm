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

    const dayStr = request.nextUrl.searchParams.get("days");
    const parsed = dayStr != null ? parseInt(dayStr, 10) : 30;
    const days = Number.isFinite(parsed) && parsed > 0 ? Math.min(3650, parsed) : 30;
    const municipality = request.nextUrl.searchParams.get("municipality")?.trim();

    const cut = new Date();
    cut.setDate(cut.getDate() - days);
    const iso = cut.toISOString();

    let q = supabase
      .from("contacts")
      .select("id, municipality, last_contacted_at")
      .or(`last_contacted_at.is.null,last_contacted_at.lt."${iso}"`);

    if (municipality) {
      q = q.ilike("municipality", `%${municipality}%`);
    }

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const rows = data ?? [];
    const byMunicipality: Record<string, number> = {};
    for (const r of rows) {
      const m = (r as { municipality?: string | null }).municipality?.trim() || "Άνευ δήμου";
      byMunicipality[m] = (byMunicipality[m] ?? 0) + 1;
    }

    return NextResponse.json({
      days,
      total: rows.length,
      byMunicipality,
    });
  } catch (e) {
    console.error("[api/contacts/not-called]", e);
    return nextJsonError();
  }
}
