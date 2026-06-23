import type { SupabaseClient } from "@supabase/supabase-js";
import { isUuid } from "@/lib/resolve-entity-id";

export type StaffAlias = {
  id: string;
  profile_id: string;
  alias_name: string;
  profile_full_name?: string | null;
  created_at?: string;
};

export type UnlinkedLegacyName = {
  name: string;
  usage_count: number;
};

export type StaffProfileRow = {
  id: string;
  full_name: string | null;
  aliases: StaffAlias[];
};

export function buildAliasToProfileMap(aliases: StaffAlias[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const a of aliases) {
    const alias = a.alias_name?.trim();
    const profileName = a.profile_full_name?.trim();
    if (!alias || !profileName) continue;
    map.set(alias.toLowerCase(), profileName);
  }
  return map;
}

/** Returns profile full_name when alias matched, else original authorName. */
export function resolveAuthorName(authorName: string, aliases: StaffAlias[]): string {
  const raw = authorName?.trim();
  if (!raw) return authorName;
  const resolved = buildAliasToProfileMap(aliases).get(raw.toLowerCase());
  return resolved ?? authorName;
}

export function groupAliasesByProfile(
  profiles: { id: string; full_name: string | null }[],
  aliases: StaffAlias[],
): StaffProfileRow[] {
  const byProfile = new Map<string, StaffAlias[]>();
  for (const a of aliases) {
    const list = byProfile.get(a.profile_id) ?? [];
    list.push(a);
    byProfile.set(a.profile_id, list);
  }
  return profiles.map((p) => ({
    id: p.id,
    full_name: p.full_name,
    aliases: byProfile.get(p.id) ?? [],
  }));
}

/** Values for requests.assigned_to filter (profile id, full_name, linked aliases). */
export async function resolveHandlerAssignedValues(
  supabase: SupabaseClient,
  handlerId: string,
): Promise<string[]> {
  const raw = handlerId.trim();
  if (!raw) return [];

  if (!isUuid(raw)) {
    return [raw];
  }

  const values = new Set<string>([raw]);
  const [{ data: aliasRows }, { data: prof }] = await Promise.all([
    supabase.from("staff_aliases").select("alias_name").eq("profile_id", raw),
    supabase.from("profiles").select("full_name").eq("id", raw).maybeSingle(),
  ]);

  for (const row of aliasRows ?? []) {
    const n = (row as { alias_name: string }).alias_name?.trim();
    if (n) values.add(n);
  }

  const fullName = (prof as { full_name?: string | null } | null)?.full_name?.trim();
  if (fullName) values.add(fullName);

  return [...values];
}

export async function fetchStaffAliasesWithProfiles(supabase: SupabaseClient): Promise<{
  aliases: StaffAlias[];
  profiles: StaffProfileRow[];
}> {
  const [{ data: aliasRows, error: aliasErr }, { data: profileRows, error: profErr }] = await Promise.all([
    supabase
      .from("staff_aliases")
      .select("id, profile_id, alias_name, created_at, profiles(full_name)")
      .order("alias_name", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("is_portal", false)
      .order("full_name", { ascending: true, nullsFirst: false }),
  ]);

  if (aliasErr) throw aliasErr;
  if (profErr) throw profErr;

  const aliases: StaffAlias[] = (aliasRows ?? []).map((row) => {
    const r = row as {
      id: string;
      profile_id: string;
      alias_name: string;
      created_at?: string;
      profiles?: { full_name: string | null } | { full_name: string | null }[] | null;
    };
    const prof = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    return {
      id: r.id,
      profile_id: r.profile_id,
      alias_name: r.alias_name,
      created_at: r.created_at,
      profile_full_name: prof?.full_name ?? null,
    };
  });

  const profiles = groupAliasesByProfile(
    (profileRows ?? []) as { id: string; full_name: string | null }[],
    aliases,
  );

  return { aliases, profiles };
}

export async function fetchUnlinkedLegacyNames(
  supabase: SupabaseClient,
  limit = 50,
): Promise<UnlinkedLegacyName[]> {
  const { data, error } = await supabase.rpc("get_unlinked_legacy_author_names", {
    p_limit: limit,
  });
  if (error) throw error;
  return ((data ?? []) as { name: string; usage_count: number | string }[]).map((row) => ({
    name: row.name,
    usage_count: typeof row.usage_count === "string" ? parseInt(row.usage_count, 10) : row.usage_count,
  }));
}
