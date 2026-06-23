import { describe, expect, it, vi } from "vitest";
import {
  alexandraContactSearchLimit,
  normalizeContactSearchFilters,
  parseNameSearchTokens,
  searchAlexandraContacts,
} from "@/lib/alexandra-contact-search";

describe("alexandraContactSearchLimit", () => {
  it("defaults to 75 and caps at 100", () => {
    expect(alexandraContactSearchLimit({})).toBe(75);
    expect(alexandraContactSearchLimit({ limit: 50 })).toBe(50);
    expect(alexandraContactSearchLimit({ limit: 200 })).toBe(100);
  });
});

describe("parseNameSearchTokens", () => {
  it("splits Greek full name into first and last", () => {
    expect(parseNameSearchTokens("Μαρία Παπαδοπούλου")).toEqual({
      firstName: "Μαρία",
      lastName: "Παπαδοπούλου",
      fatherName: null,
    });
  });

  it("treats middle tokens as father name", () => {
    expect(parseNameSearchTokens("Γιώργος Ιωάννη Παπαδόπουλος")).toEqual({
      firstName: "Γιώργος",
      lastName: "Παπαδόπουλος",
      fatherName: "Ιωάννη",
    });
  });
});

describe("normalizeContactSearchFilters", () => {
  it("maps name to search and splits into first/last columns", () => {
    expect(normalizeContactSearchFilters({ name: "Μαρία Παπα" })).toEqual({
      first_name: "Μαρία",
      last_name: "Παπα",
    });
  });
});

describe("searchAlexandraContacts", () => {
  it("uses RPC path for single-token name search", async () => {
    const rpc = vi.fn().mockReturnValue({
      range: vi.fn().mockResolvedValue({
        data: [{ id: "1", first_name: "Μαρία", last_name: "Α", phone: "6900000000" }],
        error: null,
      }),
    });
    const supabase = { rpc, from: vi.fn() };

    const hits = await searchAlexandraContacts(supabase as never, {
      search: "ΜΑΡΙΑ",
      limit: 10,
    });

    expect(rpc).toHaveBeenCalledWith("search_contacts_by_name", {
      p_first_name: "ΜΑΡΙΑ",
      p_last_name: null,
      p_father_name: null,
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.first_name).toBe("Μαρία");
  });

  it("uses exact ilike for phone lookup", async () => {
    const or = vi.fn().mockReturnThis();
    const limit = vi.fn().mockResolvedValue({
      data: [{ id: "2", first_name: "A", last_name: "B", phone: "6911111111" }],
      error: null,
    });
    const supabase = {
      rpc: vi.fn(),
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ or, limit }),
      }),
    };

    await searchAlexandraContacts(supabase as never, { phone: "6911111111" });

    expect(or).toHaveBeenCalledWith(
      "phone.ilike.%6911111111%,phone2.ilike.%6911111111%,landline.ilike.%6911111111%",
    );
  });
});
