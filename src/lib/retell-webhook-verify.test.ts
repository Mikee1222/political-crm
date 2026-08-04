import { describe, expect, it } from "vitest";
import {
  isRetellWebhookTestEvent,
  isRetellWebhookTokenUnset,
  verifyRetellWebhookSignature,
  verifyRetellWebhookUrlToken,
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

describe("verifyRetellWebhookUrlToken", () => {
  it("allows when expected token is unset (dev mode)", () => {
    expect(verifyRetellWebhookUrlToken(null, undefined).ok).toBe(true);
    expect(verifyRetellWebhookUrlToken(null, "").ok).toBe(true);
    expect(verifyRetellWebhookUrlToken(null, "  ").ok).toBe(true);
    expect(isRetellWebhookTokenUnset(undefined)).toBe(true);
    expect(isRetellWebhookTokenUnset("")).toBe(true);
  });

  it("rejects missing or wrong token when expected is set", () => {
    const badMissing = verifyRetellWebhookUrlToken(null, "secret-token");
    expect(badMissing.ok).toBe(false);
    if (!badMissing.ok) expect(badMissing.status).toBe(401);

    const badWrong = verifyRetellWebhookUrlToken("other", "secret-token");
    expect(badWrong.ok).toBe(false);
    if (!badWrong.ok) expect(badWrong.status).toBe(401);
  });

  it("accepts matching token", () => {
    expect(verifyRetellWebhookUrlToken("secret-token", "secret-token").ok).toBe(true);
    expect(isRetellWebhookTokenUnset("secret-token")).toBe(false);
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
