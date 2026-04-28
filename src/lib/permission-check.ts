import { createServiceClient } from "@/lib/supabase/admin";

/**
 * True if `role_permissions` grants `permission_key` for the user's profile role.
 * Uses service role to avoid RLS gaps in API handlers.
 */
export async function hasPermission(userId: string, permissionKey: string): Promise<boolean> {
  const admin = createServiceClient();
  const { data: p, error: pe } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (pe || !p?.role) return false;
  const { data, error } = await admin
    .from("role_permissions")
    .select("allowed")
    .eq("role_name", p.role as string)
    .eq("permission_key", permissionKey)
    .maybeSingle();
  if (error) return false;
  return data?.allowed === true;
}

export async function hasPermissionForRole(roleName: string, permissionKey: string): Promise<boolean> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("role_permissions")
    .select("allowed")
    .eq("role_name", roleName)
    .eq("permission_key", permissionKey)
    .maybeSingle();
  if (error) return false;
  return data?.allowed === true;
}

/**
 * If there is no matrix row for this key, returns `legacyAllow` (e.g. hasMinRole) for backwards compatibility.
 */
export async function hasPermissionFlexible(
  userId: string,
  permissionKey: string,
  legacyAllow: boolean,
): Promise<boolean> {
  const admin = createServiceClient();
  const { data: p, error: pe } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (pe || !p?.role) return false;
  const { data: row, error } = await admin
    .from("role_permissions")
    .select("allowed")
    .eq("role_name", p.role as string)
    .eq("permission_key", permissionKey)
    .maybeSingle();
  if (error || row == null) return legacyAllow;
  return row.allowed === true;
}

/**
 * Keys with allowed=true for the role.
 * Returns null if the query failed (e.g. migration not applied) so callers can fall back to legacy checks.
 */
export async function getAllowedPermissionKeysForRole(roleName: string): Promise<Set<string> | null> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("role_permissions")
    .select("permission_key")
    .eq("role_name", roleName)
    .eq("allowed", true);
  if (error) return null;
  return new Set((data ?? []).map((r) => r.permission_key as string));
}
