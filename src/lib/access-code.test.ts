import { describe, it, expect } from "vitest";
import { accessGrantExpiresAt } from "./access-code";

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
