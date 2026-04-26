import { NextResponse } from "next/server";
import { API_RACE_MS, runWithTimeCap } from "@/lib/api-resilience";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { fetchBriefingTodayData } from "@/lib/briefing-data";
export const dynamic = "force-dynamic";

const emptyBriefing = {
  namedays: { names: [] as string[], matchingContactsCount: 0, contactNames: [] as string[] },
  namedayContacts: [] as Array<{ name: string; phone: string }>,
  tasksDueToday: [] as Array<{ id: string; title: string; contact: string }>,
  pendingTasksCount: 0,
  openRequestsCount: 0,
  contactsAddedThisWeek: 0,
  campaigns: [] as Array<{ id: string; name: string; started_at: string | null; callsTotal: number; positive: number }>,
  calendar: { connected: false as boolean, events: [] as Array<{ title: string | null; start: string | null; end: string | null }> },
  stalledOpenRequestCount: 0,
  callsYesterday: { total: 0, positive: 0, negative: 0, noAnswer: 0 },
  overdueRequestCount: 0,
};

export async function GET() {
  try {
    const { user, profile, supabase } = await getSessionWithProfile();
    if (!user) return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    if (!hasMinRole(profile?.role, "manager")) return forbidden();

    return await runWithTimeCap(
      API_RACE_MS,
      async () => {
        const data = await fetchBriefingTodayData(supabase, user.id);
        return NextResponse.json({
          namedays: data.namedays,
          namedayContacts: data.namedayContacts,
          tasksDueToday: data.tasksDueToday,
          pendingTasksCount: data.pendingTasksCount,
          openRequestsCount: data.openRequestsCount,
          contactsAddedThisWeek: data.contactsAddedThisWeek,
          campaigns: data.campaigns,
          calendar: data.calendar,
          stalledOpenRequestCount: data.stalledOpenRequestCount,
          callsYesterday: data.callsYesterday,
          overdueRequestCount: data.overdueRequestCount,
        });
      },
      NextResponse.json(emptyBriefing),
    );
  } catch (e) {
    console.error("[api/briefing/today]", e);
    return NextResponse.json(emptyBriefing);
  }
}
