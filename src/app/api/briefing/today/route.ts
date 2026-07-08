import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { API_RACE_MS, runWithTimeCap } from "@/lib/api-resilience";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { fetchBriefingTodayData } from "@/lib/briefing-data";
import { createTtlCache } from "@/lib/ttl-cache";
import { createServerTiming, withServerTimingHeaders } from "@/lib/server-timing";
export const dynamic = "force-dynamic";

const BRIEFING_CACHE_TTL_MS = 60_000;

const emptyBriefing = {
  namedays: { names: [] as string[], matchingContactsCount: 0, contactNames: [] as string[] },
  namedayContacts: [] as Array<{ id: string; name: string; phone: string }>,
  overdueTop5: [] as Array<{
    id: string;
    request_code: string | null;
    title: string | null;
    created_at: string;
    status: string | null;
  }>,
  birthdayContacts: [] as Array<{
    id: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    birthday: string | null;
  }>,
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

type BriefingPayload = typeof emptyBriefing;

const briefingCache = createTtlCache<{ userId: string; data: BriefingPayload }>(BRIEFING_CACHE_TTL_MS);

export async function GET() {
  const timing = createServerTiming();
  try {
    const crm = await timing.time("auth", () => checkCRMAccess());
    if (!crm.allowed) return withServerTimingHeaders(crm.response, timing);
    const { user, profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return withServerTimingHeaders(forbidden(), timing);
    }

    const cached = briefingCache.get();
    if (cached.hit && cached.value.userId === user.id) {
      timing.mark("cache", 0, `hit age=${cached.ageMs}ms`);
      console.log(`[api/briefing/today] cache HIT age=${cached.ageMs}ms`);
      return withServerTimingHeaders(NextResponse.json(cached.value.data), timing);
    }

    return await runWithTimeCap(
      API_RACE_MS,
      async () => {
        const data = await timing.time("briefing", () => fetchBriefingTodayData(supabase, user.id));
        const payload: BriefingPayload = {
          namedays: data.namedays,
          namedayContacts: data.namedayContacts,
          overdueTop5: data.overdueTop5,
          birthdayContacts: data.birthdayContacts,
          tasksDueToday: data.tasksDueToday,
          pendingTasksCount: data.pendingTasksCount,
          openRequestsCount: data.openRequestsCount,
          contactsAddedThisWeek: data.contactsAddedThisWeek,
          campaigns: data.campaigns,
          calendar: data.calendar,
          stalledOpenRequestCount: data.stalledOpenRequestCount,
          callsYesterday: data.callsYesterday,
          overdueRequestCount: data.overdueRequestCount,
        };
        briefingCache.set({ userId: user.id, data: payload });
        console.log("[api/briefing/today] cache MISS — stored 60s TTL");
        return withServerTimingHeaders(NextResponse.json(payload), timing);
      },
      withServerTimingHeaders(NextResponse.json(emptyBriefing), timing),
    );
  } catch (e) {
    console.error("[api/briefing/today]", e);
    return withServerTimingHeaders(NextResponse.json(emptyBriefing), timing);
  }
}
