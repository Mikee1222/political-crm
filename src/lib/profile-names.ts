import { createServiceClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Fetches `full_name` for profile ids (bypasses RLS via service client).
 * Returns empty map if service key is missing or the query fails.
 */
export async function fetchProfileNamesMap(
  admin: SupabaseClient,
  ids: (string | null | undefined)[],
): Promise<Map<string, string | null>> {
  const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  const m = new Map<string, string | null>();
  if (unique.length === 0) return m;
  const { data, error } = await admin.from("profiles").select("id, full_name").in("id", unique);
  if (error || !data) return m;
  for (const row of data as { id: string; full_name: string | null }[]) {
    m.set(row.id, row.full_name ?? null);
  }
  return m;
}

export function getServiceClientSafe(): SupabaseClient | null {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    return createServiceClient();
  } catch {
    return null;
  }
}

export async function resolveProfileNames(ids: (string | null | undefined)[]): Promise<Map<string, string | null>> {
  const admin = getServiceClientSafe();
  if (!admin) return new Map();
  return fetchProfileNamesMap(admin, ids);
}
