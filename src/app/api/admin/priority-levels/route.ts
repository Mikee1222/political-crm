import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { nextJsonError } from "@/lib/api-resilience";
import type { PriorityLevelRow } from "@/lib/priority-levels";
export const dynamic = "force-dynamic";

const HEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
const ALLOWED = new Set(["High", "Medium", "Low"]);

export async function GET() {
  try {
    const { user, profile, supabase } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    if (profile?.role !== "admin") {
      return forbidden();
    }
    const { data, error } = await supabase
      .from("priority_levels")
      .select("id, sort_order, key, label, color, updated_at")
      .order("sort_order", { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ levels: (data ?? []) as PriorityLevelRow[] });
  } catch (e) {
    console.error("[api/admin/priority-levels GET]", e);
    return nextJsonError();
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { user, profile, supabase } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    if (profile?.role !== "admin") {
      return forbidden();
    }
    const body = (await request.json()) as { levels?: Array<{ key: string; label: string; color: string }> };
    const list = body.levels;
    if (!list || !Array.isArray(list)) {
      return NextResponse.json({ error: "Άκυρα δεδομένα" }, { status: 400 });
    }
    const now = new Date().toISOString();
    for (const row of list) {
      const k = String(row.key ?? "").trim();
      if (!ALLOWED.has(k)) {
        return NextResponse.json({ error: "Άκυρο key" }, { status: 400 });
      }
      const label = String(row.label ?? "").trim();
      if (!label) {
        return NextResponse.json({ error: "Υποχρεωτικό label" }, { status: 400 });
      }
      const color = String(row.color ?? "").trim() || "#64748B";
      if (!HEX.test(color)) {
        return NextResponse.json({ error: "Άκυρο χρώμα" }, { status: 400 });
      }
      const { error } = await supabase
        .from("priority_levels")
        .update({ label, color, updated_at: now })
        .eq("key", k);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/admin/priority-levels PUT]", e);
    return nextJsonError();
  }
}
