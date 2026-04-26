import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { addDaysInMonthCounts, listDaysInMonth, monthRangeYmd } from "@/lib/task-filters";

export async function GET(request: NextRequest) {
  const { user, profile, supabase } = await getSessionWithProfile();
  if (!user) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  }
  if (!hasMinRole(profile?.role, "manager")) {
    return forbidden();
  }

  const y = parseInt(request.nextUrl.searchParams.get("year") ?? "0", 10);
  const m = parseInt(request.nextUrl.searchParams.get("month") ?? "0", 10);
  if (y < 2000 || m < 1 || m > 12) {
    return NextResponse.json({ error: "Άκυρο year/month" }, { status: 400 });
  }
  const { from, to } = monthRangeYmd(y, m);
  const { data, error } = await supabase
    .from("tasks")
    .select("due_date")
    .not("due_date", "is", null)
    .gte("due_date", from)
    .lte("due_date", to);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const counts = addDaysInMonthCounts(
    (data ?? []) as { due_date: string | null }[],
    y,
    m,
  );
  const max = Math.max(0, ...Object.values(counts));
  return NextResponse.json({ counts, days: listDaysInMonth(y, m), max, from, to });
}
