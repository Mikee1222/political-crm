import { describe, expect, it } from "vitest";
import {
  PENDING_ADMIN_CLEANUP_MS,
  PENDING_AUTO_CLEANUP_MS,
  PENDING_CALL_OUTCOMES,
  PENDING_CONTACT_STATUSES,
  PENDING_DIAL_TTL_MS,
  isActivePendingOutcome,
  isPendingOutcome,
} from "@/lib/pending-call-cleanup";
import { RETELL_CALL_STATUS_NO_ANSWER, RETELL_OUTCOME_NO_ANSWER } from "@/lib/retell-call-outcomes";

describe("pending-call-cleanup constants", () => {
  it("uses 30m dial TTL, 2h auto and 1h admin thresholds", () => {
    expect(PENDING_DIAL_TTL_MS).toBe(30 * 60 * 1000);
    expect(PENDING_AUTO_CLEANUP_MS).toBe(2 * 60 * 60 * 1000);
    expect(PENDING_ADMIN_CLEANUP_MS).toBe(60 * 60 * 1000);
  });

  it("recognizes Pending and Αναμονή", () => {
    expect(PENDING_CALL_OUTCOMES).toContain("Pending");
    expect(PENDING_CALL_OUTCOMES).toContain("Αναμονή");
    expect(PENDING_CONTACT_STATUSES).toContain("Pending");
  });

  it("maps cleanup to Retell no-answer labels", () => {
    expect(RETELL_OUTCOME_NO_ANSWER).toBe("Δεν απάντησε");
    expect(RETELL_CALL_STATUS_NO_ANSWER).toBe("Δεν Απάντησε");
  });
});

describe("isActivePendingOutcome", () => {
  const now = Date.parse("2026-08-04T12:00:00.000Z");

  it("treats fresh Pending as active", () => {
    expect(isPendingOutcome("Pending")).toBe(true);
    expect(
      isActivePendingOutcome("Pending", "2026-08-04T11:50:00.000Z", now),
    ).toBe(true);
  });

  it("treats Pending older than 30m as expired", () => {
    expect(
      isActivePendingOutcome("Pending", "2026-08-04T11:00:00.000Z", now),
    ).toBe(false);
    expect(
      isActivePendingOutcome("Αναμονή", "2026-08-04T11:29:00.000Z", now),
    ).toBe(false);
  });

  it("ignores non-pending outcomes", () => {
    expect(isActivePendingOutcome("Δεν απάντησε", "2026-08-04T11:50:00.000Z", now)).toBe(
      false,
    );
  });
});
