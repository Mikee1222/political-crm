import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
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
