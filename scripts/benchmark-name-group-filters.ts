import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getDefaultContactFilters, type ContactListFilters } from "@/lib/contacts-filters";
import { queryContactsListTotal } from "@/lib/contacts-list-api";
import {
  filterContactRowsByListFilters,
  searchContactsByName,
} from "@/lib/contacts-query";
import { resolveContactListFilterIds } from "@/lib/contact-group-members";

function loadLocalEnv(): void {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    if (!process.env[k]) process.env[k] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
}

loadLocalEnv();

const INVALID_NUMBER_GROUP_ID = "981ac496-08f8-4348-8200-ffee32df4651";

type BaselineRow = Parameters<typeof filterContactRowsByListFilters>[0][number];

/**
 * OLD approach (pre-inversion): resolve the FULL include/exclude group contact-id lists first
 * (contactIdsForGroups → ~25 paginated RPC round trips for a 24k group), THEN name-search and
 * filter the name set against the resolved id Set in memory.
 */
async function oldApproach(
  supabase: SupabaseClient,
  f: ContactListFilters,
): Promise<{ total: number; ms: number; phases: Record<string, number> }> {
  const phases: Record<string, number> = {};
  const t0 = Date.now();

  const tResolve = Date.now();
  const resolution = await resolveContactListFilterIds(supabase, f);
  phases.resolveFullGroupIds = Date.now() - tResolve;

  const tName = Date.now();
  let rows = (await searchContactsByName(supabase, {
    firstName: f.first_name || null,
    lastName: f.last_name || null,
    fatherName: f.father_name || null,
  })) as BaselineRow[];
  phases.searchContactsByName = Date.now() - tName;

  const tFilter = Date.now();
  rows = filterContactRowsByListFilters(rows, f, {
    excludeContactIds: resolution.excludeContactIds,
  });
  if (resolution.includeContactIds !== null) {
    const allow = new Set(resolution.includeContactIds);
    rows = rows.filter((r) => allow.has(String(r.id)));
  }
  phases.inMemoryFilter = Date.now() - tFilter;

  return { total: rows.length, ms: Date.now() - t0, phases };
}

async function newApproach(
  supabase: SupabaseClient,
  f: ContactListFilters,
): Promise<{ total: number; ms: number; path: string; subPath?: string }> {
  const t0 = Date.now();
  const r = await queryContactsListTotal(supabase, f);
  return { total: r.total, ms: Date.now() - t0, path: r.plan.path, subPath: r.subPath };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) {
    console.error("Missing Supabase env");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: groups } = await supabase.from("contact_groups").select("id, name").order("name");
  const positive = (groups ?? []).find((g) => String(g.name).toUpperCase().startsWith("ΘΕΤΙΚΟΣ"));
  if (!positive) throw new Error("ΘΕΤΙΚΟΣ group not found");

  // Warm the connection + RPC plan cache so the first timed case isn't skewed by cold start.
  await searchContactsByName(supabase, { firstName: "Ιωάννης", lastName: null, fatherName: null });

  const cases: Array<{ label: string; patch: Partial<ContactListFilters> }> = [
    { label: "name only", patch: { first_name: "Ιωάννης" } },
    {
      label: "name + large exclude group",
      patch: { first_name: "Ιωάννης", exclude_group_ids: [INVALID_NUMBER_GROUP_ID] },
    },
    {
      label: "name + large include group (ΘΕΤΙΚΟΣ)",
      patch: { first_name: "Ιωάννης", group_ids: [String(positive.id)] },
    },
    {
      label: "name + gender + large include group",
      patch: { first_name: "Ιωάννης", group_ids: [String(positive.id)], gender: "Άνδρας" },
    },
  ];

  console.log("=".repeat(90));
  for (const { label, patch } of cases) {
    const f: ContactListFilters = { ...getDefaultContactFilters(), ...patch };
    const oldR = await oldApproach(supabase, f);
    const newR = await newApproach(supabase, f);
    const speedup = oldR.ms > 0 ? (oldR.ms / Math.max(newR.ms, 1)).toFixed(1) : "n/a";
    console.log(`\n▶ ${label}`);
    console.log(
      `  OLD  ${String(oldR.ms).padStart(6)}ms  total=${oldR.total}  ` +
        `[resolveFullGroupIds=${oldR.phases.resolveFullGroupIds}ms, ` +
        `searchByName=${oldR.phases.searchContactsByName}ms, ` +
        `inMemoryFilter=${oldR.phases.inMemoryFilter}ms]`,
    );
    console.log(
      `  NEW  ${String(newR.ms).padStart(6)}ms  total=${newR.total}  ` +
        `path=${newR.path}${newR.subPath ? ` (${newR.subPath})` : ""}`,
    );
    console.log(
      `  Δ    ${speedup}x faster  ${oldR.total === newR.total ? "✓ counts match" : "✗ COUNT MISMATCH"}`,
    );
  }
  console.log("\n" + "=".repeat(90));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
