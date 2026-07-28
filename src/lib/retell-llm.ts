import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";

/** Fixed opening line spoken on call connect / first agent turn. */
export const RETELL_OPENING_LINE =
  "Καλησπέρα σας, σας καλώ από το γραφείο του βουλευτή κ. Καραγκούνη. Θέλετε να σας τον συνδέσω;";

/** Spoken when citizen declines transfer — also triggers end_call. */
export const RETELL_DECLINE_LINE = "Εντάξει, καλή συνέχεια!";

/**
 * Single-turn transfer offer for Karagkounis office outbound calls.
 */
export function buildKaragkounisTransferSystemPrompt() {
  return `Είσαι ο βοηθός του γραφείου του βουλευτή Κωνσταντίνου Καραγκούνη. 
Μόλις απαντήσει ο πολίτης, πες: 'Καλησπέρα σας, σας καλώ από το γραφείο του βουλευτή κ. Καραγκούνη. Θέλετε να σας τον συνδέσω;'
Αν πει ΝΑΙ ή θετική απάντηση: χρησιμοποίησε το transfer_call tool αμέσως.
Αν πει ΟΧΙ ή αρνητική απάντηση: πες 'Εντάξει, καλή συνέχεια!' και κλείσε την κλήση με end_call tool.
Μην πεις τίποτα άλλο. Μην κάνεις ερωτήσεις. Μόνο αυτό.`;
}

/** @deprecated Prefer buildKaragkounisTransferSystemPrompt — kept for nameday agents. */
export function buildNamedaySystemPrompt(firstName: string) {
  const fn = firstName.trim() || "φίλε";
  return `Είσαι ο βοηθός του πολιτικού γραφείου του βουλευτή Κώστα Καραγκούνη.
Μόλις ευχήθηκες χρόνια πολλά στον/στην ${fn} για την ονομαστική εορτή τους.

ΚΑΝΟΝΕΣ:
- Μιλάς ΠΑΝΤΑ Ελληνικά
- Είσαι ζεστός, φιλικός, σύντομος
- Αν ο χρήστης ευχαριστεί ή είναι θετικός → ρώτα αν θέλει να μιλήσει με τον κ. Καραγκούνη
- Αν πει ΝΑΙ → πες "Ένα στιγμάκι, σας συνδέω τώρα!" and do NOT end the call (we will transfer)
- Αν πει ΟΧΙ → πες "Κατανοώ! Να είστε καλά και χρόνια πολλά!" και τελειώνει η κλήση (χαιρετισμός, όχι μεταφορά)
- Αν είναι αρνητικός / ενοχλείται → πες "Λυπάμαι που σας ενοχλήσαμε. Να είστε καλά!" και τελειώνει η κλήση
- Αν ρωτήσει για τον βουλευτή → δώσε σύντομη θετική πληροφορία για τον Καραγκούνη
- MAX 2 προτάσεις ανά απάντηση
- Χωρίς αγγλικά`;
}

/** @deprecated Use buildKaragkounisTransferSystemPrompt for outbound Retell. */
export function buildGreekPoliticalOfficeSystemPrompt() {
  return buildKaragkounisTransferSystemPrompt();
}

type RetellLlmResult = {
  end_call: boolean;
  transfer_call: boolean;
};

const TRANSFER_PATTERNS = [
  /συνδέω\s*τώρα/i,
  /σας\s*συνδέω/iu,
  /transfer_call/i,
  /Ένα\s*στιγμάκι/i,
  /στιγμάκι,?\s*σας/i,
  /Έναν?\s*στιγμ/i,
];

const END_CALL_PATTERNS = [
  /Εντάξει,?\s*καλή\s*συνέχεια/iu,
  /Λυπάμαι\s+που|ενοχλήσαμ/i,
  /Κατανοώ.*Να είστε καλά/iu,
];

export const RETELL_SONNET_MODEL = "claude-sonnet-4-6";

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
  for (const re of END_CALL_PATTERNS) {
    re.lastIndex = 0;
    if (re.test(t)) {
      return { end_call: true, transfer_call: false };
    }
  }
  // Short farewell without a question → end
  if (!t.includes("?") && t.length < 80 && /καλή\s*συνέχεια|να\s*είστε\s*καλά/iu.test(t)) {
    return { end_call: true, transfer_call: false };
  }
  return { end_call: false, transfer_call: false };
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
