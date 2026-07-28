import {
  isNegativeRetellOutcome,
  isNoAnswerRetellOutcome,
  isPositiveRetellOutcome,
  retellOutcomeLabel,
} from "@/lib/retell-call-outcomes";

export type CampaignContactCallStatus =
  | "pending"
  | "connected"
  | "declined"
  | "no_answer"
  | "not_called";

export type CampaignContactStatusMeta = {
  key: CampaignContactCallStatus;
  label: string;
  icon: string;
  /** Tailwind-ish token hints for UI */
  tone: "amber" | "emerald" | "rose" | "orange" | "slate";
};

/**
 * Latest call outcome for a contact within a campaign → display status.
 * Prefer the most recent non-null outcome; Pending wins if still in flight.
 */
export function resolveCampaignContactStatus(
  outcomes: Array<string | null | undefined>,
): CampaignContactStatusMeta {
  if (!outcomes.length) {
    return { key: "not_called", label: "Δεν κλήθηκε ακόμα", icon: "⬜", tone: "slate" };
  }
  // Prefer Pending if any call is still pending
  if (outcomes.some((o) => o === "Pending" || o === "Αναμονή")) {
    return { key: "pending", label: "Εκκρεμεί", icon: "⏳", tone: "amber" };
  }
  // Prefer positive if any
  if (outcomes.some((o) => isPositiveRetellOutcome(o))) {
    return { key: "connected", label: "Συνδέθηκε με ΚΚ", icon: "✅", tone: "emerald" };
  }
  if (outcomes.some((o) => isNegativeRetellOutcome(o))) {
    return { key: "declined", label: "Δεν ήθελε", icon: "❌", tone: "rose" };
  }
  if (outcomes.some((o) => isNoAnswerRetellOutcome(o))) {
    return { key: "no_answer", label: "Δεν απάντησε", icon: "📵", tone: "orange" };
  }
  const last = outcomes[outcomes.length - 1];
  return {
    key: "not_called",
    label: retellOutcomeLabel(last) || "Δεν κλήθηκε ακόμα",
    icon: "⬜",
    tone: "slate",
  };
}

/** Human duration: "1λ 23δ" / "45δ" / "—" */
export function formatDurationGreek(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—";
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r}δ`;
  return `${m}λ ${r}δ`;
}
