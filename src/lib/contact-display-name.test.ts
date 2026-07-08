import { describe, expect, it } from "vitest";
import { formatGreekContactName, formatGreekContactNameWithPhone } from "./contact-display-name";

describe("formatGreekContactName", () => {
  it("formats last first with father in brackets", () => {
    expect(formatGreekContactName("Παπαδόπουλος", "Γιώργος", "Νίκος")).toBe(
      "Παπαδόπουλος Γιώργος [του Νίκος]",
    );
  });

  it("omits father when missing", () => {
    expect(formatGreekContactName("Παπαδόπουλος", "Γιώργος", null)).toBe("Παπαδόπουλος Γιώργος");
  });

  it("returns fallback for empty names", () => {
    expect(formatGreekContactName("", "", "")).toBe("Επαφή");
  });
});

describe("formatGreekContactNameWithPhone", () => {
  it("appends phone with Greek label", () => {
    expect(
      formatGreekContactNameWithPhone("Παπαδόπουλος", "Γιώργος", "Νίκος", "6912345678"),
    ).toBe("Παπαδόπουλος Γιώργος [του Νίκος] — τηλ. 6912345678");
  });

  it("omits phone suffix when empty", () => {
    expect(formatGreekContactNameWithPhone("Παπαδόπουλος", "Γιώργος", null, null)).toBe(
      "Παπαδόπουλος Γιώργος",
    );
  });
});
