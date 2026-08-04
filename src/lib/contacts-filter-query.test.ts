import { describe, expect, it } from "vitest";
import {
  campaignFilterToListFilters,
  contactFilterHasCriteria,
  normalizeCampaignHasPhone,
  parseCampaignFilterBody,
  serializeCampaignFilter,
} from "@/lib/contacts-filter-query";

describe("contacts-filter-query campaign helpers", () => {
  it("maps age_groups to age_min/max like advanced search", () => {
    const f = campaignFilterToListFilters({
      age_groups: ["17-20", "70+"],
    });
    expect(f.age_min).toBe("17");
    expect(f.age_max).toBe("120");
  });

  it("maps municipality/toponym singles into list arrays", () => {
    const f = campaignFilterToListFilters({
      municipality: "Αγρίνιο",
      toponym: "Κέντρο",
      gender: "Άντρας",
      political_stance: "Κεντροδεξιός",
      exclude_group_ids: ["g1"],
    });
    expect(f.municipalities).toEqual(["Αγρίνιο"]);
    expect(f.toponyms).toEqual(["Κέντρο"]);
    expect(f.gender).toBe("Άντρας");
    expect(f.political_stance).toBe("Κεντροδεξιός");
    expect(f.exclude_group_ids).toEqual(["g1"]);
  });

  it("does not treat has_phone alone as audience criteria", () => {
    expect(contactFilterHasCriteria({ has_phone: "has" })).toBe(false);
    expect(contactFilterHasCriteria({ gender: "Γυναίκα" })).toBe(true);
    expect(contactFilterHasCriteria({ exclude_group_ids: ["x"] })).toBe(true);
  });

  it("serializes and parses filter payload round-trip", () => {
    const raw = parseCampaignFilterBody({
      call_status: "Pending",
      group_ids: ["a", "a", "b"],
      age_groups: ["20-40"],
      has_phone: "has",
      toponym: "Μεσολόγγι",
    });
    const ser = serializeCampaignFilter(raw);
    expect(ser.call_status).toBe("Pending");
    expect(ser.group_ids).toEqual(["a", "b"]);
    expect(ser.toponym).toBe("Μεσολόγγι");
    expect(ser.age_groups).toEqual(["20-40"]);
    expect(ser.age_min).toBe("20");
    expect(ser.age_max).toBe("40");
    expect(ser.has_phone).toBe("has");
  });

  it("normalizes has_phone defaults", () => {
    expect(normalizeCampaignHasPhone(undefined, true)).toBe("has");
    expect(normalizeCampaignHasPhone("any", true)).toBe("");
    expect(normalizeCampaignHasPhone("not")).toBe("not");
  });
});
