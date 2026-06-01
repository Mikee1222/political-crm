import { describe, expect, it } from "vitest";
import {
  contactHasGreekLandline,
  contactHasGreekMobile,
  getContactAutoFlags,
  isContactDeceased,
} from "./get-contact-auto-flags";

describe("getContactAutoFlags", () => {
  it("detects mobile 69 in phone or phone2", () => {
    expect(contactHasGreekMobile({ phone: "6912345678" })).toBe(true);
    expect(contactHasGreekMobile({ phone2: "+30 69 1234 5678" })).toBe(true);
    expect(contactHasGreekMobile({ phone: "2101234567" })).toBe(false);
  });

  it("detects landline 2 in any phone field", () => {
    expect(contactHasGreekLandline({ landline: "2101234567" })).toBe(true);
    expect(contactHasGreekLandline({ phone: "2101234567" })).toBe(true);
    expect(contactHasGreekLandline({ phone: "6912345678" })).toBe(false);
  });

  it("returns badges only when conditions hold", () => {
    expect(
      getContactAutoFlags({
        phone: "6912345678",
        landline: "2101234567",
        email: "a@b.gr",
        is_dead: false,
      }),
    ).toEqual({
      noMobile: false,
      noLandline: false,
      noEmail: false,
      deceased: false,
    });

    expect(
      getContactAutoFlags({
        phone: null,
        phone2: null,
        landline: null,
        email: "",
      }),
    ).toMatchObject({
      noMobile: true,
      noLandline: true,
      noEmail: true,
    });
  });

  it("marks deceased from is_dead or ΑΠΕΒΙΩΣΕ group", () => {
    expect(isContactDeceased({ is_dead: true })).toBe(true);
    expect(
      isContactDeceased({
        all_groups: [{ name: "ΑΠΕΒΙΩΣΕ" }],
      }),
    ).toBe(true);
    expect(
      isContactDeceased({
        group_names: ["Άλλη", "απεβίωσε"],
      }),
    ).toBe(true);
  });
});
