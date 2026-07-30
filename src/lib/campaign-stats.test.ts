import { describe, expect, it } from "vitest";
import { buildCampaignAnalytics } from "@/lib/campaign-stats";
import {
  RETELL_OUTCOME_CONNECTED,
  RETELL_OUTCOME_DECLINED,
  RETELL_OUTCOME_NO_ANSWER,
} from "@/lib/retell-call-outcomes";

describe("buildCampaignAnalytics", () => {
  it("computes outcome distribution and comparison", () => {
    const analytics = buildCampaignAnalytics(
      [
        { called_at: "2026-07-30T10:00:00.000Z", outcome: RETELL_OUTCOME_CONNECTED },
        { called_at: "2026-07-30T11:00:00.000Z", outcome: RETELL_OUTCOME_DECLINED },
        { called_at: "2026-07-29T11:00:00.000Z", outcome: RETELL_OUTCOME_NO_ANSWER },
      ],
      [{ total: 10, positive: 4, negative: 3, noAnswer: 3 }],
    );
    expect(analytics.outcome_distribution.find((o) => o.key === "positive")?.value).toBe(1);
    expect(analytics.comparison.this_success_rate).toBeCloseTo(33.3, 0);
    expect(analytics.comparison.avg_success_rate).toBe(40);
    expect(analytics.multi_day).toBe(true);
    expect(analytics.cumulative_by_day.length).toBeGreaterThanOrEqual(2);
  });
});
