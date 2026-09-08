import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
import { createServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Assignee = { id: string; full_name: string | null; role: string };

/**
 * CRM staff profiles for assignee / Υπεύθυνος / Χειριστής dropdowns.
 * Uses service role because profiles RLS is "read own" only.
 * Active CRM users only (is_portal = false).
 */
export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;

    const service = createServiceClient();
    const { data, error } = await service
      .from("profiles")
      .select("id, full_name, role")
      .eq("is_portal", false)
      .order("full_name", { ascending: true, nullsFirst: false });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ assignees: (data ?? []) as Assignee[] });
  } catch (e) {
    console.error("[api/team/assignees GET]", e);
    return nextJsonError();
  }
}
