import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = "force-dynamic";

type Assignee = { id: string; full_name: string | null; role: string };

/** Profiles for "Ανατέθηκε σε" dropdowns (managers+). */
export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, role")
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
