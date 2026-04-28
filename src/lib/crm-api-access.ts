import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSessionWithProfile, type UserProfile } from "@/lib/auth-helpers";
import { isPortalOnlyUser } from "@/lib/portal-user-status";

export { isPortalUserFromServiceReads } from "@/lib/portal-user-status";

type CrmAccessResult =
  | { allowed: true; user: User; profile: UserProfile; supabase: SupabaseClient }
  | { allowed: false; response: NextResponse };

const CRM_FORBIDDEN_MSG = "Η πρόσβαση στο CRM δεν επιτρέπεται";

/**
 * For CRM /api/* handlers: require a signed-in user; 401 if not; 403 if the account is portal-only
 * (including missing profile with a row in `portal_users`).
 * Pass `Request` for forward compatibility; session is read from cookies via the server client.
 */
export async function checkCRMAccess(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _request?: Request,
): Promise<CrmAccessResult> {
  const s = await getSessionWithProfile();
  if (!s.user) {
    return {
      allowed: false,
      response: NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 }),
    };
  }
  try {
    if (await isPortalOnlyUser(s.user.id)) {
      return {
        allowed: false,
        response: NextResponse.json({ error: CRM_FORBIDDEN_MSG }, { status: 403 }),
      };
    }
  } catch (e) {
    console.error("[checkCRMAccess] missing service role or lookup failed, falling back to RLS profile", e);
    if (s.profile?.is_portal === true) {
      return {
        allowed: false,
        response: NextResponse.json({ error: CRM_FORBIDDEN_MSG }, { status: 403 }),
      };
    }
  }
  return { allowed: true, user: s.user, profile: s.profile, supabase: s.supabase };
}

/**
 * Canonical guard for CRM-only API routes.
 * Portal users always receive 403, authenticated CRM users pass through.
 */
export async function requireCRMAccess(request?: Request): Promise<CrmAccessResult> {
  return checkCRMAccess(request);
}

/**
 * Optional-auth routes: only block session users who are portal-only. Call with `void _request` if needed.
 */
export async function forbidCrmForPortalUserIfSignedIn(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _request?: Request,
): Promise<NextResponse | null> {
  const s = await getSessionWithProfile();
  if (!s.user) return null;
  try {
    if (await isPortalOnlyUser(s.user.id)) {
      return NextResponse.json({ error: CRM_FORBIDDEN_MSG }, { status: 403 });
    }
  } catch (e) {
    console.error("[forbidCrmForPortalUserIfSignedIn] service role fallback to profile.is_portal", e);
    if (s.profile?.is_portal === true) {
      return NextResponse.json({ error: CRM_FORBIDDEN_MSG }, { status: 403 });
    }
  }
  return null;
}
