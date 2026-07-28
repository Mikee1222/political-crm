import { checkCRMAccess } from "@/lib/crm-api-access";
import {
  fetchDashboardGroups,
  fetchDashboardWidgetsData,
  fetchDashboardWidgetsFast,
  type DashboardWidgetsData,
} from "@/lib/dashboard-widgets-data";
import { NextRequest, NextResponse } from "next/server";
import { createServerTiming, withServerTimingHeaders } from "@/lib/server-timing";

export const dynamic = "force-dynamic";

const empty: DashboardWidgetsData = {
  namedays: [],
  recentInserts: [],
  recentUpdates: [],
  recentContactViews: [],
  recentRequestViews: [],
  recentRequests: [],
  groups: [],
};

/**
 * scope=fast  — namedays, recent inserts/updates/requests, per-user views (no groups)
 * scope=groups — group distribution only (shared TTL cache)
 * scope=all (default) — everything
 */
export async function GET(req: NextRequest) {
  const timing = createServerTiming();
  try {
    const crm = await timing.time("auth", () => checkCRMAccess());
    if (!crm.allowed) return withServerTimingHeaders(crm.response, timing);
    const { supabase, user } = crm;

    const scope = (req.nextUrl.searchParams.get("scope") ?? "all").toLowerCase();

    if (scope === "groups") {
      const groups = await timing.time("groups", () => fetchDashboardGroups(supabase));
      return withServerTimingHeaders(NextResponse.json({ groups }), timing);
    }

    if (scope === "fast") {
      const data = await timing.time("widgets_fast", () =>
        fetchDashboardWidgetsFast(supabase, user.id),
      );
      return withServerTimingHeaders(NextResponse.json(data), timing);
    }

    const data = await timing.time("widgets", () => fetchDashboardWidgetsData(supabase, user.id));
    return withServerTimingHeaders(NextResponse.json(data), timing);
  } catch (e) {
    console.error("[api/dashboard/widgets]", e);
    return withServerTimingHeaders(NextResponse.json(empty), timing);
  }
}
