const NON_DIGIT = /\D/g;

/**
 * Strips 30 (GR) if present, leaves national digits.
 */
function strip30(d: string): string {
  if (d.startsWith("30") && d.length >= 12) return d.slice(2);
  return d;
}

/**
 * National 10 digits: mobile 69… or landline 2…
 */
function isValidGreek10(d: string): boolean {
  return d.length === 10 && (d.startsWith("69") || d.startsWith("2"));
}

/**
 * All distinct Greek 10-digit numbers in order of appearance in the digit stream (30 stripped once).
 */
function allValidGreek10InOrder(nationalDigits: string): string[] {
  const d = strip30(nationalDigits);
  if (d.length < 10) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i + 10 <= d.length; i++) {
    const ten = d.slice(i, i + 10);
    if (!isValidGreek10(ten)) continue;
    if (seen.has(ten)) continue;
    seen.add(ten);
    out.push(ten);
  }
  return out;
}

export type GreekPhoneFields = {
  phone: string | null;
  phone2: string | null;
  landline: string | null;
};

/**
 * Parses free text: multiple numbers separated by dash, comma, space, etc.
 * 10-digit mobiles (69…) and landlines (2…).
 * First mobile → phone, second mobile → phone2, first landline when a mobile is primary → landline.
 * If there is no mobile, first landline → phone; second landline (if any) → landline.
 */
export function parseGreekPhoneFieldsFromText(raw: unknown): GreekPhoneFields {
  if (raw == null) return { phone: null, phone2: null, landline: null };
  const s = String(raw).trim();
  if (!s) return { phone: null, phone2: null, landline: null };
  const all = allValidGreek10InOrder(s.replace(NON_DIGIT, ""));
  const mobiles = all.filter((n) => n.startsWith("69"));
  const landlines = all.filter((n) => n.startsWith("2"));

  if (mobiles.length > 0) {
    return {
      phone: mobiles[0] ?? null,
      phone2: mobiles[1] ?? null,
      landline: landlines[0] ?? null,
    };
  }
  if (landlines.length > 0) {
    return {
      phone: landlines[0] ?? null,
      phone2: null,
      landline: landlines[1] ?? null,
    };
  }
  return { phone: null, phone2: null, landline: null };
}

/**
 * First valid 10-digit national 69… or 2… (used where a single number is enough).
 * Delegates to {@link parseGreekPhoneFieldsFromText} for a consistent rule with bulk import.
 */
export function extractGreekPhone10(raw: unknown): string | null {
  return parseGreekPhoneFieldsFromText(raw).phone;
}

const EM_DASH = "—";

function greekTitleCaseToken(word: string): string {
  if (!word) return word;
  if (word === EM_DASH) return word;
  const lower = word.toLocaleLowerCase("el-GR");
  if (lower.length === 0) return word;
  return lower.charAt(0).toLocaleUpperCase("el-GR") + lower.slice(1);
}

/**
 * «ΕΥΦΡΟΣΥΝΗ ΑΘΑΝΑΣΟΥΛΑ» → title case (locale-aware lower + capitalized word starts).
 * Multiple words separated by spaces.
 */
export function greekTitleCaseWords(phrase: string): string {
  if (!phrase.trim()) return phrase;
  return phrase
    .split(/\s+/)
    .map((w) => greekTitleCaseToken(w))
    .join(" ");
}
