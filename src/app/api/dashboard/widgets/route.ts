import { checkCRMAccess } from "@/lib/crm-api-access";
import { fetchDashboardWidgetsData } from "@/lib/dashboard-widgets-data";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const empty = {
  namedays: [],
  recentInserts: [],
  recentUpdates: [],
  recentContactViews: [],
  recentRequestViews: [],
  recentRequests: [],
  groups: [],
};

export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { supabase, user } = crm;

    const data = await fetchDashboardWidgetsData(supabase, user.id);
    return NextResponse.json(data);
  } catch (e) {
    console.error("[api/dashboard/widgets]", e);
    return NextResponse.json(empty);
  }
}
