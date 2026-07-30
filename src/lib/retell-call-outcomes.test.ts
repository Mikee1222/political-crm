import { describe, expect, it } from "vitest";
import {
  RETELL_CALL_STATUS_NEGATIVE,
  RETELL_CALL_STATUS_NO_ANSWER,
  RETELL_CALL_STATUS_POSITIVE,
  RETELL_OUTCOME_CONNECTED,
  RETELL_OUTCOME_DECLINED,
  RETELL_OUTCOME_NO_ANSWER,
  detectRetellTransfer,
  resolveRetellCallOutcome,
  retellOutcomeBadgeClass,
  retellOutcomeLabel,
} from "@/lib/retell-call-outcomes";
import { applyRetellHeuristics } from "@/lib/retell-llm";

describe("detectRetellTransfer", () => {
  it("detects disconnection_reason call_transfer", () => {
    expect(detectRetellTransfer({ disconnection_reason: "call_transfer" })).toBe(true);
  });

  it("detects transfer_bridged", () => {
    expect(detectRetellTransfer({ disconnection_reason: "transfer_bridged" })).toBe(true);
  });

  it("detects transfer_destination", () => {
    expect(detectRetellTransfer({ transfer_destination: "+306912345678" })).toBe(true);
  });

  it("detects transfer_call in transcript_with_tool_calls", () => {
    expect(
      detectRetellTransfer({
        transcript_with_tool_calls: [
          { role: "agent", content: "…" },
          { role: "tool_call_invocation", name: "transfer_call" },
        ],
      }),
    ).toBe(true);
  });

  it("returns false when no transfer signal", () => {
    expect(
      detectRetellTransfer({
        disconnection_reason: "user_hangup",
        duration_ms: 30_000,
        transcript_object: [{ role: "agent", content: "Καλησπέρα σας;" }],
      }),
    ).toBe(false);
  });
});

describe("resolveRetellCallOutcome", () => {
  it("maps transfer → Συνδέθηκε με ΚΚ / Θετικό", () => {
    const r = resolveRetellCallOutcome({ disconnection_reason: "call_transfer" }, 8);
    expect(r).toMatchObject({
      outcome: RETELL_OUTCOME_CONNECTED,
      call_status: RETELL_CALL_STATUS_POSITIVE,
      transferred: true,
    });
  });

  it("maps short call without transfer → Δεν απάντησε", () => {
    const r = resolveRetellCallOutcome({ disconnection_reason: "user_hangup" }, 10);
    expect(r).toMatchObject({
      outcome: RETELL_OUTCOME_NO_ANSWER,
      call_status: RETELL_CALL_STATUS_NO_ANSWER,
      transferred: false,
    });
  });

  it("maps dial_no_answer → Δεν απάντησε even if duration ≥ 15", () => {
    const r = resolveRetellCallOutcome({ disconnection_reason: "dial_no_answer" }, 40);
    expect(r.outcome).toBe(RETELL_OUTCOME_NO_ANSWER);
  });

  it("maps ≥15s no transfer → Δεν ήθελε σύνδεση με ΚΚ", () => {
    const r = resolveRetellCallOutcome({ disconnection_reason: "agent_hangup" }, 22);
    expect(r).toMatchObject({
      outcome: RETELL_OUTCOME_DECLINED,
      call_status: RETELL_CALL_STATUS_NEGATIVE,
      transferred: false,
    });
  });

  it("prefers transfer over short duration", () => {
    const r = resolveRetellCallOutcome(
      {
        disconnection_reason: "call_transfer",
        transcript_with_tool_calls: [{ name: "transfer_call" }],
      },
      5,
    );
    expect(r.outcome).toBe(RETELL_OUTCOME_CONNECTED);
  });
});

describe("applyRetellHeuristics", () => {
  it("ends call on decline line", () => {
    expect(applyRetellHeuristics("Εντάξει, καλή συνέχεια!")).toEqual({
      end_call: true,
      transfer_call: false,
    });
  });

  it("transfers on legacy connect phrase", () => {
    expect(applyRetellHeuristics("Ένα στιγμάκι, σας συνδέω τώρα!")).toEqual({
      end_call: false,
      transfer_call: true,
    });
  });
});

describe("retellOutcomeLabel / badge", () => {
  it("maps legacy and pending labels", () => {
    expect(retellOutcomeLabel("Pending")).toBe("Αναμονή");
    expect(retellOutcomeLabel("Positive")).toBe(RETELL_OUTCOME_CONNECTED);
    expect(retellOutcomeLabel(RETELL_OUTCOME_NO_ANSWER)).toBe(RETELL_OUTCOME_NO_ANSWER);
  });

  it("returns distinct badge classes for the three Retell outcomes", () => {
    const a = retellOutcomeBadgeClass(RETELL_OUTCOME_CONNECTED);
    const b = retellOutcomeBadgeClass(RETELL_OUTCOME_DECLINED);
    const c = retellOutcomeBadgeClass(RETELL_OUTCOME_NO_ANSWER);
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
    expect(a).toContain("emerald");
    expect(c).toContain("amber");
  });
});
