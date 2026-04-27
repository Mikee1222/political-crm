import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { createServiceClient } from "@/lib/supabase/admin";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const admin = createServiceClient();
    const { data, error } = await admin
      .from("email_logs")
      .select("id, to_email, subject, template, status, contact_id, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ logs: data ?? [] });
  } catch (e) {
    console.error(e);
    return nextJsonError();
  }
}
