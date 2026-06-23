import { describe, expect, it } from "vitest";
import {
  applyContactIdExcludeFilter,
  applyContactIdIncludeFilter,
  NO_MATCH_CONTACT_ID,
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
