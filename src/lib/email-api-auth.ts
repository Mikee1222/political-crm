import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { checkCRMAccess } from "@/lib/crm-api-access";

export async function requireManagerEmail() {
  const crm = await checkCRMAccess();
  if (!crm.allowed) {
    return { error: crm.response };
  }
  if (!hasMinRole(crm.profile?.role, "manager")) {
    return { error: forbidden() };
  }
  return { user: crm.user, profile: crm.profile, supabase: crm.supabase };
}
