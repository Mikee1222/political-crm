/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, expect, it } from "vitest";
import { getDefaultRequestFilters } from "@/lib/requests-filters";
import {
  applyRequestListFiltersToBuilder,
  buildRequestListSelect,
  type RequestFilterResolution,
} from "@/lib/requests-query";

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
    notIn(...args: unknown[]) {
      calls.push({ method: "notIn", args });
      return q;
    },
    not(...args: unknown[]) {
      calls.push({ method: "not", args });
      return q;
    },
    or(...args: unknown[]) {
      calls.push({ method: "or", args });
      return q;
    },
    ilike(...args: unknown[]) {
      calls.push({ method: "ilike", args });
      return q;
    },
    gte(...args: unknown[]) {
      calls.push({ method: "gte", args });
      return q;
    },
    lte(...args: unknown[]) {
      calls.push({ method: "lte", args });
      return q;
    },
    get _calls() {
      return calls;
    },
  };
  return q;
}

function emptyResolution(overrides?: Partial<RequestFilterResolution>): RequestFilterResolution {
  return {
    categoryNames: [],
    excludeCategoryNames: [],
    requesterContactIds: [],
    affectedContactIds: [],
    helperContactIds: [],
    requesterRequestIds: null,
    affectedRequestIds: null,
    helperRequestIds: null,
    notesRequestIds: null,
    searchNotesRequestIds: null,
    handlerAssignedValues: null,
    noMatch: false,
    ...overrides,
  };
}

describe("buildRequestListSelect", () => {
  it("uses inner join embed when search filters contact names", () => {
    expect(buildRequestListSelect(true, true)).toContain("contacts!contact_id!inner");
  });
});

describe("applyRequestListFiltersToBuilder", () => {
  it("ANDs status, category include, and date range", () => {
    const f = {
      ...getDefaultRequestFilters(),
      status: "Ανοικτό",
      category_ids: ["Υγεία"],
      created_from: "2026-01-01",
      created_to: "2026-01-31",
    };
    const q = mockQuery();
    applyRequestListFiltersToBuilder(q, f, emptyResolution({ categoryNames: ["Υγεία"] }));
    expect(q._calls).toEqual(
      expect.arrayContaining([
        { method: "in", args: ["status", expect.any(Array)] },
        { method: "eq", args: ["category", "Υγεία"] },
        { method: "gte", args: ["created_at", "2026-01-01T00:00:00.000Z"] },
        { method: "lte", args: ["created_at", "2026-01-31T23:59:59.999Z"] },
      ]),
    );
  });

  it("applies category exclude via notIn", () => {
    const q = mockQuery();
    applyRequestListFiltersToBuilder(
      q,
      getDefaultRequestFilters(),
      emptyResolution({ excludeCategoryNames: ["Άλλο", "Υγεία"] }),
    );
    expect(q._calls).toContainEqual({ method: "notIn", args: ["category", ["Άλλο", "Υγεία"]] });
  });

  it("applies handler assigned_to with alias-expanded values", () => {
    const q = mockQuery();
    applyRequestListFiltersToBuilder(
      q,
      { ...getDefaultRequestFilters(), handler_id: "profile-uuid" },
      emptyResolution({ handlerAssignedValues: ["profile-uuid", "Gavriela Miliori", "LEGACY"] }),
    );
    expect(q._calls).toContainEqual({
      method: "in",
      args: ["assigned_to", ["profile-uuid", "Gavriela Miliori", "LEGACY"]],
    });
  });

  it("quotes ilike patterns and contact UUIDs in search or()", () => {
    const contactId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const q = mockQuery();
    applyRequestListFiltersToBuilder(
      q,
      { ...getDefaultRequestFilters(), search: "παροχή" },
      emptyResolution({
        searchNotesRequestIds: ["bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"],
      }),
      { withSearchEmbed: true, contactIdsFromPhone: [contactId] },
    );
    expect(q._calls).toHaveLength(1);
    const clause = String(q._calls[0]?.args[0]);
    expect(clause).toContain('title.ilike."%παροχή%"');
    expect(clause).toContain('contacts.first_name.ilike."%παροχή%"');
    expect(clause).toContain(`contact_id.in.("${contactId}")`);
    expect(clause).toContain(`id.in.("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")`);
  });

  it("uses sentinel when noMatch", () => {
    const q = mockQuery();
    applyRequestListFiltersToBuilder(q, getDefaultRequestFilters(), emptyResolution({ noMatch: true }));
    expect(q._calls).toEqual([{ method: "eq", args: ["id", "00000000-0000-0000-0000-000000000000"] }]);
  });

  it("ANDs requester and affected request id filters", () => {
    const requesterIds = ["11111111-1111-1111-1111-111111111111"];
    const affectedIds = ["22222222-2222-2222-2222-222222222222"];
    const q = mockQuery();
    applyRequestListFiltersToBuilder(
      q,
      getDefaultRequestFilters(),
      emptyResolution({
        requesterRequestIds: requesterIds,
        affectedRequestIds: affectedIds,
      }),
    );
    expect(q._calls).toEqual([
      { method: "in", args: ["id", requesterIds] },
      { method: "in", args: ["id", affectedIds] },
    ]);
  });

  it("filters request code with ilike", () => {
    const q = mockQuery();
    applyRequestListFiltersToBuilder(
      q,
      { ...getDefaultRequestFilters(), request_code: "AIT-42" },
      emptyResolution(),
    );
    expect(q._calls).toContainEqual({ method: "ilike", args: ["request_code", "%AIT-42%"] });
  });
});
