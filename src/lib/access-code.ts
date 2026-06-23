import crypto from "crypto";

const ATHENS_TZ = "Europe/Athens";
const END_OF_WORK_HOUR = 17;

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

type AthensParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getAthensParts(date: Date): AthensParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ATHENS_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  }).formatToParts(date);
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

/** Map an Athens wall-clock instant to UTC (handles DST via iterative correction). */
function athensWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
  second = 0,
): Date {
  let guess = new Date(Date.UTC(year, month - 1, day, hour - 3, minute, second));
  for (let i = 0; i < 4; i++) {
    const p = getAthensParts(guess);
    const target = Date.UTC(year, month - 1, day, hour, minute, second);
    const actual = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const diff = target - actual;
    if (diff === 0) break;
    guess = new Date(guess.getTime() + diff);
  }
  return guess;
}

function addAthensCalendarDays(year: number, month: number, day: number, days: number): AthensParts {
  const noon = athensWallClockToUtc(year, month, day, 12);
  const shifted = new Date(noon.getTime() + days * 24 * 60 * 60 * 1000);
  return getAthensParts(shifted);
}

/** Grant expires at the next 17:00 Europe/Athens (today if before 17:00, else tomorrow). */
export function accessGrantExpiresAt(from: Date = new Date()): Date {
  const athensNow = getAthensParts(from);
  let { year, month, day } = athensNow;

  const todayExpiry = athensWallClockToUtc(year, month, day, END_OF_WORK_HOUR, 0, 0);
  if (from.getTime() >= todayExpiry.getTime()) {
    ({ year, month, day } = addAthensCalendarDays(year, month, day, 1));
    return athensWallClockToUtc(year, month, day, END_OF_WORK_HOUR, 0, 0);
  }

  return todayExpiry;
}
