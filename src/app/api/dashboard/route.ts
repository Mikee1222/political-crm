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
  notCalled30Count: 0,
  overdueRequestCount: 0,
  contactsWithoutPhoneCount: 0,
  supporterCount: 0,
  totalSupportAmount: 0,
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

        const cut30 = new Date(today);
        cut30.setDate(cut30.getDate() - 30);
        const cutIso = cut30.toISOString();
        const y = today.getFullYear();
        const mo = String(today.getMonth() + 1).padStart(2, "0");
        const da = String(today.getDate()).padStart(2, "0");
        const todayYmd = `${y}-${mo}-${da}`;

        const [c1, c2, c3, c4, c5, c6, c7, c7b, c7c, c8, c9] = await Promise.all([
          supabase.from("contacts").select("*", { count: "exact", head: true }),
          supabase.from("calls").select("*", { count: "exact", head: true }).gte("called_at", todayIso),
          supabase.from("calls").select("outcome"),
          supabase.from("contacts").select("*", { count: "exact", head: true }).eq("call_status", "Pending"),
          supabase
            .from("calls")
            .select("id, called_at, outcome, contacts(first_name,last_name)")
            .order("called_at", { ascending: false })
            .limit(8),
          supabase
            .from("contacts")
            .select("id", { count: "exact", head: true })
            .or(`last_contacted_at.is.null,last_contacted_at.lt."${cutIso}"`),
          supabase
            .from("requests")
            .select("id", { count: "exact", head: true })
            .in("status", ["Νέο", "Σε εξέλιξη"])
            .lt("sla_due_date", todayYmd),
          supabase.from("contacts").select("id", { count: "exact", head: true }).is("phone", null),
          supabase.from("contacts").select("id", { count: "exact", head: true }).eq("phone", ""),
          supabase.from("supporters").select("id", { count: "exact", head: true }),
          supabase.from("supporters").select("amount"),
        ]);

        if (c1.error || c2.error || c3.error || c4.error || c5.error || c6.error || c7.error || c7b.error || c7c.error || c8.error || c9.error) {
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

        const supportRows = (c9.data ?? []) as Array<{ amount: number | null }>;
        const totalSupportAmount = supportRows.reduce(
          (a, r) => a + (r.amount != null ? Number(r.amount) : 0),
          0,
        );

        const noPhone = (c7b.count ?? 0) + (c7c.count ?? 0);

        return NextResponse.json({
          totalContacts,
          totalCallsToday,
          positiveRate,
          pendingContacts,
          notCalled30Count: c6.count ?? 0,
          overdueRequestCount: c7.count ?? 0,
          contactsWithoutPhoneCount: noPhone,
          supporterCount: c8.count ?? 0,
          totalSupportAmount,
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
