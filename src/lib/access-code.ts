import crypto from "crypto";

const ATHENS_TZ = "Europe/Athens";
const END_OF_WORK_HOUR = 17;

function hmacSecret(): string {
  const key = process.env.ACCESS_CODE_HMAC_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Missing ACCESS_CODE_HMAC_SECRET or SUPABASE_SERVICE_ROLE_KEY");
  return key.slice(0, 32);
}

type AthensWindowStart = {
  year: number;
  month: number;
  day: number;
  startHour: 0 | 8 | 16;
};

function normalizeAthensParts(parts: AthensParts, at: Date): AthensParts {
  if (parts.hour !== 24) return parts;
  const next = getAthensParts(new Date(at.getTime() + 60_000));
  return { ...parts, year: next.year, month: next.month, day: next.day, hour: 0 };
}

function getAthensWindowStart(at: Date = new Date()): AthensWindowStart {
  const p = normalizeAthensParts(getAthensParts(at), at);
  let startHour: AthensWindowStart["startHour"] = 0;
  if (p.hour >= 16) startHour = 16;
  else if (p.hour >= 8) startHour = 8;
  return { year: p.year, month: p.month, day: p.day, startHour };
}

/** Deterministic 6-digit code for the current 8-hour Athens window (00–08, 08–16, 16–00). */
export function generateAccessCode(at: Date = new Date()): string {
  const { year, month, day, startHour } = getAthensWindowStart(at);
  const windowKey = `${year}-${month}-${day}-${startHour}`;
  const hmac = crypto.createHmac("sha256", hmacSecret()).update(windowKey).digest("hex");
  return String((parseInt(hmac.slice(0, 6), 16) % 900000) + 100000);
}

/** @deprecated Use generateAccessCode */
export const generateHourlyCode = generateAccessCode;

/** UTC bounds for the current 8-hour Athens access-code window. */
export function getAccessCodeWindowBounds(at: Date = new Date()): { from: Date; until: Date } {
  const { year, month, day, startHour } = getAthensWindowStart(at);
  const from = athensWallClockToUtc(year, month, day, startHour, 0, 0);

  let until: Date;
  if (startHour === 0) {
    until = athensWallClockToUtc(year, month, day, 8, 0, 0);
  } else if (startHour === 8) {
    until = athensWallClockToUtc(year, month, day, 16, 0, 0);
  } else {
    const next = addAthensCalendarDays(year, month, day, 1);
    until = athensWallClockToUtc(next.year, next.month, next.day, 0, 0, 0);
  }

  return { from, until };
}

/** @deprecated Use getAccessCodeWindowBounds */
export const getHourBounds = getAccessCodeWindowBounds;

export function minutesUntil(until: Date): number {
  return Math.max(0, Math.ceil((until.getTime() - Date.now()) / 60_000));
}

export function formatAthensDateTime(at: Date): string {
  return new Intl.DateTimeFormat("el-GR", {
    timeZone: ATHENS_TZ,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
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

/** Intl may return hour 24 for midnight; map to 00:00 on the next Athens calendar day. */
function athensPartsToUtcMs(parts: AthensParts, guess: Date): number {
  if (parts.hour === 24) {
    const next = getAthensParts(new Date(guess.getTime() + 60_000));
    return Date.UTC(next.year, next.month - 1, next.day, 0, parts.minute, parts.second);
  }
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
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
    const actual = athensPartsToUtcMs(p, guess);
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
