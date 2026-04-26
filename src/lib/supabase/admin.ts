import { createClient } from "@supabase/supabase-js";

/**
 * Χρήση μόνο στα API routes. Απαιτεί SUPABASE_SERVICE_ROLE_KEY.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("Λείπει το SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
