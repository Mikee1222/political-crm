import { NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";

export async function GET() {
  const { user, profile, supabase } = await getSessionWithProfile();
  if (!user) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  }
  if (!hasMinRole(profile?.role, "manager")) {
    return forbidden();
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString();

  const [{ count: totalContacts }, { count: totalCallsToday }, { data: allCalls }, { count: pendingContacts }, { data: recentCalls }] =
    await Promise.all([
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
    totalContacts: totalContacts ?? 0,
    totalCallsToday: totalCallsToday ?? 0,
    positiveRate,
    pendingContacts: pendingContacts ?? 0,
    recentActivity,
  });
}
