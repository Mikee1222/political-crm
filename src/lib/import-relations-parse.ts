/** Names inside 1ο επίπεδο[...] before optional 2ο επίπεδο. */
export function parseLevel1RelationNames(raw: string): string[] {
  const t = raw.trim();
  if (!t) return [];
  const m = t.match(/1ο\s*επίπεδο\s*\[([^\]]*)\]/iu);
  if (!m?.[1]) return [];
  return m[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** "ΓΙΩΡΓΟΣ ΠΑΠΑΔΟΠΟΥΛΟΣ" → { first_name, last_name } */
export function splitRelatedPersonName(
  full: string,
): { first_name: string; last_name: string } | null {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  const last_name = parts[parts.length - 1]!;
  const first_name = parts.slice(0, -1).join(" ");
  return { first_name, last_name };
}
