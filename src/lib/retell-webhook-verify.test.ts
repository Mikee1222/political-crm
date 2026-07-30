import { describe, expect, it } from "vitest";
import {
  isRetellWebhookTestEvent,
  verifyRetellWebhookSignature,
} from "@/lib/retell-webhook-verify";
import { createHmac } from "crypto";

describe("isRetellWebhookTestEvent", () => {
  it("accepts test / ping / webhook_test (case-insensitive)", () => {
    expect(isRetellWebhookTestEvent({ event: "test" })).toBe(true);
    expect(isRetellWebhookTestEvent({ event: "TEST" })).toBe(true);
    expect(isRetellWebhookTestEvent({ event: " ping " })).toBe(true);
    expect(isRetellWebhookTestEvent({ event: "webhook_test" })).toBe(true);
  });

  it("rejects real call events and non-objects", () => {
    expect(isRetellWebhookTestEvent({ event: "call_ended" })).toBe(false);
    expect(isRetellWebhookTestEvent({ event: "call_started" })).toBe(false);
    expect(isRetellWebhookTestEvent({})).toBe(false);
    expect(isRetellWebhookTestEvent(null)).toBe(false);
    expect(isRetellWebhookTestEvent("test")).toBe(false);
  });
});

describe("verifyRetellWebhookSignature", () => {
  it("returns false when signature header is missing", () => {
    expect(verifyRetellWebhookSignature('{"event":"call_ended"}', "secret", null)).toBe(false);
  });

  it("accepts a valid HMAC within the time window", () => {
    const apiKey = "test-api-key";
    const rawBody = '{"event":"call_ended"}';
    const ts = String(Date.now());
    const digest = createHmac("sha256", apiKey).update(rawBody + ts).digest("hex");
    expect(
      verifyRetellWebhookSignature(rawBody, apiKey, `v=${ts},d=${digest}`),
    ).toBe(true);
  });
});
