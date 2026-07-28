import { describe, expect, it } from "vitest";
import {
  extractPhoneSearchDigits,
  isPhoneOnlyQuery,
  MIN_PHONE_SEARCH_DIGITS,
  phoneDigitsContainsOrFilter,
  shouldRunPhoneSearch,
} from "@/lib/phone-search";

describe("phone-search", () => {
  it("strips spaces, dashes, parentheses before searching", () => {
    expect(extractPhoneSearchDigits("6941 669788")).toBe("6941669788");
    expect(extractPhoneSearchDigits("(210) 699-5667")).toBe("2106995667");
    expect(extractPhoneSearchDigits("+30 6934 901998")).toBe("306934901998");
  });

  it("detects phone-only queries including punctuation", () => {
    expect(isPhoneOnlyQuery("6941")).toBe(true);
    expect(isPhoneOnlyQuery("6941 66")).toBe(true);
    expect(isPhoneOnlyQuery("Μαρία")).toBe(false);
    expect(isPhoneOnlyQuery("Μαρία 6941")).toBe(false);
  });

  it(`triggers phone search only after ${MIN_PHONE_SEARCH_DIGITS}+ digits`, () => {
    expect(shouldRunPhoneSearch("694")).toBe(false);
    expect(shouldRunPhoneSearch("6941")).toBe(true);
    expect(shouldRunPhoneSearch("69 41")).toBe(true);
    expect(shouldRunPhoneSearch("Μαρία")).toBe(false);
  });

  it("builds contains ilike filter on digit columns", () => {
    expect(phoneDigitsContainsOrFilter("6941")).toBe(
      "phone_digits.ilike.%6941%,phone2_digits.ilike.%6941%,landline_digits.ilike.%6941%",
    );
  });
});
