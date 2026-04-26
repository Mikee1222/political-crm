import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile } from "@/lib/auth-helpers";
import { exchangeCodeForTokens, parseOAuthState } from "@/lib/google-calendar";
import { createServiceClient } from "@/lib/supabase/admin";
import { hasMinRole } from "@/lib/roles";
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { user, profile } = await getSessionWithProfile();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.nextUrl));
  }
  if (!hasMinRole(profile?.role, "manager")) {
    return NextResponse.redirect(new URL("/schedule?g=deny", request.nextUrl));
  }

  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oerr = searchParams.get("error");
  if (oerr) {
    return NextResponse.redirect(new URL("/schedule?g=err", request.nextUrl));
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL("/schedule?g=bad", request.nextUrl));
  }
  let parsed: { u: string };
  try {
    parsed = parseOAuthState(state);
  } catch {
    return NextResponse.redirect(new URL("/schedule?g=state", request.nextUrl));
  }
  if (parsed.u !== user.id) {
    return NextResponse.redirect(new URL("/schedule?g=session", request.nextUrl));
  }

  const tokens = await exchangeCodeForTokens(code);
  const expires = tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null;
  const service = createServiceClient();
  const { error } = await service.from("google_tokens").upsert(
    {
      user_id: user.id,
      access_token: tokens.access_token ?? null,
      refresh_token: tokens.refresh_token ?? null,
      expires_at: expires,
      expiry: expires,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) {
    return NextResponse.redirect(new URL("/schedule?g=save", request.nextUrl));
  }
  const target =
    profile?.role === "admin" ? new URL("/settings?g=calendar_ok", request.nextUrl) : new URL("/schedule?g=ok", request.nextUrl);
  return NextResponse.redirect(target);
}
