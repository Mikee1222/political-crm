/**
 * Suggested duplicate detection — user always decides.
 * Scoring: same first+last +80, same phone +30, all three =100,
 * same first + (same area OR municipality) +20, similar names +25
 */

export type ContactForDedup = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  area: string | null;
  municipality: string | null;
};

export function normalizeGreekName(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function normalizePhoneForMatch(phone: string | null | undefined): string {
  if (!phone) return "";
  let d = phone.replace(/\s/g, "");
  if (d.startsWith("+30")) d = d.slice(3);
  else if (d.startsWith("30") && d.length > 10) d = d.slice(2);
  d = d.replace(/[^\d]/g, "");
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d;
}

function sameFirstLast(a: ContactForDedup, b: ContactForDedup): boolean {
  return (
    normalizeGreekName(a.first_name) === normalizeGreekName(b.first_name) &&
    normalizeGreekName(a.last_name) === normalizeGreekName(b.last_name)
  );
}

function samePhone(a: ContactForDedup, b: ContactForDedup): boolean {
  const pa = normalizePhoneForMatch(a.phone);
  const pb = normalizePhoneForMatch(b.phone);
  return pa.length > 0 && pa === pb;
}

/** Same first name + (same area OR same municipality) */
function sameFirstAndAreaContext(a: ContactForDedup, b: ContactForDedup): boolean {
  if (normalizeGreekName(a.first_name) !== normalizeGreekName(b.first_name)) return false;
  const aA = (a.area ?? "").trim();
  const bA = (b.area ?? "").trim();
  const aM = (a.municipality ?? "").trim();
  const bM = (b.municipality ?? "").trim();
  if (aA && aA === bA) return true;
  if (aM && aM === bM) return true;
  return false;
}

const NAME_ALIAS_CLUSTERS: string[][] = [
  ["γιωργος", "γιωργης", "γεωργιος", "γεωργοσ"],
  ["νικος", "νικολαοσ", "νικοσ"],
  ["δημητρης", "δημητριοσ", "μητσοσ", "μητσακης"],
  ["κωστας", "κωνσταντινοσ", "κωστακης"],
  ["αθηνα", "αθηναια"],
  ["ελενη", "ελενα"],
  ["παυλος", "παυλοσ"],
  ["μαιρη", "μαρια", "μαιρι"],
  ["ιωαννα", "ιωαννετα", "ναννα"],
  ["ευαγγελια", "βαω", "ευαγγελιας"],
  ["αναστασια", "αναστασα", "τασια", "νασια"],
  ["αναστασιοσ", "αναστατης", "αναστατησ", "τασοσ"],
];

function clusterId(token: string): string | null {
  const t = normalizeGreekName(token);
  if (t.length < 2) return null;
  for (let i = 0; i < NAME_ALIAS_CLUSTERS.length; i++) {
    for (const alias of NAME_ALIAS_CLUSTERS[i]) {
      if (t === alias) return `c${i}`;
    }
  }
  return null;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const row = Array(n + 1)
    .fill(0)
    .map((_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j]!;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[n]!;
}

function similarNames(a: ContactForDedup, b: ContactForDedup): boolean {
  const f1 = normalizeGreekName(a.first_name);
  const f2 = normalizeGreekName(b.first_name);
  const l1 = normalizeGreekName(a.last_name);
  const l2 = normalizeGreekName(b.last_name);

  if (f1 === f2 && l1 === l2) return false;

  const c1f = clusterId(f1);
  const c2f = clusterId(f2);
  if (c1f && c1f === c2f && l1 === l2) return true;

  if (l1 === l2) {
    const d = levenshtein(f1, f2);
    if (f1.length >= 3 && f2.length >= 3 && d <= 2) return true;
  }
  if (f1 === f2) {
    if (l1.length >= 3 && l2.length >= 3) {
      const d = levenshtein(l1, l2);
      if (d <= 2) return true;
    }
  }
  if (f1.length >= 3 && f2.length >= 3) {
    if (l1.length >= 3 && l2.length >= 3) {
      if (levenshtein(f1, f2) + levenshtein(l1, l2) <= 3) return true;
    }
  }
  return false;
}

export function pairScoreAndReasons(a: ContactForDedup, b: ContactForDedup): { score: number; reasons: string[] } {
  const sn = sameFirstLast(a, b);
  const sp = samePhone(a, b);
  const reasons: string[] = [];
  let score = 0;

  if (sn && sp) {
    return { score: 100, reasons: ["Ίδιο πλήρες όνομα", "Ίδιο τηλέφωνο"] };
  }
  if (sn) {
    score += 80;
    reasons.push("Ίδιο όνομα/επίθετο");
  }
  if (sp) {
    score += 30;
    reasons.push("Ίδιο τηλέφωνο");
  }
  if (sameFirstAndAreaContext(a, b)) {
    score += 20;
    if (sn) {
      const aA = (a.area ?? "").trim();
      const bA = (b.area ?? "").trim();
      if (aA && aA === bA) reasons.push("Ίδια περιοχή");
      const aM = (a.municipality ?? "").trim();
      const bM = (b.municipality ?? "").trim();
      if (aM && aM === bM) reasons.push("Ίδιος δήμος");
    } else {
      reasons.push("Ίδιο μικρό όνομα + περιοχή/δήμος");
    }
  }
  if (!sn && similarNames(a, b)) {
    score += 25;
    reasons.push("Παρόμοιο όνομα");
  }

  return { score: Math.min(100, score), reasons: [...new Set(reasons)] };
}

export function stablePairId(id1: string, id2: string): { small: string; big: string } {
  return id1 < id2 ? { small: id1, big: id2 } : { small: id2, big: id1 };
}
