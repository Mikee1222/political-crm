import type { PermissionKey } from "@/lib/permissions";

/** Browser/API path prefixes that require a CRM permission (longest-prefix wins). */
export const ROUTE_PERMISSION_GUARDS: readonly { prefix: string; permission: PermissionKey }[] = [
  { prefix: "/api/data-tools", permission: "data_tools_view" },
  { prefix: "/api/schedule", permission: "requests_scheduler_view" },
  { prefix: "/api/events", permission: "events_view" },
  { prefix: "/api/volunteers", permission: "volunteers_view" },
  { prefix: "/api/media", permission: "documents_view" },
  { prefix: "/dashboard", permission: "analytics_view" },
  { prefix: "/analytics", permission: "analytics_view" },
  { prefix: "/data-tools", permission: "data_tools_view" },
  { prefix: "/contacts", permission: "contacts_view" },
  { prefix: "/requests", permission: "requests_view" },
  { prefix: "/settings", permission: "settings_view" },
  { prefix: "/campaigns", permission: "campaigns_view" },
  { prefix: "/tasks", permission: "tasks_view" },
  { prefix: "/events", permission: "events_view" },
  { prefix: "/volunteers", permission: "volunteers_view" },
  { prefix: "/schedule", permission: "requests_scheduler_view" },
  { prefix: "/documents", permission: "documents_view" },
  { prefix: "/content", permission: "settings_edit" },
] as const;

export function requiredPermissionForPath(pathname: string): PermissionKey | null {
  let match: { prefix: string; permission: PermissionKey } | null = null;
  for (const guard of ROUTE_PERMISSION_GUARDS) {
    if (pathname === guard.prefix || pathname.startsWith(`${guard.prefix}/`)) {
      if (!match || guard.prefix.length > match.prefix.length) {
        match = guard;
      }
    }
  }
  return match?.permission ?? null;
}

/**
 * When `allowedKeys` is null (DB unavailable), fall back to legacy caller-tier blocking.
 * When loaded, require the permission key in the matrix.
 */
export function pathAllowedByPermissions(
  pathname: string,
  allowedKeys: Set<string> | null,
  legacyCallerBlocked: boolean,
): boolean {
  const permission = requiredPermissionForPath(pathname);
  if (!permission) return true;
  if (allowedKeys === null) return !legacyCallerBlocked;
  return allowedKeys.has(permission);
}
