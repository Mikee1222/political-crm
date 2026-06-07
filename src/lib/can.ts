import type { Profile } from "@/contexts/profile-context";
import { PERMISSION_ROLE_DEFAULTS, type PermissionKey } from "@/lib/permissions";

function roleDefaultAllows(role: string, permission: string): boolean {
  const defaults = PERMISSION_ROLE_DEFAULTS[permission as PermissionKey];
  if (!defaults) return false;
  return defaults.includes(role as "admin" | "manager" | "caller");
}

/** True when the user's role grants `permission` (matrix row or system-role default). */
export function can(profile: Profile | null | undefined, permission: string): boolean {
  if (!profile) return false;
  if (profile.permissions && permission in profile.permissions) {
    return profile.permissions[permission] === true;
  }
  return roleDefaultAllows(profile.role, permission);
}
