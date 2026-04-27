import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { createServiceClient } from "@/lib/supabase/admin";
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { user, profile } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const service = createServiceClient();
    const { data: myTok } = await service.from("google_tokens").select("user_id").eq("user_id", user.id).maybeSingle();
    return NextResponse.json({
      retell: Boolean(process.env.RETELL_API_KEY),
      googleOAuthConfigured: Boolean(
        process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI,
      ),
      hasStoredGoogleTokens: Boolean(myTok),
    });
  } catch (e) {
    console.error("[api/admin/integrations]", e);
    return nextJsonError();
  }
}
