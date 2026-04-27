import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { user, profile, supabase } = await getSessionWithProfile();
    if (!user) return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    if (!hasMinRole(profile?.role, "manager")) return forbidden();
    const { data, error } = await supabase
      .from("office_appointments")
      .select("id, starts_at, ends_at, reason, citizen_name, created_at, google_event_id")
      .eq("contact_id", id)
      .order("starts_at", { ascending: true });
    if (error) {
      console.warn("[api/contacts/appointments]", error.message);
      return NextResponse.json({ appointments: [] });
    }
    return NextResponse.json({ appointments: data ?? [] });
  } catch (e) {
    console.error("[api/contacts/appointments]", e);
    return NextResponse.json({ appointments: [] });
  }
}
