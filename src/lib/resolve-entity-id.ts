import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EP_CODE = /^EP-\d+$/i;
const AIT_CODE = /^AIT-\d+$/i;

/** Resolve contacts.id from UUID or EP-000001 display code. */
export async function resolveContactId(
  supabase: SupabaseClient,
  idOrCode: string,
): Promise<string | null> {
  const raw = idOrCode.trim();
  if (!raw) return null;
  if (UUID_RE.test(raw)) return raw;
  if (EP_CODE.test(raw)) {
    const { data } = await supabase
      .from("contacts")
      .select("id")
      .eq("contact_code", raw.toUpperCase())
      .maybeSingle();
    return (data as { id: string } | null)?.id ?? null;
  }
  return null;
}

/** Resolve requests.id from UUID or AIT-000001 display code. */
export async function resolveRequestId(
  supabase: SupabaseClient,
  idOrCode: string,
): Promise<string | null> {
  const raw = idOrCode.trim();
  if (!raw) return null;
  if (UUID_RE.test(raw)) return raw;
  if (AIT_CODE.test(raw)) {
    const { data } = await supabase
      .from("requests")
      .select("id")
      .eq("request_code", raw.toUpperCase())
      .maybeSingle();
    return (data as { id: string } | null)?.id ?? null;
  }
  return null;
}
