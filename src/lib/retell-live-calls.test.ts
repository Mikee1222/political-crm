import { describe, expect, it, vi, afterEach } from "vitest";
import { getRetellLiveCallCount } from "@/lib/retell-live-calls";

describe("getRetellLiveCallCount", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns error when api key missing", async () => {
    const prev = process.env.RETELL_API_KEY;
    delete process.env.RETELL_API_KEY;
    const r = await getRetellLiveCallCount({ agentId: "agent_1", apiKey: "" });
    expect(r.error).toBeTruthy();
    expect(r.count).toBe(0);
    if (prev !== undefined) process.env.RETELL_API_KEY = prev;
  });

  it("counts ongoing calls for campaign", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [
          { call_id: "c1", metadata: { campaign_id: "camp-a" } },
          { call_id: "c2", metadata: { campaign_id: "camp-b" } },
          { call_id: "c3", metadata: { campaign_id: "camp-a" } },
        ],
      })),
    );
    const r = await getRetellLiveCallCount({
      agentId: "agent_1",
      campaignId: "camp-a",
      apiKey: "key",
    });
    expect(r.error).toBeNull();
    expect(r.count).toBe(2);
  });
});
