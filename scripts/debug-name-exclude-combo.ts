/**
 * One-off debug: name + exclude_group_ids routing and counts.
 * Usage: npx tsx scripts/debug-name-exclude-combo.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { getDefaultContactFilters } from "../src/lib/contacts-filters";
import {
  canUseNameColumnFastPath,
  canUseNameOnlyFuzzySearchPath,
  explainInMemoryContactListPipelineDecision,
  filterContactRowsByListFilters,
  hasColumnListFilters,
  searchContactsByName,
} from "../src/lib/contacts-query";
import {
  resolveContactListFilterIds,
  resolveGroupIdsToUuids,
} from "../src/lib/contact-group-members";
import { contactFieldMatchesFuzzyName } from "../src/lib/greek-fuzzy-name";

function loadEnvFile(path: string): void {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1]!.trim()] = m[2]!.trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* optional */
  }
}

loadEnvFile(join(process.cwd(), ".env.local"));

const EXCLUDE_GROUP = "981ac496-08f8-4348-8200-ffee32df4651";
const FIRST_NAME = "Ιωάννης";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(url, key);
  const base = getDefaultContactFilters();
  const nameOnly = { ...base, first_name: FIRST_NAME };
  const nameExclude = { ...base, first_name: FIRST_NAME, exclude_group_ids: [EXCLUDE_GROUP] };

  console.log("=== routing ===");
  console.log("nameOnly", {
    canUseNameOnlyFuzzySearchPath: canUseNameOnlyFuzzySearchPath(nameOnly),
    canUseNameColumnFastPath: canUseNameColumnFastPath(nameOnly),
    hasColumnListFilters: hasColumnListFilters(nameOnly),
  });
  console.log("nameExclude", {
    canUseNameOnlyFuzzySearchPath: canUseNameOnlyFuzzySearchPath(nameExclude),
    canUseNameColumnFastPath: canUseNameColumnFastPath(nameExclude),
    hasColumnListFilters: hasColumnListFilters(nameExclude),
  });

  const nameRows = await searchContactsByName(supabase, { firstName: FIRST_NAME });
  console.log("\n=== name-only RPC count ===", nameRows.length);

  const resolvedUuids = await resolveGroupIdsToUuids(supabase, [EXCLUDE_GROUP]);
  const filterResolution = await resolveContactListFilterIds(supabase, nameExclude);
  const pipelineDecision = explainInMemoryContactListPipelineDecision(
    nameExclude,
    filterResolution.includeContactIds,
    filterResolution.excludeContactIds,
  );

  console.log("\n=== exclude resolution ===");
  console.log({
    resolvedExcludeGroupUuids: resolvedUuids,
    excludeContactIdsCount: filterResolution.excludeContactIds.length,
    needsInMemoryContactListPipeline: pipelineDecision.needsInMemory,
    pipelineDecisionReason: pipelineDecision.reason,
    pipelineDecisionChecks: pipelineDecision.checks,
  });

  const filtered = filterContactRowsByListFilters(
    nameRows as Parameters<typeof filterContactRowsByListFilters>[0],
    nameExclude,
    {
      excludeContactIds: filterResolution.excludeContactIds,
    },
  );
  console.log("\n=== combo (name RPC + in-memory exclude) ===", filtered.length);

  const excludeSet = new Set(filterResolution.excludeContactIds);
  const overlap = nameRows.filter((r) => excludeSet.has(String(r.id))).length;
  const nicknameOnlyDropped = nameRows.filter((r) => {
    const inExclude = excludeSet.has(String(r.id));
    if (inExclude) return false;
    const matchesFirst = contactFieldMatchesFuzzyName(
      r.first_name as string | null | undefined,
      FIRST_NAME,
    );
    const matchesNick = contactFieldMatchesFuzzyName(
      r.nickname as string | null | undefined,
      FIRST_NAME,
    );
    return !matchesFirst && matchesNick;
  }).length;
  console.log("\n=== overlap analysis ===", {
    nameRpcCount: nameRows.length,
    inExcludeGroup: overlap,
    afterExcludeFilter: filtered.length,
    nicknameOnlyWouldDrop: nicknameOnlyDropped,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
