import { anthropicComplete } from "@/lib/anthropic-once";

const ALLOWED = [
  "Υγεία",
  "Εκπαίδευση",
  "Εργασία",
  "Υποδομές",
  "Κοινωνική Πρόνοια",
  "Περιβάλλον",
  "Άλλο",
] as const;

/**
 * Κατηγοριοποίηση αιτήματος από περιγραφή (Claude), μόνο μία επιλογή από τη λίστα.
 */
export async function inferRequestCategoryFromDescription(description: string): Promise<string | null> {
  const t = String(description ?? "").trim();
  if (t.length < 5) {
    return null;
  }
  const sys = `Κατηγοριοποίησε το ακόλουθο αίτημα πολίτη. Απάντησε ΜΟΝΟ με ακριβώς μία γραμμή: μία από τις λέξεις/φράσεις: ${ALLOWED.join(
    ", ",
  )}. Μην προσθέσεις τίποτα άλλο.`;
  const out = await anthropicComplete(sys, t.slice(0, 12_000));
  if (!out.ok) {
    return null;
  }
  const line = out.text
    .trim()
    .split(/\n/, 1)[0]!
    .trim();
  for (const c of ALLOWED) {
    if (line.includes(c) || c.includes(line)) {
      return c;
    }
  }
  return "Άλλο";
}
