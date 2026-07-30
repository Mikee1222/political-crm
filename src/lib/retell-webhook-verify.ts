import { createHmac, timingSafeEqual } from "crypto";

/**
 * Dashboard / curl connectivity checks (no call processing).
 * These may arrive without `x-retell-signature`; real call events still require HMAC in production.
 */
export function isRetellWebhookTestEvent(body: unknown): boolean {
  if (body == null || typeof body !== "object") return false;
  const ev = (body as { event?: unknown }).event;
  if (typeof ev !== "string") return false;
  const n = ev.trim().toLowerCase();
  return n === "test" || n === "ping" || n === "webhook_test";
}

/**
 * Verifies Retell webhook `x-retell-signature` per
 * https://docs.retellai.com/features/secure-webhook
 * Message: rawBody + timestamp (ms), key: webhook signing secret (Retell API key with webhook badge),
 * HMAC-SHA256 hex.
 */
export function verifyRetellWebhookSignature(
  rawBody: string,
  apiKey: string | undefined,
  signatureHeader: string | null,
): boolean {
  if (!apiKey?.trim() || !signatureHeader?.trim()) return false;
  const m = /^v=(\d+),d=([0-9a-f]+)$/i.exec(signatureHeader.trim());
  if (!m) return false;
  const timestamp = m[1];
  const digest = m[2];
  const now = Date.now();
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > 5 * 60 * 1000) return false;
  const h = createHmac("sha256", apiKey);
  h.update(rawBody + timestamp);
  const expected = h.digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(digest, "hex"));
  } catch {
    return false;
  }
}
