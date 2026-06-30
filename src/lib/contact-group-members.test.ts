/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, expect, it, vi } from "vitest";
import {
  applyContactIdExcludeFilter,
  applyContactIdIncludeFilter,
  applyGroupFiltersToQuery,
  buildGroupNameToIdMap,
  buildIdInOrFilter,
  groupIncludeFilterMatchesNone,
  groupNameLookupKey,
  NO_MATCH_CONTACT_ID,
  resolveGroupFilterContactIds,
  resolveGroupIdsToUuids,
} from "./contact-group-members";

function mockQuery() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const q = {
    eq(...args: unknown[]) {
      calls.push({ method: "eq", args });
      return q;
    },
    in(...args: unknown[]) {
      calls.push({ method: "in", args });
      return q;
    },
    or(...args: unknown[]) {
      calls.push({ method: "or", args });
      return q;
    },
    notIn(...args: unknown[]) {
      calls.push({ method: "notIn", args });
      return q;
    },
    not(...args: unknown[]) {
      calls.push({ method: "not", args });
      return q;
    },
    get _calls() {
      return calls;
    },
  };
  return q;
}

function mockRpcData(pages: Array<Array<{ contact_id: string }>>) {
  let callCount = 0;
  return vi.fn(() => ({
    range(_from: number, _to: number) {
      const page = pages[callCount] ?? [];
      callCount += 1;
      return Promise.resolve({
        data: page,
        error: null,
      });
    },
  }));
}

describe("applyContactIdIncludeFilter", () => {
  it("uses sentinel instead of in() for empty ids", () => {
    const q = mockQuery();
    applyContactIdIncludeFilter(q, []);
    expect(q._calls).toEqual([{ method: "eq", args: ["id", NO_MATCH_CONTACT_ID] }]);
  });

  it("uses in() for small id lists", () => {
    const q = mockQuery();
    const ids = ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"];
    applyContactIdIncludeFilter(q, ids);
    expect(q._calls).toEqual([{ method: "in", args: ["id", ids] }]);
  });

  it("chunks large id lists with or()", () => {
    const q = mockQuery();
    const ids = Array.from({ length: 85 }, (_, i) =>
      `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`,
    );
    applyContactIdIncludeFilter(q, ids);
    expect(q._calls).toHaveLength(1);
    expect(q._calls[0]?.method).toBe("or");
    const clause = String(q._calls[0]?.args[0]);
    expect(clause).toContain('id.in.("');
    expect(clause.split("id.in.(").length - 1).toBe(2);
  });

  it("quotes UUIDs in chunked or filter string", () => {
    const ids = [
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    ];
    const clause = buildIdInOrFilter([...ids, ...Array.from({ length: 79 }, (_, i) =>
      `${String(i + 2).padStart(8, "0")}-0000-4000-8000-000000000000`,
    )]);
    expect(clause).toMatch(/id\.in\.\("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"/);
  });
});

describe("applyContactIdExcludeFilter", () => {
  it("skips filter for empty ids", () => {
    const q = mockQuery();
    applyContactIdExcludeFilter(q, []);
    expect(q._calls).toEqual([]);
  });

  it("uses notIn for exclude ids", () => {
    const q = mockQuery();
    const ids = ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"];
    applyContactIdExcludeFilter(q, ids);
    expect(q._calls).toEqual([{ method: "notIn", args: ["id", ids] }]);
  });
});

describe("resolveGroupFilterContactIds", () => {
  const groupA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const groupB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const contact1 = "11111111-1111-1111-1111-111111111111";
  const contact2 = "22222222-2222-2222-2222-222222222222";

  it("calls RPC with or mode for multiple include groups", async () => {
    const rpc = mockRpcData([[{ contact_id: contact1 }, { contact_id: contact2 }]]);
    const supabase = {
      from: () => ({
        select: () =>
          Promise.resolve({
            data: [
              { id: groupA, name: "Group A" },
              { id: groupB, name: "Group B" },
            ],
            error: null,
          }),
      }),
      rpc,
    };

    const result = await resolveGroupFilterContactIds(supabase as never, {
      group_id: "",
      group_ids: [groupA, groupB],
      exclude_group_ids: [],
      group_match: "or",
    });

    expect(rpc).toHaveBeenCalledWith("get_contacts_in_groups", {
      group_ids: [groupA, groupB],
      match_mode: "or",
    });
    expect(result.includeContactIds).toEqual([contact1, contact2]);
    expect(result.excludeContactIds).toEqual([]);
  });

  it("calls RPC with and mode when group_match is and", async () => {
    const rpc = mockRpcData([[{ contact_id: contact1 }]]);
    const supabase = {
      from: () => ({
        select: () =>
          Promise.resolve({
            data: [
              { id: groupA, name: "Group A" },
              { id: groupB, name: "Group B" },
            ],
            error: null,
          }),
      }),
      rpc,
    };

    const result = await resolveGroupFilterContactIds(supabase as never, {
      group_id: "",
      group_ids: [groupA, groupB],
      exclude_group_ids: [],
      group_match: "and",
    });

    expect(rpc).toHaveBeenCalledWith("get_contacts_in_groups", {
      group_ids: [groupA, groupB],
      match_mode: "and",
    });
    expect(result.includeContactIds).toEqual([contact1]);
  });

  it("resolves exclude groups via RPC with or mode", async () => {
    const rpc = mockRpcData([[{ contact_id: contact2 }]]);
    const supabase = {
      from: () => ({
        select: () =>
          Promise.resolve({
            data: [{ id: groupB, name: "Group B" }],
            error: null,
          }),
      }),
      rpc,
    };

    const result = await resolveGroupFilterContactIds(supabase as never, {
      group_id: "",
      group_ids: [],
      exclude_group_ids: [groupB],
      group_match: "or",
    });

    expect(rpc).toHaveBeenCalledWith("get_contacts_in_groups", {
      group_ids: [groupB],
      match_mode: "or",
    });
    expect(result.includeContactIds).toBeNull();
    expect(result.excludeContactIds).toEqual([contact2]);
  });

  it("paginates RPC when a group has more than 1000 members", async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({
      contact_id: `${String(i).padStart(8, "0")}-0000-4000-8000-000000000001`,
    }));
    const page2 = [{ contact_id: "ffffffff-ffff-ffff-ffff-ffffffffffff" }];
    const rpc = mockRpcData([page1, page2]);
    const supabase = {
      from: () => ({
        select: () =>
          Promise.resolve({
            data: [{ id: groupA, name: "Group A" }],
            error: null,
          }),
      }),
      rpc,
    };

    const result = await resolveGroupFilterContactIds(supabase as never, {
      group_id: "",
      group_ids: [groupA],
      exclude_group_ids: [],
      group_match: "or",
    });

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(result.includeContactIds).toHaveLength(1001);
    expect(result.includeContactIds).toContain("ffffffff-ffff-ffff-ffff-ffffffffffff");
  });
});

describe("groupIncludeFilterMatchesNone", () => {
  const groupA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

  it("returns false when no include group filter", async () => {
    const supabase = { from: vi.fn(), rpc: vi.fn() };
    await expect(
      groupIncludeFilterMatchesNone(supabase as never, {
        group_id: "",
        group_ids: [],
        exclude_group_ids: [],
        group_match: "or",
      }),
    ).resolves.toBe(false);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("returns true when RPC returns no contacts", async () => {
    const rpc = mockRpcData([[]]);
    const supabase = {
      from: () => ({
        select: () =>
          Promise.resolve({
            data: [{ id: groupA, name: "Group A" }],
            error: null,
          }),
      }),
      rpc,
    };

    await expect(
      groupIncludeFilterMatchesNone(supabase as never, {
        group_id: "",
        group_ids: [groupA],
        exclude_group_ids: [],
        group_match: "or",
      }),
    ).resolves.toBe(true);
  });
});

describe("applyGroupFiltersToQuery", () => {
  const groupA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const contact1 = "11111111-1111-1111-1111-111111111111";

  it("applies chunked include filter from RPC", async () => {
    const rpc = mockRpcData([[{ contact_id: contact1 }]]);
    const supabase = {
      from: () => ({
        select: () =>
          Promise.resolve({
            data: [{ id: groupA, name: "Group A" }],
            error: null,
          }),
      }),
      rpc,
    };
    const q = mockQuery();

    await applyGroupFiltersToQuery(
      supabase as never,
      {
        group_id: "",
        group_ids: [groupA],
        exclude_group_ids: [],
        group_match: "or",
      },
      q,
    );

    expect(rpc).toHaveBeenCalledWith("get_contacts_in_groups", {
      group_ids: [groupA],
      match_mode: "or",
    });
    expect(q._calls).toEqual([{ method: "in", args: ["id", [contact1]] }]);
  });
});

describe("searchContactsInGroups", () => {
  const groupA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

  it("calls search_contacts_in_groups RPC with name params and paginates", async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({
      id: `${String(i).padStart(8, "0")}-0000-4000-8000-000000000001`,
      first_name: "Μαρία",
      last_name: "Παπ",
      created_at: "2026-01-01",
    }));
    const page2 = [
      {
        id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
        first_name: "Μαρία",
        last_name: "Νικ",
        created_at: "2026-01-02",
      },
    ];
    let callCount = 0;
    const pages = [page1, page2];
    const rpc = vi.fn(() => ({
      range(_from: number, _to: number) {
        const page = pages[callCount] ?? [];
        callCount += 1;
        return Promise.resolve({ data: page, error: null });
      },
    }));
    const supabase = { rpc };

    const { searchContactsInGroups } = await import("./contact-group-members");
    const rows = await searchContactsInGroups(supabase as never, {
      groupIds: [groupA],
      firstName: "ΜΑΡΙΑ",
      lastName: null,
      matchMode: "or",
    });

    expect(rpc).toHaveBeenCalledWith("search_contacts_in_groups", {
      p_group_ids: [groupA],
      p_first_name: "ΜΑΡΙΑ",
      p_last_name: null,
      p_match_mode: "or",
    });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rows).toHaveLength(1001);
  });
});

describe("searchContactsByGroupsPaginated", () => {
  const groupA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

  it("calls get_contacts_by_groups_paginated RPC with offset/limit and reads total", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          first_name: "Μαρία",
          last_name: "Παπ",
          created_at: "2026-01-01",
          total: 23936,
        },
      ],
      error: null,
    });
    const supabase = { rpc };

    const { searchContactsByGroupsPaginated } = await import("./contact-group-members");
    const result = await searchContactsByGroupsPaginated(supabase as never, {
      groupIds: [groupA],
      offset: 50,
      limit: 50,
    });

    expect(rpc).toHaveBeenCalledWith("get_contacts_by_groups_paginated", {
      p_group_ids: [groupA],
      p_offset: 50,
      p_limit: 50,
    });
    expect(result.total).toBe(23936);
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0]).not.toHaveProperty("total");
  });
});

describe("searchContactsInGroupsFiltered", () => {
  const groupA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

  it("calls search_contacts_in_groups_filtered RPC with column filters and pagination", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          first_name: "Γιώργος",
          gender: "Άντρας",
          created_at: "2026-01-01",
          total: 120,
        },
      ],
      error: null,
    });
    const supabase = { rpc };

    const { searchContactsInGroupsFiltered } = await import("./contact-group-members");
    const result = await searchContactsInGroupsFiltered(supabase as never, {
      groupIds: [groupA],
      matchMode: "and",
      gender: "Άντρας",
      municipalities: ["Αθήνα"],
      callStatuses: ["Positive", "Negative"],
      politicalStance: "Center",
      toponyms: ["Κέντρο"],
      partialLocation: true,
      offset: 0,
      limit: 25,
    });

    expect(rpc).toHaveBeenCalledWith("search_contacts_in_groups_filtered", {
      p_group_ids: [groupA],
      p_match_mode: "and",
      p_gender: "Άντρας",
      p_municipalities: ["Αθήνα"],
      p_call_status: null,
      p_call_statuses: ["Positive", "Negative"],
      p_political_stance: "Center",
      p_toponyms: ["Κέντρο"],
      p_partial_location: true,
      p_offset: 0,
      p_limit: 25,
    });
    expect(result.total).toBe(120);
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0]).not.toHaveProperty("total");
  });
});

describe("resolveGroupIdsToUuids", () => {
  const invalidGroupId = "981ac496-08f8-4348-8200-ffee32df4651";

  it("matches group names accent-insensitively", async () => {
    const supabase = {
      from: () => ({
        select: () =>
          Promise.resolve({
            data: [{ id: invalidGroupId, name: "ΜΗ ΕΓΚΥΡΟΣ ΑΡΙΘΜΟΣ" }],
            error: null,
          }),
      }),
    };

    const ids = await resolveGroupIdsToUuids(supabase as never, ["Μη έγκυρος αριθμός"]);
    expect(ids).toEqual([invalidGroupId]);
  });

  it("buildGroupNameToIdMap keys align with phone-audit label spelling", () => {
    const map = buildGroupNameToIdMap([{ id: invalidGroupId, name: "ΜΗ ΕΓΚΥΡΟΣ ΑΡΙΘΜΟΣ" }]);
    expect(map.get(groupNameLookupKey("Μη έγκυρος αριθμός"))).toBe(invalidGroupId);
  });
});
