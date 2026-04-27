import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
  const crm = await checkCRMAccess();
  if (!crm.allowed) return crm.response;
  const { user, profile } = crm;
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.nextUrl));
  }
  if (!hasMinRole(profile?.role, "manager")) {
    return forbidden();
  }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    console.error("[api/auth/google] missing GOOGLE_CLIENT_ID or GOOGLE_REDIRECT_URI");
    return nextJsonError("Ρύθμιση Google OAuth incomplete", 500);
  }
  const state = Buffer.from(
    JSON.stringify({ u: user.id, t: Date.now() }),
  ).toString("base64url");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope:
      "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events",
    access_type: "offline",
    prompt: "consent",
    state,
  });
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  return NextResponse.redirect(authUrl);
  } catch (e) {
    console.error("[api/auth/google GET]", e);
    return nextJsonError();
  }
}
