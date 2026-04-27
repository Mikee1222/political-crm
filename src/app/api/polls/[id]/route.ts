import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { user, profile, supabase } = await getSessionWithProfile();
    if (!user) return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    if (!hasMinRole(profile?.role, "manager")) return forbidden();
    const { data: poll, error } = await supabase
      .from("polls")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error || !poll) {
      return NextResponse.json({ error: "Άκυρο" }, { status: 404 });
    }
    const { data: res } = await supabase
      .from("poll_responses")
      .select("id, option_id, created_at, contacts ( first_name, last_name, phone )")
      .eq("poll_id", id)
      .order("created_at", { ascending: false });
    const byOpt: Record<string, number> = {};
    for (const r of res ?? []) {
      const oid = (r as { option_id: string }).option_id;
      byOpt[oid] = (byOpt[oid] ?? 0) + 1;
    }
    return NextResponse.json({ poll, responses: res ?? [], option_counts: byOpt });
  } catch (e) {
    console.error("[api/polls/id GET]", e);
    return nextJsonError();
  }
}
