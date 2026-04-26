/**
 * Fixed-date Greek Orthodox name days: merged from `nameday-recurring.json`
 * (data derived from the alexstyl/Greek-namedays recurring set, names in Greek)
 * with small supplements for major feasts / variants. Moving (Easter-based) feasts
 * are not included — see `greek-namedays` client logic for those.
 */
import namedayRecurring from "./nameday-recurring.json";

export type NamedaySeedRow = { month: number; day: number; names: string[] };

/** Small supplement for feast days / variants not in the bundled list (optional merge). */
const LEGACY_SUPPLEMENT: NamedaySeedRow[] = [
  { month: 1, day: 1, names: ["Βασίλειος", "Βασιλική", "Βασίλης", "Βασίλω"] },
  { month: 3, day: 25, names: ["Ευαγγελισμός", "Μαρία", "Μάριος", "Παναγιώτα"] },
  { month: 4, day: 23, names: ["Γεώργιος", "Γιώργος", "Γεωργία", "Γιώργης", "Ζωή"] },
  { month: 5, day: 21, names: ["Κωνσταντίνος", "Κωστας", "Ελένη", "Νέντα"] },
  { month: 10, day: 26, names: ["Δημήτριος", "Δήμητρα", "Μίμης", "Μίτση"] },
  { month: 12, day: 25, names: ["Χρήστος", "Χριστίνα", "Χρυσούλα", "Μάνα"] },
];

function mergeRecurring(): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  const data = (namedayRecurring as { data: { date: string; names: string[] }[] }).data;
  for (const row of data) {
    const [d, m] = row.date.split("/").map((x) => parseInt(x, 10));
    if (!m || !d) continue;
    const key = `${m}-${d}`;
    if (!map.has(key)) map.set(key, new Set());
    const set = map.get(key)!;
    for (const n of row.names) {
      const t = String(n).trim();
      if (t) set.add(t);
    }
  }
  for (const leg of LEGACY_SUPPLEMENT) {
    const key = `${leg.month}-${leg.day}`;
    if (!map.has(key)) map.set(key, new Set());
    const set = map.get(key)!;
    for (const n of leg.names) set.add(n);
  }
  return map;
}

/**
 * Merged Greek Orthodox name days (fixed calendar) from public recurring data + supplements.
 * Use with admin sync to replace `name_days` in Supabase.
 */
export function getNamedaySeedRows(): NamedaySeedRow[] {
  const map = mergeRecurring();
  const out: NamedaySeedRow[] = [];
  for (const [k, set] of map) {
    const [ms, ds] = k.split("-");
    const month = parseInt(ms ?? "0", 10);
    const day = parseInt(ds ?? "0", 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    out.push({ month, day, names: [...set].sort((a, b) => a.localeCompare(b, "el")) });
  }
  out.sort((a, b) => (a.month !== b.month ? a.month - b.month : a.day - b.day));
  return out;
}

export function getNamedaySeedStats() {
  const rows = getNamedaySeedRows();
  const nameCount = rows.reduce((acc, r) => acc + r.names.length, 0);
  return { dayCount: rows.length, nameCount };
}
