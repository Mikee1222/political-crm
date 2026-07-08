import { describe, expect, it } from "vitest";
import { buildActiveFilterSummaryLabel } from "@/lib/search-filter-summary";
import { getDefaultContactFilters } from "@/lib/contacts-filters";
import { getDefaultRequestFilters } from "@/lib/requests-filters";

describe("buildActiveFilterSummaryLabel", () => {
  it("returns null when no chips", () => {
    expect(buildActiveFilterSummaryLabel([])).toBeNull();
  });

  it("shows plain contact name for first+last only", () => {
    const f = {
      ...getDefaultContactFilters(),
      first_name: "ΙΩΑΝΝΗΣ",
      last_name: "ΠΑΠΑΔΟΠΟΥΛΟΣ",
    };
    const label = buildActiveFilterSummaryLabel(
      [
        { key: "first_name", label: "Όνομα: ΙΩΑΝΝΗΣ" },
        { key: "last_name", label: "Επώνυμο: ΠΑΠΑΔΟΠΟΥΛΟΣ" },
      ],
      { contactFilters: f },
    );
    expect(label).toBe("ΙΩΑΝΝΗΣ ΠΑΠΑΔΟΠΟΥΛΟΣ");
  });

  it("shows plain search text for a single search chip", () => {
    const f = { ...getDefaultContactFilters(), search: "SOFIA ZGABI" };
    expect(
      buildActiveFilterSummaryLabel([{ key: "search", label: "Αναζήτηση: SOFIA ZGABI" }], {
        contactFilters: f,
      }),
    ).toBe("SOFIA ZGABI");
  });

  it("keeps category label for a single category chip", () => {
    expect(
      buildActiveFilterSummaryLabel([{ key: "cat:1", label: "Κατηγορία: ΔΕΗ" }], {
        requestFilters: getDefaultRequestFilters(),
      }),
    ).toBe("Κατηγορία: ΔΕΗ");
  });

  it("shows plain requester name for a single person filter", () => {
    const f = {
      ...getDefaultRequestFilters(),
      requester_contact_id: "abc",
      requester_name: "ΙΩΑΝΝΗΣ ΠΑΠΑΔΟΠΟΥΛΟΣ",
    };
    expect(
      buildActiveFilterSummaryLabel(
        [{ key: "requester_contact_id", label: "Αιτών: ΙΩΑΝΝΗΣ ΠΑΠΑΔΟΠΟΥΛΟΣ" }],
        { requestFilters: f },
      ),
    ).toBe("ΙΩΑΝΝΗΣ ΠΑΠΑΔΟΠΟΥΛΟΣ");
  });

  it("counts multiple unrelated filters", () => {
    expect(
      buildActiveFilterSummaryLabel([
        { key: "status", label: "Κατάσταση: ανοιχτό" },
        { key: "cat:1", label: "Κατηγορία: ΔΕΗ" },
        { key: "notes", label: "Σημειώσεις: τεστ" },
      ]),
    ).toBe("3 φίλτρα ενεργά");
  });
});
