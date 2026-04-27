import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const { data, error } = await supabase
      .from("analyzed_documents")
      .select("id, title, content_summary, key_points, analysis, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ documents: data ?? [] });
  } catch (e) {
    console.error("[api/documents/history]", e);
    return nextJsonError();
  }
}
