/** Shared helpers for contact phone substring search (global + list + Alexandra). */

export const MIN_PHONE_SEARCH_DIGITS = 4;

/** Strip spaces, dashes, parentheses, plus, slashes — leave digits only. */
export function extractPhoneSearchDigits(input: string): string {
  return input.replace(/[\s+()./-]/g, "").replace(/\D/g, "");
}

/** True when the query (after stripping phone punctuation) is all digits and non-empty. */
export function isPhoneOnlyQuery(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  const stripped = trimmed.replace(/[\s+()./-]/g, "");
  return stripped.length > 0 && /^\d+$/.test(stripped);
}

/**
 * Ready for phone contains-search: digit-only (or punctuation-only around digits)
 * with at least MIN_PHONE_SEARCH_DIGITS digits.
 */
export function shouldRunPhoneSearch(input: string): boolean {
  if (!isPhoneOnlyQuery(input)) return false;
  return extractPhoneSearchDigits(input).length >= MIN_PHONE_SEARCH_DIGITS;
}

/** Escape `%`, `_`, `\` for PostgREST ilike patterns. */
export function escapePhoneIlike(digits: string): string {
  return digits.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * PostgREST `.or()` filter against digit-normalized columns (contains).
 * Requires `phone_digits` / `phone2_digits` / `landline_digits` generated columns.
 */
export function phoneDigitsContainsOrFilter(digits: string): string {
  const esc = escapePhoneIlike(digits);
  const pat = `%${esc}%`;
  return `phone_digits.ilike.${pat},phone2_digits.ilike.${pat},landline_digits.ilike.${pat}`;
}
