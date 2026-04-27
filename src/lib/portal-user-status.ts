import { createServiceClient } from "@/lib/supabase/admin";

/**
 * Pure logic from service-role profile + optional portal_users row. Exported for unit tests.
 */
export function isPortalUserFromServiceReads(
  profile: { is_portal: boolean } | null,
  hasPortalUserRow: boolean,
): boolean {
  if (profile) {
    return Boolean((profile as { is_portal?: boolean }).is_portal);
  }
  return hasPortalUserRow;
}

type AdminClient = ReturnType<typeof createServiceClient>;

export async function isPortalOnlyUserWithAdmin(
  admin: AdminClient,
  userId: string,
): Promise<boolean> {
  const { data: prof } = await admin
    .from("profiles")
    .select("is_portal")
    .eq("id", userId)
    .maybeSingle();
  if (prof) {
    return isPortalUserFromServiceReads(
      { is_portal: Boolean((prof as { is_portal?: boolean }).is_portal) },
      false,
    );
  }
  const { data: pu } = await admin
    .from("portal_users")
    .select("id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  return isPortalUserFromServiceReads(null, Boolean(pu));
}

export async function isPortalOnlyUser(userId: string): Promise<boolean> {
  const admin = createServiceClient();
  return isPortalOnlyUserWithAdmin(admin, userId);
}
