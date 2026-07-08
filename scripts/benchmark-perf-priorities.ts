import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fetchContactRowsInBatches } from "@/lib/contacts-query";
import { contactMatchesFuzzyGreekSearch } from "@/lib/greek-fuzzy-name";
import {
  searchContactsByFreeTextPaginated,
  searchContactsByGroupsPaginated,
} from "@/lib/contact-group-members";

const PAGE_SIZE = 50;
const GROUP_LABEL_PREFIX = "ΘΕΤΙΚΟΣ";
const FREE_TEXT_TERM = "Ιωάν";
const ID_CHUNK = 80;
const COUNT_SELECT =
  "id, first_name, last_name, phone, phone2, landline, nickname, area, municipality, toponym";
const GROUP_SELECT =
  "id, first_name, last_name, phone, phone2, landline, email, area, municipality, toponym, gender, call_status, priority, tags, nickname, contact_code, age, political_stance, group_id, birthday, predicted_score, is_volunteer, volunteer_role, volunteer_area, volunteer_since, language, last_contacted_at, father_name, name_day, is_dead, electoral_district, may_not_have_mobile, may_not_have_landline, may_not_have_email, created_at";

function loadLocalEnv(): void {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!process.env[key]) {
      process.env[key] = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    }
  }
}

async function legacyGroupOnlyFirstPage(
  supabase: SupabaseClient,
  groupId: string,
): Promise<{ ms: number; total: number; returned: number }> {
  const startedAt = Date.now();
  const allIds: string[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .rpc("get_contacts_in_groups", { group_ids: [groupId], match_mode: "or" })
      .range(from, from + 999);
    if (error) throw error;
    const page = (data ?? []).map((row: { contact_id: string }) => String(row.contact_id));
    allIds.push(...page);
    if (page.length < 1000) break;
    from += 1000;
  }
  const ids = [...new Set(allIds)];
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK);
    const { data, error } = await supabase
      .from("contacts")
      .select(GROUP_SELECT)
      .in("id", chunk);
    if (error) throw error;
    rows.push(...((data ?? []) as Record<string, unknown>[]));
  }
  rows.sort((a, b) => {
    const ta = new Date(String(a.created_at ?? 0)).getTime();
    const tb = new Date(String(b.created_at ?? 0)).getTime();
    return tb - ta;
  });
  const pageRows = rows.slice(0, PAGE_SIZE);
  return { ms: Date.now() - startedAt, total: rows.length, returned: pageRows.length };
}

async function legacyFreeTextFirstPage(
  supabase: SupabaseClient,
  term: string,
): Promise<{ ms: number; total: number; returned: number }> {
  const startedAt = Date.now();
  const rows = await fetchContactRowsInBatches(
    supabase,
    COUNT_SELECT,
    (query) => query,
    2000,
  );
  const matched = rows.filter((row) =>
    contactMatchesFuzzyGreekSearch(
      row as Parameters<typeof contactMatchesFuzzyGreekSearch>[0],
      term,
    ),
  );
  return { ms: Date.now() - startedAt, total: matched.length, returned: matched.slice(0, PAGE_SIZE).length };
}

async function main() {
  loadLocalEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) throw new Error("Missing Supabase env");

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: groups, error: groupsErr } = await supabase
    .from("contact_groups")
    .select("id,name")
    .order("name");
  if (groupsErr) throw groupsErr;
  const largeGroup = (groups ?? []).find((g) =>
    String(g.name).toUpperCase().startsWith(GROUP_LABEL_PREFIX),
  );
  if (!largeGroup) throw new Error(`Group ${GROUP_LABEL_PREFIX} not found`);

  const legacyGroup = await legacyGroupOnlyFirstPage(supabase, String(largeGroup.id));
  const optimizedGroup = await (async () => {
    const startedAt = Date.now();
    const { contacts, total } = await searchContactsByGroupsPaginated(supabase, {
      groupIds: [String(largeGroup.id)],
      offset: 0,
      limit: PAGE_SIZE,
    });
    return { ms: Date.now() - startedAt, total, returned: contacts.length };
  })();

  const legacyFreeText = await legacyFreeTextFirstPage(supabase, FREE_TEXT_TERM);
  const optimizedFreeText = await (async () => {
    const startedAt = Date.now();
    const { contacts, total } = await searchContactsByFreeTextPaginated(supabase, {
      search: FREE_TEXT_TERM,
      offset: 0,
      limit: PAGE_SIZE,
    });
    return { ms: Date.now() - startedAt, total, returned: contacts.length };
  })();

  console.log("=== Priority 1: Large group-only first page ===");
  console.log(
    `legacy=${legacyGroup.ms}ms total=${legacyGroup.total} returned=${legacyGroup.returned} group=${largeGroup.name}`,
  );
  console.log(
    `optimized=${optimizedGroup.ms}ms total=${optimizedGroup.total} returned=${optimizedGroup.returned}`,
  );
  console.log(`speedup=${(legacyGroup.ms / Math.max(optimizedGroup.ms, 1)).toFixed(2)}x`);

  console.log("\n=== Priority 2: Free-text first page ===");
  console.log(
    `legacy=${legacyFreeText.ms}ms total=${legacyFreeText.total} returned=${legacyFreeText.returned} search="${FREE_TEXT_TERM}"`,
  );
  console.log(
    `optimized=${optimizedFreeText.ms}ms total=${optimizedFreeText.total} returned=${optimizedFreeText.returned}`,
  );
  console.log(`speedup=${(legacyFreeText.ms / Math.max(optimizedFreeText.ms, 1)).toFixed(2)}x`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
