import { NextResponse } from "next/server";
import { API_RACE_MS, runWithTimeCap } from "@/lib/api-resilience";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
export const dynamic = 'force-dynamic';


const empty = {
  totalContacts: 0,
  totalCallsToday: 0,
  positiveRate: 0,
  pendingContacts: 0,
  recentActivity: [] as Array<{ id: string; type: string; text: string; created_at: string }>,
};

export async function GET() {
  try {
    const { user, profile, supabase } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }

    return await runWithTimeCap(
      API_RACE_MS,
      async () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayIso = today.toISOString();

        const [c1, c2, c3, c4, c5] = await Promise.all([
          supabase.from("contacts").select("*", { count: "exact", head: true }),
          supabase.from("calls").select("*", { count: "exact", head: true }).gte("called_at", todayIso),
          supabase.from("calls").select("outcome"),
          supabase.from("contacts").select("*", { count: "exact", head: true }).eq("call_status", "Pending"),
          supabase
            .from("calls")
            .select("id, called_at, outcome, contacts(first_name,last_name)")
            .order("called_at", { ascending: false })
            .limit(8),
        ]);

        if (c1.error || c2.error || c3.error || c4.error || c5.error) {
          return NextResponse.json(empty);
        }

        const totalContacts = c1.count ?? 0;
        const totalCallsToday = c2.count ?? 0;
        const allCalls = c3.data;
        const pendingContacts = c4.count ?? 0;
        const recentCalls = c5.data;

        const positive = allCalls?.filter((c) => c.outcome === "Positive").length ?? 0;
        const total = allCalls?.length ?? 0;
        const positiveRate = total > 0 ? (positive / total) * 100 : 0;

        const recentActivity = (recentCalls ?? []).map((c) => {
          const contact = Array.isArray(c.contacts) ? c.contacts[0] : c.contacts;
          return {
            id: c.id,
            type: "call",
            text: `${contact?.first_name ?? ""} ${contact?.last_name ?? ""} - ${c.outcome ?? "-"}`,
            created_at: c.called_at ?? new Date().toISOString(),
          };
        });

        return NextResponse.json({
          totalContacts,
          totalCallsToday,
          positiveRate,
          pendingContacts,
          recentActivity,
        });
      },
      NextResponse.json(empty),
    );
  } catch (e) {
    console.error("[api/dashboard]", e);
    return NextResponse.json(empty);
  }
}
