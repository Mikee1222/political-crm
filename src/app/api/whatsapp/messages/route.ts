import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) return forbidden();
    const limit = Math.min(200, Math.max(10, parseInt(request.nextUrl.searchParams.get("limit") ?? "100", 10) || 100));
    const { data, error } = await supabase
      .from("whatsapp_messages")
      .select("id, contact_id, direction, message, status, whatsapp_message_id, created_at, contacts ( first_name, last_name, phone )")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ messages: data ?? [] });
  } catch (e) {
    console.error("[api/whatsapp/messages]", e);
    return nextJsonError();
  }
}
