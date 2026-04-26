import type { SupabaseClient } from "@supabase/supabase-js";

const EP_RE = /^EP-(\d+)$/;
const AIT_RE = /^AIT-(\d+)$/;

/**
 * Next human-readable code from existing rows (e.g. EP-000001).
 */
export async function nextPaddedCode(
  supabase: SupabaseClient,
  table: "contacts" | "requests",
  column: "contact_code" | "request_code",
  prefix: "EP" | "AIT",
): Promise<string> {
  const re = prefix === "EP" ? EP_RE : AIT_RE;
  const { data, error } = await supabase
    .from(table)
    .select(column)
    .not(column, "is", null)
    .order(column, { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[nextPaddedCode]", error);
  }

  let maxN = 0;
  const raw = (data as Record<string, string | null> | null)?.[column];
  if (raw && re.test(raw)) {
    const m = raw.match(re);
    if (m?.[1]) maxN = parseInt(m[1], 10);
  }
  return `${prefix}-${String(maxN + 1).padStart(6, "0")}`;
}
