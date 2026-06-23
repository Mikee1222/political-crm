/** Default/max rows returned by Alexandra broad contact search tools. */
export const ALEXANDRA_CONTACT_SEARCH_DEFAULT_LIMIT = 75;
export const ALEXANDRA_CONTACT_SEARCH_MAX_LIMIT = 100;

export function alexandraContactSearchLimit(raw: { limit?: unknown }): number {
  const n = Number(raw.limit);
  if (Number.isFinite(n) && n > 0) {
    return Math.min(ALEXANDRA_CONTACT_SEARCH_MAX_LIMIT, Math.max(1, Math.floor(n)));
  }
  return ALEXANDRA_CONTACT_SEARCH_DEFAULT_LIMIT;
}
