import { anthropicComplete } from "@/lib/anthropic-once";
import type { ContactForDedup } from "@/lib/duplicate-detection";

const SYS =
  "Είσαι βοηθός αποδελτίωσης. Σύγκρινε δύο επαφές CRM. Αν πρόκειται για το ίδιο άτομο, απάντα ΝΑΙ. Αν όχι, απάντα ΟΧΙ. Έπειτα δώσε σκορ 0-100. Μορφή απάντησης ΜΟΝΟ: ΝΑΙ ή ΟΧΙ, τότε κόμμα, τότε ακέραιο 0-100. Παράδειγμα: ΝΑΙ, 87";

export type ClaudeDuplicateResult = { samePerson: boolean; score: number };

function parseClaudeResponse(text: string): ClaudeDuplicateResult {
  const t = text.trim();
  const upper = t.toUpperCase();
  const same = upper.startsWith("ΝΑΙ");
  const m = t.match(/(\d{1,3})\s*$/);
  const n = m ? parseInt(m[1]!, 10) : 0;
  return { samePerson: same, score: Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0)) };
}

/**
 * Έλεγχος LLM όταν το heuristic σκορ δεν είναι απόλυτο (π.χ. 50-99).
 */
export async function claudeDuplicateVerdict(
  a: ContactForDedup,
  b: ContactForDedup,
): Promise<ClaudeDuplicateResult | null> {
  const user = [
    "Επαφή 1:",
    `Όνομα: ${a.first_name} ${a.last_name}`,
    `Τηλέφωνο: ${a.phone ?? "—"}`,
    `Περιοχή: ${a.area ?? "—"}`,
    `Δήμος: ${a.municipality ?? "—"}`,
    "",
    "Επαφή 2:",
    `Όνομα: ${b.first_name} ${b.last_name}`,
    `Τηλέφωνο: ${b.phone ?? "—"}`,
    `Περιοχή: ${b.area ?? "—"}`,
    `Δήμος: ${b.municipality ?? "—"}`,
  ].join("\n");
  const out = await anthropicComplete(SYS, user);
  if (!out.ok) {
    return null;
  }
  return parseClaudeResponse(out.text);
}
