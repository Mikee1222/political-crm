import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";

const TRANSFER_PATTERNS = [
  /συνδέω\s*τώρα/i,
  /συνδέ/iu,
  /Ένα\s*στιγμάκι/i,
  /στιγμάκι,?\s*σας/i,
  /Έναν?\s*στιγμ/i,
];

const NEGATIVE_COLD = /Λυπάμαι\s+που|ενοχλήσαμ/i;
const NEG_OXI_PATH = /Κατανοώ|Να είστε καλά/i;
const FAREWELL = /χρόνια\s*πολλά/iu;

export const RETELL_SONNET_MODEL = "claude-sonnet-4-6";

type RetellLlmResult = {
  end_call: boolean;
  transfer_call: boolean;
};

/**
 * Heuristics on the spoken text for Retell control. LLM is instructed, but this enforces
 * end_call / transfer_call when the wording matches the campaign script.
 */
export function applyRetellHeuristics(content: string): RetellLlmResult {
  const t = (content ?? "").trim();
  if (!t) return { end_call: false, transfer_call: false };
  for (const re of TRANSFER_PATTERNS) {
    re.lastIndex = 0;
    if (re.test(t)) {
      return { end_call: false, transfer_call: true };
    }
  }
  if (NEGATIVE_COLD.test(t) && t.length < 400) {
    return { end_call: true, transfer_call: false };
  }
  if (FAREWELL.test(t) && NEG_OXI_PATH.test(t)) {
    return { end_call: true, transfer_call: false };
  }
  if (FAREWELL.test(t) && !t.includes("?") && t.length < 500) {
    return { end_call: true, transfer_call: false };
  }
  return { end_call: false, transfer_call: false };
}

export function buildNamedaySystemPrompt(firstName: string) {
  const fn = firstName.trim() || "φίλε";
  return `Είσαι ο βοηθός του πολιτικού γραφείου του βουλευτή Κώστα Καραγκούνη.
Μόλις ευχήθηκες χρόνια πολλά στον/στην ${fn} για την ονομαστική εορτή τους.

ΚΑΝΟΝΕΣ:
- Μιλάς ΠΑΝΤΑ Ελληνικά
- Είσαι ζεστός, φιλικός, σύντομος
- Αν ο χρήστης ευχαριστεί ή είναι θετικός → ρώτα αν θέλει να μιλήσει με τον κ. Καραγκούνη
- Αν πει ΝΑΙ → πες "Ένα στιγμάκι, σας συνδέω τώρα!" και do NOT end the call (we will transfer)
- Αν πει ΟΧΙ → πες "Κατανοώ! Να είστε καλά και χρόνια πολλά!" και τελειώνει η κλήση (χαιρετισμός, όχi μεταφορά)
- Αν είναι αρνητικός / ενοχλείται → πες "Λυπάμαι που σας ενοχλήσαμε. Να είστε καλά!" και τελειώνει η κλήση
- Αν ρωτήσει για τον βουλευτή → δώσε σύντομη θετική πληροφορία για τον Καραγκούνη
- MAX 2 προτάσεις ανά απάντηση
- Χωρίς αγγλικά`;
}

export function transcriptToMessages(
  transcript: Array<{ role: string; content: string }> | undefined,
): MessageParam[] {
  if (!Array.isArray(transcript) || !transcript.length) return [];
  const out: MessageParam[] = [];
  for (const m of transcript) {
    const role = String(m.role).toLowerCase();
    const text = (m.content ?? "").toString().trim();
    if (!text) continue;
    if (role === "user" || role === "caller" || role === "customer") {
      out.push({ role: "user" as const, content: text });
    } else if (role === "agent" || role === "assistant") {
      out.push({ role: "assistant" as const, content: text });
    }
  }
  return out;
}

function strMap(o: Record<string, unknown> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!o) return out;
  for (const [k, v] of Object.entries(o)) {
    if (v == null) continue;
    out[k] = typeof v === "string" ? v : String(v);
  }
  return out;
}

export function mergeCallMetadata(
  call: { metadata?: Record<string, unknown> | null; retell_llm_dynamic_variables?: Record<string, string> | null } | null | undefined,
) {
  const a = strMap((call?.metadata as Record<string, unknown> | undefined) ?? {});
  const b = (call?.retell_llm_dynamic_variables as Record<string, string> | undefined) ?? {};
  return { ...a, ...b } as Record<string, string>;
}

export function getFirstName(meta: Record<string, string | undefined | null>): string {
  return (meta.first_name ?? (meta as { First?: string }).First ?? "").toString().trim() || "φίλε";
}

export function getContactId(meta: Record<string, string | undefined | null>): string | null {
  const c = (meta.contact_id ?? (meta as { contactId?: string }).contactId ?? "").toString().trim();
  return c || null;
}
