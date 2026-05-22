import { NextResponse } from "next/server";
import { checkCRMAccess } from "@/lib/crm-api-access";
import { forbidden } from "@/lib/auth-helpers";
import { getAllowedPermissionKeysForRole } from "@/lib/permission-check";
import { hasMinRole } from "@/lib/roles";
import type { User } from "@supabase/supabase-js";
import type { UserProfile } from "@/lib/auth-helpers";

export type AlexandraApiAccess =
  | { ok: true; user: User; profile: UserProfile }
  | { ok: false; response: NextResponse };

export async function requireAlexandraApi(): Promise<AlexandraApiAccess> {
  const crm = await checkCRMAccess();
  if (!crm.allowed) return { ok: false, response: crm.response };
  if (!crm.user || !crm.profile) {
    return { ok: false, response: NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 }) };
  }
  const allowedKeys = await getAllowedPermissionKeysForRole(crm.profile.role);
  if (allowedKeys !== null && !allowedKeys.has("alexandra_use")) {
    return { ok: false, response: forbidden() };
  }
  if (!hasMinRole(crm.profile.role, "caller")) {
    return { ok: false, response: forbidden() };
  }
  return { ok: true, user: crm.user, profile: crm.profile };
}
