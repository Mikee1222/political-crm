import type { SupabaseClient } from "@supabase/supabase-js";
import {
  contactCelebratesNameday,
  normalizeGreekName,
  resolveNamedayNamesForDay,
} from "@/lib/namedays";

/** @deprecated Use `normalizeGreekName` from `@/lib/namedays`. */
export const normalizeGreek = normalizeGreekName;

export { normalizeGreekName, contactCelebratesNameday };

/** UUIDs of contacts whose first name or nickname matches the Orthodox calendar for that calendar day. */
export async function getContactIdsForNameDay(
  supabase: SupabaseClient,
  month: number,
  day: number,
): Promise<string[]> {
  const { data: namedayRows, error: ne } = await supabase
    .from("name_days")
    .select("names")
    .eq("month", month)
    .eq("day", day);
  if (ne) {
    console.error("[nameday] name_days", ne.message);
    return [];
  }
  const dbNames = (namedayRows ?? []).flatMap((r) => (r as { names?: string[] }).names ?? []);
  const todayNames = resolveNamedayNamesForDay(dbNames, month, day);
  if (todayNames.length === 0) return [];

  const { data: contacts, error: ce } = await supabase.from("contacts").select("id, first_name, nickname");
  if (ce) {
    console.error("[nameday] contacts", ce.message);
    return [];
  }
  const out: string[] = [];
  for (const c of (contacts ?? []) as { id: string; first_name: string; nickname: string | null }[]) {
    if (contactCelebratesNameday(c.first_name, c.nickname, todayNames)) {
      out.push(c.id);
    }
  }
  return out;
}
