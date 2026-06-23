/** True when cell is empty or exactly "1ο επίπεδο" with no related names. */
export function isTrivialRelationsCell(raw: string): boolean {
  const t = raw.trim();
  if (!t) return true;
  return /^1ο\s*επίπεδο\s*$/iu.test(t);
}

/**
 * Names listed after 1ο επίπεδο (before optional " - 2ο επίπεδο").
 * Supports both bracketed and unbracketed export formats:
 * - 1ο επίπεδο[NAME1, NAME2] - 2ο επίπεδο[...]
 * - 1ο επίπεδοNAME1, NAME2,  - 2ο επίπεδο
 */
export function parseLevel1RelationNames(raw: string): string[] {
  const t = raw.trim();
  if (!t || isTrivialRelationsCell(t)) return [];

  const bracket = t.match(/1ο\s*επίπεδο\s*\[([^\]]*)\]/iu);
  if (bracket?.[1]) {
    return bracket[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const noBracket = t.match(/^1ο\s*επίπεδο\s*(.+?)(?:\s*-\s*2ο\s*επίπεδο|$)/iu);
  if (!noBracket?.[1]) return [];

  return noBracket[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** "ΓΙΩΡΓΟΣ ΠΑΠΑΔΟΠΟΥΛΟΣ" / "KONSTANTINOS GOULAS" → { first_name, last_name } */
export function splitRelatedPersonName(
  full: string,
): { first_name: string; last_name: string } | null {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  const last_name = parts[parts.length - 1]!;
  const first_name = parts.slice(0, -1).join(" ");
  return { first_name, last_name };
}
