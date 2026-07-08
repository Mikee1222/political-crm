import { checkCRMAccess } from "@/lib/crm-api-access";
import { fetchDashboardWidgetsData, type DashboardWidgetsData } from "@/lib/dashboard-widgets-data";
import { NextResponse } from "next/server";
import { createTtlCache } from "@/lib/ttl-cache";
import { createServerTiming, withServerTimingHeaders } from "@/lib/server-timing";

export const dynamic = "force-dynamic";

const WIDGETS_CACHE_TTL_MS = 60_000;

const empty: DashboardWidgetsData = {
  namedays: [],
  recentInserts: [],
  recentUpdates: [],
  recentContactViews: [],
  recentRequestViews: [],
  recentRequests: [],
  groups: [],
};

const widgetsCache = createTtlCache<{ userId: string; data: DashboardWidgetsData }>(WIDGETS_CACHE_TTL_MS);

export async function GET() {
  const timing = createServerTiming();
  try {
    const crm = await timing.time("auth", () => checkCRMAccess());
    if (!crm.allowed) return withServerTimingHeaders(crm.response, timing);
    const { supabase, user } = crm;

    const cached = widgetsCache.get();
    if (cached.hit && cached.value.userId === user.id) {
      timing.mark("cache", 0, `hit age=${cached.ageMs}ms`);
      console.log(`[api/dashboard/widgets] cache HIT age=${cached.ageMs}ms`);
      return withServerTimingHeaders(NextResponse.json(cached.value.data), timing);
    }

    const data = await timing.time("widgets", () => fetchDashboardWidgetsData(supabase, user.id));
    widgetsCache.set({ userId: user.id, data });
    console.log("[api/dashboard/widgets] cache MISS — stored 60s TTL");
    return withServerTimingHeaders(NextResponse.json(data), timing);
  } catch (e) {
    console.error("[api/dashboard/widgets]", e);
    return withServerTimingHeaders(NextResponse.json(empty), timing);
  }
}
