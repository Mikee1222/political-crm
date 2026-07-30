/** Exact `calls.outcome` strings written by the Retell webhook. */
export const RETELL_OUTCOME_CONNECTED = "Συνδέθηκε με ΚΚ" as const;
export const RETELL_OUTCOME_DECLINED = "Δεν ήθελε σύνδεση με ΚΚ" as const;
export const RETELL_OUTCOME_NO_ANSWER = "Δεν απάντησε" as const;

export type RetellCallOutcome =
  | typeof RETELL_OUTCOME_CONNECTED
  | typeof RETELL_OUTCOME_DECLINED
  | typeof RETELL_OUTCOME_NO_ANSWER;

/**
 * Contact `call_status` values written by Retell webhook.
 * Existing English enums (Positive / Negative / No Answer) remain valid elsewhere;
 * Retell writes these Greek values (matched to UI wording).
 */
export const RETELL_CALL_STATUS_POSITIVE = "Θετικό" as const;
export const RETELL_CALL_STATUS_NEGATIVE = "Αρνητικό" as const;
export const RETELL_CALL_STATUS_NO_ANSWER = "Δεν Απάντησε" as const;

export type RetellContactCallStatus =
  | typeof RETELL_CALL_STATUS_POSITIVE
  | typeof RETELL_CALL_STATUS_NEGATIVE
  | typeof RETELL_CALL_STATUS_NO_ANSWER;

export type ResolvedRetellOutcome = {
  outcome: RetellCallOutcome;
  call_status: RetellContactCallStatus;
  transferred: boolean;
  reason: string;
};

const TRANSFER_DISCONNECT = /^(call_transfer|transfer_bridged)$/i;
const NO_ANSWER_DISCONNECT =
  /^(dial_no_answer|dial_busy|dial_failed|voicemail_reached|user_declined|no_answer|not_connected|unanswered)$/i;

type TranscriptToolEntry = {
  role?: string;
  name?: string;
  tool_name?: string;
  type?: string;
  content?: string | null;
  arguments?: unknown;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function toolNameFromEntry(entry: TranscriptToolEntry): string {
  return String(entry.name ?? entry.tool_name ?? entry.type ?? "").trim().toLowerCase();
}

/**
 * Prefer explicit Retell transfer signals over spoken-phrase heuristics.
 */
export function detectRetellTransfer(call: Record<string, unknown> | null | undefined): boolean {
  if (!call) return false;

  const disconnect = String(
    call.disconnection_reason ?? call.disconnection ?? "",
  ).trim();
  if (TRANSFER_DISCONNECT.test(disconnect)) return true;

  if (call.transfer_destination != null && String(call.transfer_destination).trim()) {
    return true;
  }

  const meta = asRecord(call.metadata);
  if (meta) {
    if (meta.transferred === true || meta.transfer_call === true) return true;
    const flag = String(meta.transferred ?? meta.transfer_call ?? meta.outcome ?? "").toLowerCase();
    if (flag === "true" || flag === "1" || /transfer|συνδέθηκε/i.test(flag)) return true;
  }

  const toolLists: unknown[] = [
    call.transcript_with_tool_calls,
    call.tool_calls,
    asRecord(call.call_analysis)?.tool_calls,
  ].filter((x) => Array.isArray(x)) as unknown[];

  for (const list of toolLists) {
    for (const raw of list as TranscriptToolEntry[]) {
      const name = toolNameFromEntry(raw);
      if (
        name === "transfer_call" ||
        name.includes("transfer_call") ||
        name === "transfer" ||
        name === "warm_transfer"
      ) {
        return true;
      }
      const role = String(raw.role ?? "").toLowerCase();
      if (role.includes("tool") && /transfer/i.test(String(raw.content ?? ""))) {
        return true;
      }
    }
  }

  // Fallback: agent spoke a transfer phrase (legacy multi-turn script).
  const lastAgent = getLastAgentLine(call);
  if (/συνδέω\s*τώρα|σας\s*συνδέω|ένα(?:ν)?\s*στιγμ/iu.test(lastAgent)) {
    return true;
  }

  return false;
}

export function getLastAgentLine(call: Record<string, unknown> | null | undefined): string {
  if (!call) return "";
  const list =
    (call.transcript_object as TranscriptToolEntry[] | undefined) ||
    (Array.isArray(call.transcript) ? (call.transcript as TranscriptToolEntry[]) : undefined);
  if (Array.isArray(list)) {
    for (let i = list.length - 1; i >= 0; i--) {
      const r = list[i];
      if (r && String(r.role).toLowerCase() === "agent" && (r.content ?? "")) {
        return String(r.content);
      }
    }
  }
  if (typeof call.transcript === "string" && call.transcript.length) {
    const lines = call.transcript
      .split("\n")
      .filter((l) => /^\s*agent[:\s]/i.test(l) || l.includes("Agent:"));
    if (lines.length) {
      return lines[lines.length - 1]!
        .replace(/^\s*agent[:\s]*/i, "")
        .replace(/^Agent:\s*/i, "")
        .trim();
    }
  }
  return "";
}

/**
 * Map a finished Retell call to CRM outcome + contact call_status.
 *
 * Rules:
 * - transfer detected → connected
 * - duration < 15s and no transfer → no answer
 * - otherwise (≥15s, no transfer) → declined
 * - Retell dial/voicemail disconnect → no answer (even if duration ≥ 15)
 *
 * Never returns Pending/Αναμονή — those are only for in-flight dial rows.
 * Webhook must UPDATE the Pending row on call_ended or the UI stays «Αναμονή».
 */
export function resolveRetellCallOutcome(
  call: Record<string, unknown> | null | undefined,
  durationSec: number,
): ResolvedRetellOutcome {
  const transferred = detectRetellTransfer(call);
  if (transferred) {
    return {
      outcome: RETELL_OUTCOME_CONNECTED,
      call_status: RETELL_CALL_STATUS_POSITIVE,
      transferred: true,
      reason: "transfer",
    };
  }

  const disconnect = String(
    (call as { disconnection_reason?: string } | null | undefined)?.disconnection_reason
      ?? (call as { disconnection?: string } | null | undefined)?.disconnection
      ?? "",
  ).trim();
  if (disconnect && NO_ANSWER_DISCONNECT.test(disconnect)) {
    return {
      outcome: RETELL_OUTCOME_NO_ANSWER,
      call_status: RETELL_CALL_STATUS_NO_ANSWER,
      transferred: false,
      reason: "retell_disconnect",
    };
  }

  if (Number.isFinite(durationSec) && durationSec >= 0 && durationSec < 15) {
    return {
      outcome: RETELL_OUTCOME_NO_ANSWER,
      call_status: RETELL_CALL_STATUS_NO_ANSWER,
      transferred: false,
      reason: "short_call",
    };
  }

  return {
    outcome: RETELL_OUTCOME_DECLINED,
    call_status: RETELL_CALL_STATUS_NEGATIVE,
    transferred: false,
    reason: "declined_transfer",
  };
}

/** Whether an outcome counts as a successful warm transfer (campaign success rate). */
export function isPositiveRetellOutcome(outcome: string | null | undefined): boolean {
  return outcome === RETELL_OUTCOME_CONNECTED || outcome === "Positive";
}

export function isNegativeRetellOutcome(outcome: string | null | undefined): boolean {
  return outcome === RETELL_OUTCOME_DECLINED || outcome === "Negative";
}

export function isNoAnswerRetellOutcome(outcome: string | null | undefined): boolean {
  return outcome === RETELL_OUTCOME_NO_ANSWER || outcome === "No Answer";
}

export function isConcludedRetellOutcome(outcome: string | null | undefined): boolean {
  return (
    isPositiveRetellOutcome(outcome) ||
    isNegativeRetellOutcome(outcome) ||
    isNoAnswerRetellOutcome(outcome)
  );
}

export function retellOutcomeLabel(outcome: string | null | undefined): string {
  if (!outcome) return "—";
  const legacy: Record<string, string> = {
    Positive: RETELL_OUTCOME_CONNECTED,
    Negative: RETELL_OUTCOME_DECLINED,
    "No Answer": RETELL_OUTCOME_NO_ANSWER,
    Pending: "Αναμονή",
  };
  return legacy[outcome] ?? outcome;
}

/**
 * Tailwind classes for outcome badges — solid fills + high-contrast text (WCAG AA ≥4.5:1).
 * Works on light and dark surfaces (white/dark text on saturated backgrounds).
 */
export function retellOutcomeBadgeClass(outcome: string | null | undefined): string {
  const label = retellOutcomeLabel(outcome);
  const map: Record<string, string> = {
    [RETELL_OUTCOME_CONNECTED]: "bg-emerald-700 text-white ring-1 ring-emerald-900/35",
    [RETELL_OUTCOME_DECLINED]: "bg-red-700 text-white ring-1 ring-red-900/35",
    [RETELL_OUTCOME_NO_ANSWER]: "bg-orange-500 text-white ring-1 ring-orange-700/35",
    Αναμονή: "bg-sky-700 text-white ring-1 ring-sky-900/35",
  };
  return map[label] ?? "bg-slate-200 text-slate-900 ring-1 ring-slate-400/50";
}

/** Subtle row background tint by call outcome (tables / lists). */
export function retellOutcomeRowTintClass(outcome: string | null | undefined): string {
  const label = retellOutcomeLabel(outcome);
  if (label === RETELL_OUTCOME_CONNECTED) return "bg-emerald-500/[0.07]";
  if (label === RETELL_OUTCOME_DECLINED) return "bg-red-500/[0.07]";
  if (label === RETELL_OUTCOME_NO_ANSWER) return "bg-amber-500/[0.08]";
  if (label === "Αναμονή") return "bg-sky-500/[0.07]";
  return "";
}
