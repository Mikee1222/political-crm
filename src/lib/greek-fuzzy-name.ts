/**
 * Fuzzy, accent-insensitive Greek and Latin name matching for contact search.
 * - Normalizes tonos/diacritics, case, final sigma
 * - Translates Greek to Latin (simple) so "Ιωάννης" ↔ "ioannis" style queries work
 * - Common Greek name equivalence clusters (Γιάννης/Ιωάννης, Κώστας/Κωνσταντίνος, …)
 */

const COMBINING = /\p{M}/gu;

export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(COMBINING, "");
}

/**
 * Monotonic + lowercase: Ιωάννης = ιωαννης, σ = allographic for ς
 */
export function normalizeGreekNameKey(s: string): string {
  return stripAccents(s)
    .toLowerCase()
    .replace(/ς/g, "σ");
}

/** Simplified map (names); η→i, ω→o, θ→th, χ→ch, ψ→ps, ξ→x */
const GR2LAT: Record<string, string> = {
  α: "a",
  β: "b",
  γ: "g",
  δ: "d",
  ε: "e",
  ζ: "z",
  η: "i",
  θ: "th",
  ι: "i",
  κ: "k",
  λ: "l",
  μ: "m",
  ν: "n",
  ξ: "x",
  ο: "o",
  π: "p",
  ρ: "r",
  σ: "s",
  ς: "s",
  τ: "t",
  υ: "y",
  φ: "f",
  χ: "ch",
  ψ: "ps",
  ω: "o",
};

/**
 * Digraphs before single-letter pass (Greek to Latin, common in names)
 */
const DIG: [string, string][] = [
  ["ου", "ou"],
  ["αυ", "au"],
  ["ευ", "eu"],
  ["αι", "e"],
  ["ει", "i"],
  ["οι", "i"],
  ["γγ", "g"],
  ["γκ", "gk"],
  ["τσ", "ts"],
  ["τζ", "tz"],
];

export function greekNameToLatin(s: string): string {
  let t = stripAccents(s).toLowerCase();
  t = t.replace(/ς/g, "σ");
  t = t.replace(/μπ/g, "b");
  t = t.replace(/ντ/g, "d");
  for (const [g, l] of DIG) {
    if (g.length === 1) continue;
    t = t.split(g).join(l);
  }
  let o = "";
  for (const ch of t) {
    const c = ch.toLowerCase();
    if (c in GR2LAT) o += GR2LAT[c]!;
    else o += c;
  }
  return o;
}

const HAS_GREEK = /[\u0370-\u03ff\u1f00-\u1fff]/;

/**
 * Common Greek given-name variants; stored as rough spelling variants
 * (all matched after normalizeGreekNameKey + greekNameToLatin for haystack).
 */
const GREEK_NAME_CLUSTERS: string[][] = [
  ["giannis", "ioannis", "yiannis", "yannis", "giann", "iann", "ιωαν", "γιαν", "giannhs"],
  ["kostas", "konstantinos", "kosta", "kost", "kostis", "kwstas", "kwnst", "κωσ", "kwns"],
  ["nikos", "nikolaos", "nikol", "nicholas", "nick", "νικ", "nike"],
  ["dimitri", "dimitris", "dimitr", "demetri", "dimitr", "dhm", "δημ", "dimitr"],
  ["giorgos", "georgios", "george", "gior", "giwr", "γιωρ", "geor"],
  ["maki", "makh", "makis", "emmanouil", "emmanuel", "emman", "εμμ", "μακ", "imman"],
  ["panagiota", "panagh", "panay", "gpan", "παναγ"],
  ["fotis", "photi", "φω", "fot"],
  ["babis", "bampi", "charalambos", "χαρα", "bamp"],
  ["katerin", "aiter", "aikaterin", "κατ"],
  ["maria", "marios", "mariam", "μαρ"],
  ["xristo", "christo", "hristo", "χρισ", "xri"],
];

function buildNormClusters(): string[][] {
  return GREEK_NAME_CLUSTERS.map((cl) => {
    const s = new Set<string>();
    for (const raw of cl) {
      const k = normalizeGreekNameKey(raw);
      if (k.length >= 1) {
        s.add(k);
        s.add(greekNameToLatin(k));
        if (HAS_GREEK.test(raw)) s.add(greekNameToLatin(raw));
      }
    }
    return [...s].filter((t) => t.length >= 2);
  }).filter((c) => c.length > 0);
}

const NORM_CLUSTERS: string[][] = buildNormClusters();

function expandTokenNeedles(token: string): string[] {
  const t = token.trim();
  if (!t) return [];
  const n = normalizeGreekNameKey(t);
  const needles = new Set<string>([n, greekNameToLatin(t), greekNameToLatin(n)]);

  for (const m of [n, greekNameToLatin(n)]) {
    for (const cl of NORM_CLUSTERS) {
      const hit = cl.some(
        (c) => c.length >= 2 && (c === m || c.includes(m) || m.includes(c) || m.startsWith(c) || c.startsWith(m)),
      );
      if (hit) {
        for (const x of cl) {
          if (x.length) needles.add(x);
        }
        break;
      }
    }
  }

  if (HAS_GREEK.test(t)) {
    for (const cl of NORM_CLUSTERS) {
      for (const mem of cl) {
        if (n.includes(mem) && mem.length >= 2) {
          cl.forEach((x) => needles.add(x));
        }
      }
    }
  }

  return [...needles].filter((s) => s.length > 0);
}

function onlyDigits(s: string): string {
  return s.replace(/[^\d]/g, "");
}

type ContactFuzzy = {
  first_name: string;
  last_name: string;
  nickname: string | null;
  phone?: string | null;
  area?: string | null;
  municipality?: string | null;
};

export function buildNameSearchHaystack(c: ContactFuzzy): string {
  const fn = normalizeGreekNameKey(c.first_name);
  const ln = normalizeGreekNameKey(c.last_name);
  const nn = c.nickname ? normalizeGreekNameKey(c.nickname) : "";
  const fnL = greekNameToLatin(c.first_name);
  const lnL = greekNameToLatin(c.last_name);
  const nnL = c.nickname ? greekNameToLatin(c.nickname) : "";
  const fullG = fn + " " + ln;
  const fullL = greekNameToLatin(`${c.first_name} ${c.last_name}`.trim());
  const ph = c.phone != null ? onlyDigits(String(c.phone)) : "";
  const a = c.area != null ? normalizeGreekNameKey(c.area) : "";
  const m = c.municipality != null ? normalizeGreekNameKey(c.municipality) : "";
  return [fullG, fn, ln, nn, fullL, fnL, lnL, nnL, ph, a, m, `${fnL} ${lnL}`.trim()].filter(Boolean).join(" ");
}

function needleInHay(needle: string, hay: string): boolean {
  if (needle.length < 1) return false;
  if (hay.includes(needle)) return true;
  if (needle.length < 2) return false;
  const parts = hay.split(/\s+/);
  for (const p of parts) {
    if (p === needle || p.startsWith(needle) || p.includes(needle)) return true;
  }
  return false;
}

/**
 * Whitespace = AND. Each term must match first/last/nickname/phone/area
 * (accent-insensitive, with Greek–Latin and common variant clusters).
 */
export function contactMatchesFuzzyGreekSearch(
  c: ContactFuzzy,
  search: string | null,
): boolean {
  const t = search?.trim() ?? "";
  if (t.length === 0) return true;

  const hay = ` ${buildNameSearchHaystack(c)} `;
  const phoneD = onlyDigits(c.phone ?? "");
  const terms = t.split(/\s+/).filter(Boolean);
  for (const term of terms) {
    const d = onlyDigits(term);
    const hasFewLetters = term.replace(/[\d\s+()./-]/g, "").length < 2;
    if (d.length >= 4 && hasFewLetters) {
      let found = d.length > 0 && phoneD.length > 0;
      if (found && !phoneD.includes(d)) {
        found = false;
        for (let L = Math.min(12, d.length); L >= 4; L -= 1) {
          if (L <= d.length && phoneD.includes(d.slice(d.length - L))) {
            found = true;
            break;
          }
        }
      }
      if (found) {
        continue;
      }
      if (d.length >= 4) {
        return false;
      }
    }

    const needles = expandTokenNeedles(term);
    if (needles.length === 0) return false;
    const anyHit = needles.some((n) => needleInHay(n, hay));
    if (anyHit) continue;
    return false;
  }
  return true;
}
