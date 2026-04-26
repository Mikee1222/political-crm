import { NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { createServiceClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const { user, profile } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    if (profile?.role !== "admin") {
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
