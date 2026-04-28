import type { SupabaseClient } from "@supabase/supabase-js";

export function normalizeGreek(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u03c2/g, "\u03c3");
}

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
  const todayNames = (namedayRows ?? []).flatMap((r) => (r as { names?: string[] }).names ?? []);
  if (todayNames.length === 0) return [];
  const namesSet = new Set(todayNames.map((n) => normalizeGreek(String(n))));
  const { data: contacts, error: ce } = await supabase.from("contacts").select("id, first_name, nickname");
  if (ce) {
    console.error("[nameday] contacts", ce.message);
    return [];
  }
  const out: string[] = [];
  for (const c of (contacts ?? []) as { id: string; first_name: string; nickname: string | null }[]) {
    const fn = normalizeGreek(c.first_name ?? "");
    const nn = normalizeGreek(c.nickname ?? "");
    if (namesSet.has(fn) || (nn.length > 0 && namesSet.has(nn))) {
      out.push(c.id);
    }
  }
  return out;
}
