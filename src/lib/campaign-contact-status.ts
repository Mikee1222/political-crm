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

/** Lucide icon keys — UI maps these to components (no emoji). */
export type CampaignStatusIcon =
  | "link2"
  | "x-circle"
  | "phone-missed"
  | "clock"
  | "circle";

export type CampaignContactStatusMeta = {
  key: CampaignContactCallStatus;
  label: string;
  icon: CampaignStatusIcon;
  /** Tailwind-ish token hints for UI */
  tone: "amber" | "emerald" | "rose" | "orange" | "slate";
};

/**
 * Solid badge classes with WCAG AA contrast (≥4.5:1) on light and dark surfaces.
 */
export function campaignStatusBadgeClass(tone: CampaignContactStatusMeta["tone"]): string {
  const map: Record<CampaignContactStatusMeta["tone"], string> = {
    emerald: "bg-emerald-700 text-white ring-1 ring-emerald-900/35",
    rose: "bg-red-700 text-white ring-1 ring-red-900/35",
    amber: "bg-amber-400 text-amber-950 ring-1 ring-amber-700/35",
    orange: "bg-orange-600 text-white ring-1 ring-orange-900/35",
    slate: "bg-slate-200 text-slate-900 ring-1 ring-slate-400/50",
  };
  return map[tone];
}

/**
 * Latest call outcome for a contact within a campaign → display status.
 * Prefer the most recent non-null outcome; Pending wins if still in flight.
 */
export function resolveCampaignContactStatus(
  outcomes: Array<string | null | undefined>,
): CampaignContactStatusMeta {
  if (!outcomes.length) {
    return { key: "not_called", label: "Δεν κλήθηκε ακόμα", icon: "circle", tone: "slate" };
  }
  // Prefer Pending if any call is still pending
  if (outcomes.some((o) => o === "Pending" || o === "Αναμονή")) {
    return { key: "pending", label: "Εκκρεμεί", icon: "clock", tone: "amber" };
  }
  // Prefer positive if any
  if (outcomes.some((o) => isPositiveRetellOutcome(o))) {
    return { key: "connected", label: "Συνδέθηκε με ΚΚ", icon: "link2", tone: "emerald" };
  }
  if (outcomes.some((o) => isNegativeRetellOutcome(o))) {
    return { key: "declined", label: "Δεν ήθελε", icon: "x-circle", tone: "rose" };
  }
  if (outcomes.some((o) => isNoAnswerRetellOutcome(o))) {
    return { key: "no_answer", label: "Δεν απάντησε", icon: "phone-missed", tone: "orange" };
  }
  const last = outcomes[outcomes.length - 1];
  return {
    key: "not_called",
    label: retellOutcomeLabel(last) || "Δεν κλήθηκε ακόμα",
    icon: "circle",
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
