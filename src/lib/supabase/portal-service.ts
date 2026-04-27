import { createServiceClient } from "@/lib/supabase/admin";
import { supabaseAnon } from "@/lib/supabase/anon";

/** Service role (bypasses RLS) when `SUPABASE_SERVICE_ROLE_KEY` is set; otherwise anon for local dev. */
export function getPortalServiceOrAnon() {
  try {
    return createServiceClient();
  } catch {
    return supabaseAnon;
  }
}
