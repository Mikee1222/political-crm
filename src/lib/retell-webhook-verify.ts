import { createHmac, timingSafeEqual } from "crypto";

/**
 * Primary webhook auth is a shared URL token (`?token=` / RETELL_WEBHOOK_TOKEN).
 * Retell does not provide a signing secret — HMAC is optional only if
 * RETELL_WEBHOOK_SECRET is explicitly set.
 * Dashboard / curl connectivity checks (event test/ping) skip optional HMAC.
 */

export type RetellWebhookAuthResult =
  | { ok: true }
  | { ok: false; status: 401; error: string };

/** True when token env is unset (caller should log a warning). */
export function isRetellWebhookTokenUnset(
  expectedToken: string | undefined = process.env.RETELL_WEBHOOK_TOKEN,
): boolean {
  return !expectedToken?.trim();
}

/**
 * URL token gate: when RETELL_WEBHOOK_TOKEN is set, `token` query must match.
 * When unset, allow (caller logs a warning for local/dev).
 */
export function verifyRetellWebhookUrlToken(
  tokenParam: string | null | undefined,
  expectedToken: string | undefined = process.env.RETELL_WEBHOOK_TOKEN,
): RetellWebhookAuthResult {
  const expected = expectedToken?.trim();
  if (!expected) {
    return { ok: true };
  }
  if ((tokenParam ?? "") !== expected) {
    return { ok: false, status: 401, error: "Μη έγκυρο webhook token" };
  }
  return { ok: true };
}

export function isRetellWebhookTestEvent(body: unknown): boolean {
  if (body == null || typeof body !== "object") return false;
  const ev = (body as { event?: unknown }).event;
  if (typeof ev !== "string") return false;
  const n = ev.trim().toLowerCase();
  return n === "test" || n === "ping" || n === "webhook_test";
}

/**
 * Optional Retell webhook `x-retell-signature` verify when RETELL_WEBHOOK_SECRET
 * is explicitly configured. Message: rawBody + timestamp (ms), HMAC-SHA256 hex.
 * Never use RETELL_API_KEY as the signing key.
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
