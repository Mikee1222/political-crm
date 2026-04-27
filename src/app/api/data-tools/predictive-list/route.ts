import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { buildPredictiveCallList, type PredictiveRow } from "@/lib/predictive-call-list";
import { todayYmdAthens } from "@/lib/athens-ranges";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

function scoresToJson(rows: PredictiveRow[]) {
  const o: Record<string, { score: number; breakdown: { points: number; reason: string }[] }> = {};
  for (const r of rows) {
    o[r.contact_id] = { score: r.score, breakdown: r.breakdown };
  }
  return o;
}

export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) return forbidden();

    const ymd = todayYmdAthens();
    const { data: skipRows } = await supabase
      .from("daily_call_list_skips")
      .select("contact_id")
      .eq("date", ymd);
    const skipped = new Set((skipRows ?? []).map((r) => (r as { contact_id: string }).contact_id));

    const { data: row, error } = await supabase
      .from("daily_call_lists")
      .select("contact_ids, scores, created_at")
      .eq("date", ymd)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (!row) {
      return NextResponse.json({ date: ymd, list: [], empty: true });
    }

    const ids = (row as { contact_ids: unknown }).contact_ids as string[];
    const scoreMap = (row as { scores: unknown }).scores as Record<
      string,
      { score: number; breakdown: { points: number; reason: string }[] }
    >;

    const filtered = ids.filter((id) => !skipped.has(id));
    if (filtered.length === 0) {
      return NextResponse.json({ date: ymd, list: [], empty: true, skipped_all: true });
    }

    const { data: contacts, error: cErr } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, phone, municipality")
      .in("id", filtered);
    if (cErr) {
      return NextResponse.json({ error: cErr.message }, { status: 400 });
    }
    const byId = new Map((contacts ?? []).map((c) => [(c as { id: string }).id, c as Record<string, unknown>]));

    const list: PredictiveRow[] = [];
    let rank = 0;
    for (const id of filtered) {
      const sc = scoreMap[id];
      const c = byId.get(id);
      if (!c || !sc) continue;
      rank += 1;
      list.push({
        rank,
        contact_id: id,
        first_name: String(c.first_name ?? ""),
        last_name: String(c.last_name ?? ""),
        phone: (c.phone as string | null) ?? null,
        municipality: (c.municipality as string | null) ?? null,
        score: sc.score,
        breakdown: sc.breakdown,
      });
    }

    return NextResponse.json({
      date: ymd,
      list,
      created_at: (row as { created_at?: string }).created_at,
      empty: list.length === 0,
    });
  } catch (e) {
    console.error("[api/data-tools/predictive-list GET]", e);
    return nextJsonError();
  }
}

export async function POST() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) return forbidden();

    const ymd = todayYmdAthens();
    const { data: skipRows } = await supabase
      .from("daily_call_list_skips")
      .select("contact_id")
      .eq("date", ymd);
    const skipped = new Set((skipRows ?? []).map((r) => (r as { contact_id: string }).contact_id));

    const rows = await buildPredictiveCallList(supabase, { skipContactIds: skipped });
    const contact_ids = rows.map((r) => r.contact_id);
    const scores = scoresToJson(rows);

    const { error: upErr } = await supabase.from("daily_call_lists").upsert(
      {
        date: ymd,
        contact_ids,
        scores,
        created_at: new Date().toISOString(),
      } as never,
      { onConflict: "date" },
    );
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 400 });
    }

    return NextResponse.json({ date: ymd, list: rows, ok: true });
  } catch (e) {
    console.error("[api/data-tools/predictive-list POST]", e);
    return nextJsonError();
  }
}
