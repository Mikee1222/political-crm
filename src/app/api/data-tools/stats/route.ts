import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }

    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const startIso = start.toISOString();

    const { data: all, error } = await supabase.from("contacts").select("id, area, municipality, call_status, political_stance, phone, created_at");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const rows = all ?? [];
    const total = rows.length;
    const noPhone = rows.filter((r) => r.phone == null || !String(r.phone).trim()).length;
    const noMuni = rows.filter((r) => r.municipality == null || !String(r.municipality).trim()).length;
    const noCallStatus = rows.filter((r) => r.call_status == null || String(r.call_status).trim() === "").length;
    const thisMonth = rows.filter((r) => r.created_at && new Date(r.created_at) >= new Date(startIso)).length;

    const byStatus: Record<string, number> = {};
    for (const r of rows) {
      const s = (r.call_status as string) || "— (κενό)";
      byStatus[s] = (byStatus[s] ?? 0) + 1;
    }

    const areaMap: Record<string, number> = {};
    const muniMap: Record<string, number> = {};
    for (const r of rows) {
      if (r.area) {
        areaMap[r.area] = (areaMap[r.area] ?? 0) + 1;
      }
      if (r.municipality) {
        muniMap[r.municipality] = (muniMap[r.municipality] ?? 0) + 1;
      }
    }
    const topArea = topN(areaMap, 10, "Περιοχή");
    const topMuni = topN(muniMap, 10, "Δήμος");

    const byStance: Record<string, number> = {};
    for (const r of rows) {
      const s = (r.political_stance as string) || "— (κενό)";
      byStance[s] = (byStance[s] ?? 0) + 1;
    }

    return NextResponse.json({
      total,
      noPhone,
      noMuni,
      noCallStatus,
      thisMonth,
      byStatus,
      byStance,
      topArea,
      topMunicipalities: topMuni,
    });
  } catch (e) {
    console.error("[api/data-tools/stats]", e);
    return nextJsonError();
  }
}

function topN(
  m: Record<string, number>,
  n: number,
  type: "Περιοχή" | "Δήμος",
): Array<{ label: string; type: "Περιοχή" | "Δήμος"; count: number }> {
  return Object.entries(m)
    .map(([label, count]) => ({ label, type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}
