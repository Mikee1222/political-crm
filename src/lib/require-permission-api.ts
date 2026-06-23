import type { NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasPermissionFlexible } from "@/lib/permission-check";
import type { CrmAccessResult } from "@/lib/crm-api-access";

/** Returns a 401/403 response when denied; null when the caller may proceed. */
export async function requirePermissionFlexible(
  crm: CrmAccessResult,
  permissionKey: string,
  legacyAllow: boolean,
): Promise<NextResponse | null> {
  if (!crm.allowed) return crm.response;
  if (!(await hasPermissionFlexible(crm.user.id, permissionKey, legacyAllow))) {
    return forbidden();
  }
  return null;
}

export async function requireSettingsEdit(crm: CrmAccessResult): Promise<NextResponse | null> {
  if (!crm.allowed) return crm.response;
  return requirePermissionFlexible(crm, "settings_edit", crm.profile?.role === "admin");
}

export async function requireAdminOnlyPermission(
  crm: CrmAccessResult,
  permissionKey: string,
): Promise<NextResponse | null> {
  if (!crm.allowed) return crm.response;
  return requirePermissionFlexible(crm, permissionKey, crm.profile?.role === "admin");
}
