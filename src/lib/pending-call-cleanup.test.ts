import { describe, expect, it } from "vitest";
import {
  PENDING_ADMIN_CLEANUP_MS,
  PENDING_AUTO_CLEANUP_MS,
  PENDING_CALL_OUTCOMES,
  PENDING_CONTACT_STATUSES,
} from "@/lib/pending-call-cleanup";
import { RETELL_CALL_STATUS_NO_ANSWER, RETELL_OUTCOME_NO_ANSWER } from "@/lib/retell-call-outcomes";

describe("pending-call-cleanup constants", () => {
  it("uses 2h auto and 1h admin thresholds", () => {
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
