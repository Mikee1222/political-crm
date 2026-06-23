import { describe, it, expect, beforeAll } from "vitest";
import {
  accessGrantExpiresAt,
  generateAccessCode,
  getAccessCodeWindowBounds,
} from "./access-code";

const ATHENS_TZ = "Europe/Athens";

function athensParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ATHENS_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

describe("accessGrantExpiresAt", () => {
  it("expires today at 17:00 Athens when before end of workday (summer)", () => {
    const from = new Date("2026-06-23T07:00:00.000Z"); // 10:00 EEST
    const expiresAt = accessGrantExpiresAt(from);
    const parts = athensParts(expiresAt);

    expect(parts.hour).toBe(17);
    expect(parts.minute).toBe(0);
    expect(parts.second).toBe(0);
    expect(parts.year).toBe(2026);
    expect(parts.month).toBe(6);
    expect(parts.day).toBe(23);
    expect(expiresAt.toISOString()).toBe("2026-06-23T14:00:00.000Z");
    expect(expiresAt.getTime()).toBeGreaterThan(from.getTime());
  });

  it("expires tomorrow at 17:00 Athens when after end of workday (summer)", () => {
    const from = new Date("2026-06-23T15:00:00.000Z"); // 18:00 EEST
    const expiresAt = accessGrantExpiresAt(from);
    const parts = athensParts(expiresAt);

    expect(parts.hour).toBe(17);
    expect(parts.minute).toBe(0);
    expect(parts.year).toBe(2026);
    expect(parts.month).toBe(6);
    expect(parts.day).toBe(24);
    expect(expiresAt.toISOString()).toBe("2026-06-24T14:00:00.000Z");
  });

  it("expires tomorrow at 17:00 Athens when entering exactly at 17:00", () => {
    const from = new Date("2026-06-23T14:00:00.000Z"); // 17:00 EEST
    const expiresAt = accessGrantExpiresAt(from);
    const parts = athensParts(expiresAt);

    expect(parts.hour).toBe(17);
    expect(parts.day).toBe(24);
    expect(expiresAt.toISOString()).toBe("2026-06-24T14:00:00.000Z");
  });

  it("expires today at 17:00 Athens one second before boundary", () => {
    const from = new Date("2026-06-23T13:59:59.000Z"); // 16:59:59 EEST
    const expiresAt = accessGrantExpiresAt(from);
    const parts = athensParts(expiresAt);

    expect(parts.hour).toBe(17);
    expect(parts.day).toBe(23);
    expect(expiresAt.toISOString()).toBe("2026-06-23T14:00:00.000Z");
  });

  it("handles winter (EET UTC+2) correctly", () => {
    const from = new Date("2026-01-15T08:00:00.000Z"); // 10:00 EET
    const expiresAt = accessGrantExpiresAt(from);

    expect(expiresAt.toISOString()).toBe("2026-01-15T15:00:00.000Z");
    expect(athensParts(expiresAt).hour).toBe(17);
  });

  it("returns a future instant from now", () => {
    const from = new Date();
    const expiresAt = accessGrantExpiresAt(from);
    expect(expiresAt.getTime()).toBeGreaterThan(from.getTime());
    expect(athensParts(expiresAt).hour).toBe(17);
    expect(athensParts(expiresAt).minute).toBe(0);
  });
});

describe("getAccessCodeWindowBounds", () => {
  it("uses 00:00–08:00 Athens window in summer", () => {
    const at = new Date("2026-06-23T04:00:00.000Z"); // 07:00 EEST
    const { from, until } = getAccessCodeWindowBounds(at);

    expect(from.toISOString()).toBe("2026-06-22T21:00:00.000Z"); // 00:00 EEST Jun 23
    expect(until.toISOString()).toBe("2026-06-23T05:00:00.000Z"); // 08:00 EEST Jun 23
  });

  it("uses 08:00–16:00 Athens window in summer", () => {
    const at = new Date("2026-06-23T09:00:00.000Z"); // 12:00 EEST
    const { from, until } = getAccessCodeWindowBounds(at);

    expect(from.toISOString()).toBe("2026-06-23T05:00:00.000Z"); // 08:00 EEST
    expect(until.toISOString()).toBe("2026-06-23T13:00:00.000Z"); // 16:00 EEST
  });

  it("uses 16:00–00:00 Athens window in summer", () => {
    const at = new Date("2026-06-23T15:00:00.000Z"); // 18:00 EEST
    const { from, until } = getAccessCodeWindowBounds(at);

    expect(from.toISOString()).toBe("2026-06-23T13:00:00.000Z"); // 16:00 EEST
    expect(until.toISOString()).toBe("2026-06-23T21:00:00.000Z"); // 00:00 EEST Jun 24
  });
});

describe("generateAccessCode", () => {
  beforeAll(() => {
    process.env.ACCESS_CODE_HMAC_SECRET = "test-secret-for-unit-tests-only";
  });

  it("uses consistent code within the same window", () => {
    const early = new Date("2026-06-23T05:30:00.000Z"); // 08:30 EEST
    const late = new Date("2026-06-23T12:00:00.000Z"); // 15:00 EEST
    expect(generateAccessCode(early)).toBe(generateAccessCode(late));
  });

  it("changes code at window boundary", () => {
    const before = new Date("2026-06-23T12:59:59.000Z"); // 15:59:59 EEST
    const after = new Date("2026-06-23T13:00:00.000Z"); // 16:00 EEST
    expect(generateAccessCode(before)).not.toBe(generateAccessCode(after));
  });

  it("uses 00:00 window at midnight (hour 24 from Intl)", () => {
    const midnight = new Date("2026-06-22T21:00:00.000Z"); // 00:00 EEST Jun 23
    const { from, until } = getAccessCodeWindowBounds(midnight);
    expect(from.toISOString()).toBe("2026-06-22T21:00:00.000Z");
    expect(until.toISOString()).toBe("2026-06-23T05:00:00.000Z");
    expect(generateAccessCode(midnight)).toBe(generateAccessCode(new Date("2026-06-23T04:00:00.000Z")));
  });
});
