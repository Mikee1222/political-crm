/**
 * Sample CRM routes that return 403 for signed-in portal-only users (and redirect in middleware for pages).
 * See `checkCRMAccess` and `middleware.ts`.
 */
export const representativeCrmApiPathsBlockedForPortal = [
  "/api/contacts",
  "/api/requests",
  "/api/campaigns",
  "/api/dashboard",
  "/api/documents",
  "/api/admin/users",
] as const;
