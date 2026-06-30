import { describe, expect, it } from "vitest";
import { formatGreekContactName } from "./contact-display-name";

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
