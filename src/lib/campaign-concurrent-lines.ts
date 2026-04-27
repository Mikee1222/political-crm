export const CONCURRENT_LINES_DEFAULT = 3;
export const CONCURRENT_LINES_MIN = 1;
export const CONCURRENT_LINES_MAX = 10;

/** Έλεγχος παράλληλων γραμμών κλήσης (1–10, προεπιλογή 3). */
export function clampConcurrentLines(value: unknown): number {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return CONCURRENT_LINES_DEFAULT;
  return Math.min(CONCURRENT_LINES_MAX, Math.max(CONCURRENT_LINES_MIN, Math.floor(n)));
}
