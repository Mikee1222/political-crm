import type { SupabaseClient } from "@supabase/supabase-js";

export type MunicipalityWithCount = { name: string; contact_count: number };
export type ToponymWithCount = { id: string; name: string; contact_count: number };

export async function listContactMunicipalitiesWithCounts(
  service: SupabaseClient,
): Promise<MunicipalityWithCount[]> {
  const { data, error } = await service.rpc("get_contact_municipality_counts");
  if (error) throw error;

  type RpcRow = { name?: string; contact_count?: number | string };
  return (data as RpcRow[] | null ?? [])
    .map((row) => ({
      name: String(row.name ?? "").trim(),
      contact_count: Number(row.contact_count ?? 0),
    }))
    .filter((row) => row.name)
    .sort((a, b) => a.name.localeCompare(b.name, "el"));
}

export async function countContactsByMunicipality(service: SupabaseClient, name: string): Promise<number> {
  const trimmed = name.trim();
  if (!trimmed) return 0;
  const { count, error } = await service
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("municipality", trimmed);
  if (error) throw error;
  return count ?? 0;
}

/** Contacts store toponym as text (not toponym_id); counts match contacts.toponym to toponyms.name. */
export async function listToponymsWithContactCounts(service: SupabaseClient): Promise<ToponymWithCount[]> {
  const { data, error } = await service.rpc("get_contact_toponym_counts");
  if (error) throw error;

  type RpcRow = { id?: string; name?: string; contact_count?: number | string };
  return (data as RpcRow[] | null ?? [])
    .map((row) => ({
      id: String(row.id ?? ""),
      name: String(row.name ?? "").trim(),
      contact_count: Number(row.contact_count ?? 0),
    }))
    .filter((row) => row.id && row.name && row.name.length > 2);
}

export async function countContactsByToponymName(service: SupabaseClient, name: string): Promise<number> {
  const trimmed = name.trim();
  if (!trimmed) return 0;
  const { count, error } = await service
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("toponym", trimmed);
  if (error) throw error;
  return count ?? 0;
}

export async function countContactsByToponymId(service: SupabaseClient, id: string): Promise<number> {
  const { data: row, error: fetchErr } = await service.from("toponyms").select("name").eq("id", id).maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!row?.name) return 0;
  return countContactsByToponymName(service, String(row.name));
}
