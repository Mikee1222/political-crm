import type { SupabaseClient } from "@supabase/supabase-js";
import { contactMatchesFuzzyGreekSearch } from "@/lib/greek-fuzzy-name";

type ContactForSearch = {
  first_name: string;
  last_name: string;
  phone: string | null;
  nickname: string | null;
  area: string | null;
  municipality: string | null;
};

/** Fuzzy, accent-agnostic, Greek/ Latin name + nickname + area match (export & nameday). */
export function contactMatchesLocalSearch(c: ContactForSearch, search: string | null) {
  return contactMatchesFuzzyGreekSearch(c, search);
}

/**
 * Ίδιο φιλτράρισμα με GET /api/contacts — για export & bulk.
 */
export function buildContactsQuery(
  supabase: SupabaseClient,
  opts: {
    search?: string;
    call_status?: string;
    area?: string;
    municipality?: string;
    priority?: string;
    tag?: string;
  },
) {
  const { search: _search, call_status, area, municipality, priority, tag } = opts;
  void _search; /* in-memory fuzzy filter (export) after query */
  let query = supabase.from("contacts").select(
    "id, first_name, last_name, phone, email, area, municipality, electoral_district, call_status, priority, political_stance, notes, nickname, tags",
  );
  if (call_status) query = query.eq("call_status", call_status);
  if (area) query = query.eq("area", area);
  if (municipality) query = query.ilike("municipality", `%${municipality}%`);
  if (priority) query = query.eq("priority", priority);
  if (tag) query = query.contains("tags", [tag]);
  return query;
}
