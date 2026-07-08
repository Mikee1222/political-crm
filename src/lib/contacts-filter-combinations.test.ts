import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, beforeAll, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getDefaultContactFilters, type ContactListFilters } from "@/lib/contacts-filters";
import { contactMatchesFuzzyGreekSearch } from "@/lib/greek-fuzzy-name";
import {
  contactRowMatchesListFilters,
  fetchContactRowsInBatches,
  filterContactRowsByListFilters,
  searchContactsByName,
} from "@/lib/contacts-query";
import { resolveContactListFilterIds } from "@/lib/contact-group-members";
import { searchContactsByFreeTextPaginated } from "@/lib/contact-group-members";
import { queryContactsListTotal } from "@/lib/contacts-list-api";
import type { ContactQueryPlanPath } from "@/lib/contacts-query";

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

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const hasSupabase = Boolean(SUPABASE_URL && SERVICE_KEY);

const INVALID_NUMBER_GROUP_ID = "981ac496-08f8-4348-8200-ffee32df4651";

const COUNT_SELECT =
  "id, first_name, last_name, father_name, phone, phone2, landline, nickname, area, municipality, toponym, gender, call_status, priority, tags, political_stance, birthday, age, electoral_district, predicted_score, is_volunteer, volunteer_area, last_contacted_at, may_not_have_mobile, may_not_have_landline, may_not_have_email";

type TestContext = {
  supabase: SupabaseClient;
  positiveGroupId: string;
  smallGroupId: string;
  sampleMunicipality: string;
  sampleGender: string;
};

function mergeFilters(patch: Partial<ContactListFilters>): ContactListFilters {
  return { ...getDefaultContactFilters(), ...patch };
}

type BaselineRow = Parameters<typeof contactRowMatchesListFilters>[0];

async function contactIdsInGroups(
  supabase: SupabaseClient,
  groupIds: string[],
): Promise<string[]> {
  const { data, error } = await supabase.rpc("get_contacts_in_groups", {
    group_ids: groupIds,
    match_mode: "or",
  });
  if (error) throw error;
  return Array.from(
    new Set((data ?? []).map((r: { contact_id: string }) => String(r.contact_id))),
  );
}

/** Independent expected count — no shared routing with queryContactsListTotal. */
async function baselineContactCount(
  supabase: SupabaseClient,
  f: ContactListFilters,
  partialLocation: boolean,
): Promise<number> {
  const resolution = await resolveContactListFilterIds(supabase, f);
  const excludeIds = resolution.excludeContactIds;

  const applyResolution = (rows: BaselineRow[]): BaselineRow[] => {
    let out = filterContactRowsByListFilters(rows, f, {
      partialLocation,
      excludeContactIds: excludeIds,
    });
    if (resolution.includeContactIds !== null) {
      const allow = new Set(resolution.includeContactIds);
      out = out.filter((r) => allow.has(String(r.id)));
    }
    return out;
  };

  if (f.search?.trim()) {
    if (
      !f.first_name &&
      !f.last_name &&
      !f.father_name &&
      !f.group_id &&
      f.group_ids.length === 0 &&
      f.exclude_group_ids.length === 0
    ) {
      const { total } = await searchContactsByFreeTextPaginated(supabase, {
        search: f.search,
        offset: 0,
        limit: 1,
      });
      return total;
    }
    const rows = await fetchContactRowsInBatches(supabase, COUNT_SELECT, (q) => q, 2000);
    return rows.filter((row) => {
      if (
        !contactMatchesFuzzyGreekSearch(
          row as Parameters<typeof contactMatchesFuzzyGreekSearch>[0],
          f.search,
        )
      ) {
        return false;
      }
      return contactRowMatchesListFilters(row as BaselineRow, f, {
        partialLocation,
        excludeContactIds: new Set(excludeIds),
      });
    }).length;
  }

  if (f.first_name?.trim() || f.last_name?.trim() || f.father_name?.trim()) {
    const rows = await searchContactsByName(supabase, {
      firstName: f.first_name || null,
      lastName: f.last_name || null,
      fatherName: f.father_name || null,
    });
    return applyResolution(rows as BaselineRow[]).length;
  }

  if (resolution.includeContactIds !== null) {
    const ids = resolution.includeContactIds;
    let matched = 0;
    for (let i = 0; i < ids.length; i += 80) {
      const chunk = ids.slice(i, i + 80);
      const { data, error } = await supabase.from("contacts").select(COUNT_SELECT).in("id", chunk);
      if (error) throw error;
      matched += applyResolution((data ?? []) as BaselineRow[]).length;
    }
    return matched;
  }

  const rows = await fetchContactRowsInBatches(
    supabase,
    COUNT_SELECT,
    (q) => {
      let query = q;
      if (f.gender) query = query.eq("gender", f.gender);
      if (f.municipalities.length === 1) {
        query = partialLocation
          ? query.ilike("municipality", `%${f.municipalities[0]}%`)
          : query.eq("municipality", f.municipalities[0]!);
      }
      return query;
    },
    2000,
  );
  return applyResolution(rows as BaselineRow[]).length;
}

describe.skipIf(!hasSupabase)("contacts filter combinations (integration)", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: groups, error: groupsErr } = await supabase
      .from("contact_groups")
      .select("id, name")
      .order("name");
    if (groupsErr) throw groupsErr;

    const positive = (groups ?? []).find((g) =>
      String(g.name).toUpperCase().startsWith("ΘΕΤΙΚΟΣ"),
    );
    if (!positive) throw new Error("ΘΕΤΙΚΟΣ group not found in contact_groups");

    const memberCounts = await Promise.all(
      (groups ?? []).slice(0, 50).map(async (g) => ({
        id: String(g.id),
        count: (await contactIdsInGroups(supabase, [String(g.id)])).length,
      })),
    );
    const small = memberCounts
      .filter((g) => g.count > 0 && g.count < 80)
      .sort((a, b) => b.count - a.count)[0];
    if (!small) throw new Error("No small group (<80 members) found for tests");

    const { data: sampleContact } = await supabase
      .from("contacts")
      .select("municipality, gender")
      .not("municipality", "is", null)
      .not("gender", "is", null)
      .limit(1)
      .maybeSingle();
    if (!sampleContact?.municipality || !sampleContact.gender) {
      throw new Error("Need a contact with municipality and gender for column filter tests");
    }

    ctx = {
      supabase,
      positiveGroupId: String(positive.id),
      smallGroupId: small.id,
      sampleMunicipality: String(sampleContact.municipality),
      sampleGender: String(sampleContact.gender),
    };
  });

  const cases: Array<{
    label: string;
    build: (c: TestContext) => ContactListFilters;
    expectPath?: ContactQueryPlanPath;
    expectInMemory?: boolean;
  }> = [
    { label: "name only", build: () => mergeFilters({ first_name: "Ιωάννης" }) },
    {
      label: "name + small include group",
      build: (c) => mergeFilters({ first_name: "Ιωάννης", group_ids: [c.smallGroupId] }),
      expectPath: "group-name-rpc",
    },
    {
      label: "name + large include group (ΘΕΤΙΚΟΣ)",
      build: (c) => mergeFilters({ first_name: "Ιωάννης", group_ids: [c.positiveGroupId] }),
      expectPath: "name-search-then-refine",
    },
    {
      label: "name + large exclude group (ΜΗ ΕΓΚΥΡΟΣ ΑΡΙΘΜΟΣ)",
      build: () =>
        mergeFilters({
          first_name: "Ιωάννης",
          exclude_group_ids: [INVALID_NUMBER_GROUP_ID],
        }),
      expectPath: "name-search-then-refine",
    },
    {
      label: "name + accented exclude group name",
      build: () =>
        mergeFilters({ first_name: "Ιωάννης", exclude_group_ids: ["Μη έγκυρος αριθμός"] }),
      expectPath: "name-search-then-refine",
    },
    {
      label: "name + multiple groups (include small + exclude large)",
      build: (c) =>
        mergeFilters({
          first_name: "Ιωάννης",
          group_ids: [c.smallGroupId],
          exclude_group_ids: [INVALID_NUMBER_GROUP_ID],
        }),
      expectPath: "group-name-rpc",
    },
    {
      label: "large exclude group only",
      build: () => mergeFilters({ exclude_group_ids: [INVALID_NUMBER_GROUP_ID] }),
      expectInMemory: true,
    },
    {
      label: "large include group only (ΘΕΤΙΚΟΣ)",
      build: (c) => mergeFilters({ group_ids: [c.positiveGroupId] }),
      expectInMemory: true,
    },
    {
      label: "small include group only",
      build: (c) => mergeFilters({ group_ids: [c.smallGroupId] }),
    },
    {
      label: "column filters only (gender + municipality)",
      build: (c) =>
        mergeFilters({
          gender: c.sampleGender,
          municipalities: [c.sampleMunicipality],
        }),
    },
    {
      label: "column filters + large exclude",
      build: (c) =>
        mergeFilters({
          gender: c.sampleGender,
          exclude_group_ids: [INVALID_NUMBER_GROUP_ID],
        }),
      expectInMemory: true,
    },
    {
      label: "column filters + large include + name",
      build: (c) =>
        mergeFilters({
          first_name: "Ιωάννης",
          gender: c.sampleGender,
          group_ids: [c.positiveGroupId],
        }),
      expectPath: "name-search-then-refine",
    },
    {
      label: "accented large include group name",
      build: () => mergeFilters({ group_ids: ["θετικος"] }),
      expectInMemory: true,
    },
    {
      label: "pure free-text search",
      build: () => mergeFilters({ search: "Ιωάννης" }),
      expectPath: "free-text-rpc",
    },
  ];

  for (const testCase of cases) {
    it(
      `${testCase.label}: API total matches baseline`,
      async () => {
        const f = testCase.build(ctx);
        const api = await queryContactsListTotal(ctx.supabase, f);
        const expected = await baselineContactCount(ctx.supabase, f, false);
        expect(api.total).toBe(expected);
        if (testCase.expectPath) {
          expect(api.plan.path).toBe(testCase.expectPath);
        }
        if (testCase.expectInMemory) {
          expect(api.plan.path).toBe("in-memory");
        }
      },
    );
  }

  it(
    "name=Ιωάννης + large exclude returns non-zero correct count",
    async () => {
      const f = mergeFilters({
        first_name: "Ιωάννης",
        exclude_group_ids: [INVALID_NUMBER_GROUP_ID],
      });
      const api = await queryContactsListTotal(ctx.supabase, f);
      expect(api.plan.path).toBe("name-search-then-refine");
      expect(api.total).toBeGreaterThan(0);
      const expected = await baselineContactCount(ctx.supabase, f, false);
      expect(api.total).toBe(expected);
    },
  );
});
