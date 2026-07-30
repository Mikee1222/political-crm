import { describe, expect, it } from "vitest";
import {
  contactHasAnyCampaignPhone,
  pickCampaignDialPhone,
} from "@/lib/campaign-contact-phone";
import {
  formatDurationGreek,
  resolveCampaignContactStatus,
} from "@/lib/campaign-contact-status";

describe("campaign-contact-phone", () => {
  it("detects any phone field", () => {
    expect(contactHasAnyCampaignPhone({ phone: null, phone2: null, landline: null })).toBe(false);
    expect(contactHasAnyCampaignPhone({ phone: "", phone2: "  ", landline: null })).toBe(false);
    expect(contactHasAnyCampaignPhone({ phone: null, phone2: "6912345678", landline: null })).toBe(
      true,
    );
    expect(contactHasAnyCampaignPhone({ phone: null, phone2: null, landline: "2101234567" })).toBe(
      true,
    );
  });

  it("picks dial phone preference order", () => {
    expect(
      pickCampaignDialPhone({ phone: "6911111111", phone2: "6922222222", landline: "2101111111" }),
    ).toBe("6911111111");
    expect(pickCampaignDialPhone({ phone: null, phone2: "6922222222", landline: "2101111111" })).toBe(
      "6922222222",
    );
    expect(pickCampaignDialPhone({ phone: "", phone2: "", landline: "2101111111" })).toBe(
      "2101111111",
    );
  });
});

describe("campaign-contact-status", () => {
  it("maps outcomes to status with lucide icon keys", () => {
    expect(resolveCampaignContactStatus([]).key).toBe("not_called");
    expect(resolveCampaignContactStatus([]).icon).toBe("circle");
    expect(resolveCampaignContactStatus(["Pending"]).key).toBe("pending");
    expect(resolveCampaignContactStatus(["Pending"]).icon).toBe("clock");
    expect(resolveCampaignContactStatus(["Συνδέθηκε με ΚΚ"]).key).toBe("connected");
    expect(resolveCampaignContactStatus(["Συνδέθηκε με ΚΚ"]).icon).toBe("link2");
    expect(resolveCampaignContactStatus(["Δεν ήθελε σύνδεση με ΚΚ"]).key).toBe("declined");
    expect(resolveCampaignContactStatus(["Δεν απάντησε"]).key).toBe("no_answer");
    expect(resolveCampaignContactStatus(["Δεν απάντησε"]).icon).toBe("phone-missed");
  });

  it("formats greek duration", () => {
    expect(formatDurationGreek(null)).toBe("—");
    expect(formatDurationGreek(45)).toBe("45δ");
    expect(formatDurationGreek(83)).toBe("1λ 23δ");
  });
});
