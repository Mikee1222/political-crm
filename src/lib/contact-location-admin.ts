import type { SupabaseClient } from "@supabase/supabase-js";

export type MunicipalityWithCount = { name: string; contact_count: number };
export type ToponymWithCount = { id: string; name: string; contact_count: number };

const BATCH = 1000;

export async function listContactMunicipalitiesWithCounts(
  service: SupabaseClient,
): Promise<MunicipalityWithCount[]> {
  const counts = new Map<string, number>();
  let from = 0;

  while (true) {
    const { data, error } = await service
      .from("contacts")
      .select("municipality")
      .not("municipality", "is", null)
      .range(from, from + BATCH - 1);

    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      const name = String(row.municipality ?? "").trim();
      if (!name) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }

    if (data.length < BATCH) break;
    from += BATCH;
  }

  const { data: geo } = await service.from("municipalities").select("name");
  for (const row of geo ?? []) {
    const name = String(row.name ?? "").trim();
    if (name && !counts.has(name)) counts.set(name, 0);
  }

  return Array.from(counts.entries())
    .map(([name, contact_count]) => ({ name, contact_count }))
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

export async function listToponymsWithContactCounts(service: SupabaseClient): Promise<ToponymWithCount[]> {
  const { data: tops, error } = await service.from("toponyms").select("id, name").order("name", { ascending: true });
  if (error) throw error;

  const rows: ToponymWithCount[] = [];
  for (const t of tops ?? []) {
    const name = String(t.name ?? "").trim();
    if (!name) continue;
    const contact_count = await countContactsByToponymName(service, name);
    rows.push({ id: t.id as string, name, contact_count });
  }
  return rows;
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
