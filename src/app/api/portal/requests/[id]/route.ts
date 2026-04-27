import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPortalUser } from "@/lib/portal";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    const portal = await getPortalUser(supabase, user.id);
    if (!portal || !portal.contact_id) {
      return NextResponse.json({ error: "Μη πολίτης" }, { status: 403 });
    }
    const { data, error } = await supabase
      .from("requests")
      .select(
        "id, request_code, title, category, status, created_at, description, updated_at, portal_message, contact_id, sla_due_date",
      )
      .eq("id", params.id)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (!data || (data as { contact_id: string }).contact_id !== portal.contact_id) {
      return NextResponse.json({ error: "Δεν βρέθηκε" }, { status: 404 });
    }
    return NextResponse.json({ request: data });
  } catch (e) {
    console.error("[api/portal/requests/id GET]", e);
    return nextJsonError();
  }
}
