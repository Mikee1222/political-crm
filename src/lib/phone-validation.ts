import { normalizePhoneForMatch } from "@/lib/duplicate-detection";

export type PhoneProblem = "empty" | "invalid";

/** 10 digit GR national: 69xxxxxxxx (mobile) or 2xxxxxxxxx (landline) */
export function isValidGreekPhoneNational(digits: string): boolean {
  if (digits.length !== 10) return false;
  if (digits.startsWith("69")) return true;
  if (digits.startsWith("2")) return true;
  return false;
}

export function analyzeGreekPhone(phone: string | null | undefined): { valid: boolean; problem: PhoneProblem | null } {
  if (phone == null || !String(phone).trim()) {
    return { valid: false, problem: "empty" };
  }
  const d = normalizePhoneForMatch(phone);
  if (!d) {
    return { valid: false, problem: "empty" };
  }
  if (isValidGreekPhoneNational(d)) {
    return { valid: true, problem: null };
  }
  return { valid: false, problem: "invalid" };
}

export function problemLabelGreek(p: PhoneProblem): string {
  if (p === "empty") return "Κενός αριθμός";
  return "Μη έγκυρος αριθμός";
}
