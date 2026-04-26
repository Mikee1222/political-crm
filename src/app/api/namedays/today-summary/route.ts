import { NextResponse } from "next/server";
import { getSessionWithProfile } from "@/lib/auth-helpers";
import { getContactIdsForNameDay } from "@/lib/nameday-celebrating";

function dateLabelGreek(d: Date) {
  return d.toLocaleDateString("el-GR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export async function GET() {
  const { user, supabase } = await getSessionWithProfile();
  if (!user) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  }

  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const dateLabel = dateLabelGreek(now);

  const { data: namedayRows, error: ne } = await supabase
    .from("name_days")
    .select("names")
    .eq("month", month)
    .eq("day", day);
  if (ne) {
    return NextResponse.json({ error: ne.message }, { status: 500 });
  }
  const calendarNames = (namedayRows ?? []).flatMap((r) => (r as { names?: string[] }).names ?? []);

  const contactIds = await getContactIdsForNameDay(supabase, month, day);

  return NextResponse.json({
    dateLabel,
    calendarNames,
    contactCount: contactIds.length,
  });
}

export const dynamic = "force-dynamic";
