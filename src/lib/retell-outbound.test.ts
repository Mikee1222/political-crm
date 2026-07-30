import { describe, expect, it } from "vitest";
import {
  formatGreekPhoneForRetell,
  pickRetellDialPhone,
  buildCreatePhoneCallBody,
} from "@/lib/retell-outbound";

describe("formatGreekPhoneForRetell", () => {
  it("replaces 0030 prefix with +30", () => {
    expect(formatGreekPhoneForRetell("00306943129495")).toBe("+306943129495");
    expect(formatGreekPhoneForRetell("0030 210 444 6076")).toBe("+302104446076");
  });

  it("adds + when digits start with 30 and length is 12", () => {
    expect(formatGreekPhoneForRetell("306943129495")).toBe("+306943129495");
    expect(formatGreekPhoneForRetell("30 2104446076")).toBe("+302104446076");
  });

  it("adds +30 for 10-digit numbers starting with 6 or 2", () => {
    expect(formatGreekPhoneForRetell("6943129495")).toBe("+306943129495");
    expect(formatGreekPhoneForRetell("2104446076")).toBe("+302104446076");
    expect(formatGreekPhoneForRetell("69 12 34 56 78")).toBe("+306912345678");
  });

  it("leaves numbers that already have + (digits only after +)", () => {
    expect(formatGreekPhoneForRetell("+306943129495")).toBe("+306943129495");
    expect(formatGreekPhoneForRetell("+30 694 312 9495")).toBe("+306943129495");
  });

  it("returns null for empty or unusable values", () => {
    expect(formatGreekPhoneForRetell(null)).toBeNull();
    expect(formatGreekPhoneForRetell("")).toBeNull();
    expect(formatGreekPhoneForRetell("   ")).toBeNull();
    expect(formatGreekPhoneForRetell("12345")).toBeNull();
    expect(formatGreekPhoneForRetell("8123456789")).toBeNull();
    expect(formatGreekPhoneForRetell("301234")).toBeNull();
  });
});

describe("pickRetellDialPhone", () => {
  it("prefers first available valid number among phone / phone2 / landline", () => {
    expect(
      pickRetellDialPhone({
        phone: "6941111111",
        phone2: "6942222222",
        landline: "2101111111",
      }),
    ).toBe("+306941111111");
    expect(
      pickRetellDialPhone({
        phone: "bad",
        phone2: "6942222222",
        landline: "2101111111",
      }),
    ).toBe("+306942222222");
    expect(
      pickRetellDialPhone({
        phone: null,
        phone2: "",
        landline: "2101111111",
      }),
    ).toBe("+302101111111");
    expect(pickRetellDialPhone({ phone: "x", phone2: null, landline: null })).toBeNull();
  });
});

describe("buildCreatePhoneCallBody", () => {
  it("includes first_name / last_name dynamic variables and contact/campaign metadata", () => {
    const prevFrom = process.env.RETELL_FROM_NUMBER;
    const prevAgent = process.env.RETELL_AGENT_ID;
    process.env.RETELL_FROM_NUMBER = "+302104446076";
    process.env.RETELL_AGENT_ID = "agent_test";
    try {
      const body = buildCreatePhoneCallBody(
        "+306943129495",
        "Γιάννης",
        "Παπαδόπουλος",
        "contact-1",
        "campaign-1",
      );
      expect(body.to_number).toBe("+306943129495");
      expect(body.retell_llm_dynamic_variables).toEqual({
        first_name: "Γιάννης",
        last_name: "Παπαδόπουλος",
        contact_id: "contact-1",
        campaign_id: "campaign-1",
      });
      expect(body.metadata).toMatchObject({
        first_name: "Γιάννης",
        last_name: "Παπαδόπουλος",
        contact_id: "contact-1",
        campaign_id: "campaign-1",
      });
    } finally {
      if (prevFrom === undefined) delete process.env.RETELL_FROM_NUMBER;
      else process.env.RETELL_FROM_NUMBER = prevFrom;
      if (prevAgent === undefined) delete process.env.RETELL_AGENT_ID;
      else process.env.RETELL_AGENT_ID = prevAgent;
    }
  });
});
