import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { getGoogleAuthUrl } from "@/lib/google-calendar";
import { hasMinRole } from "@/lib/roles";

export async function GET(request: NextRequest) {
  const { user, profile } = await getSessionWithProfile();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.nextUrl));
  }
  if (!hasMinRole(profile?.role, "manager")) {
    return forbidden();
  }
  const url = getGoogleAuthUrl(user.id);
  return NextResponse.redirect(url);
}
