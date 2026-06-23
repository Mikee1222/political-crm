import { describe, expect, it, vi } from "vitest";
import {
  applyContactIdExcludeFilter,
  applyContactIdIncludeFilter,
  applyGroupFiltersToQuery,
  groupIncludeFilterMatchesNone,
  NO_MATCH_CONTACT_ID,
  resolveGroupFilterContactIds,
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
    expect(clause).toContain("id.in.(");
    expect(clause.split("id.in.(").length - 1).toBe(2);
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
    const rpc = vi.fn().mockResolvedValue({
      data: [{ contact_id: contact1 }, { contact_id: contact2 }],
      error: null,
    });
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
    const rpc = vi.fn().mockResolvedValue({
      data: [{ contact_id: contact1 }],
      error: null,
    });
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
    const rpc = vi.fn().mockResolvedValue({
      data: [{ contact_id: contact2 }],
      error: null,
    });
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
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
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
    const rpc = vi.fn().mockResolvedValue({
      data: [{ contact_id: contact1 }],
      error: null,
    });
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
