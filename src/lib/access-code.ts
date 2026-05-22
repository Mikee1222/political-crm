import crypto from "crypto";

function hmacSecret(): string {
  const key = process.env.ACCESS_CODE_HMAC_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Missing ACCESS_CODE_HMAC_SECRET or SUPABASE_SERVICE_ROLE_KEY");
  return key.slice(0, 32);
}

/** Deterministic 6-digit code for the current UTC hour. */
export function generateHourlyCode(at: Date = new Date()): string {
  const hourKey = `${at.getUTCFullYear()}-${at.getUTCMonth()}-${at.getUTCDate()}-${at.getUTCHours()}`;
  const hmac = crypto.createHmac("sha256", hmacSecret()).update(hourKey).digest("hex");
  return String((parseInt(hmac.slice(0, 6), 16) % 900000) + 100000);
}

export function getHourBounds(at: Date = new Date()): { from: Date; until: Date } {
  const from = new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(), at.getUTCHours(), 0, 0, 0),
  );
  const until = new Date(from);
  until.setUTCHours(until.getUTCHours() + 1);
  return { from, until };
}

export function minutesUntil(until: Date): number {
  return Math.max(0, Math.ceil((until.getTime() - Date.now()) / 60_000));
}

export const ACCESS_GRANT_HOURS = 8;

export function accessGrantExpiresAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + ACCESS_GRANT_HOURS * 60 * 60 * 1000);
}
