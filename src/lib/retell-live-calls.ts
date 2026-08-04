/**
 * Count ongoing Retell phone calls (optionally scoped to a campaign via metadata).
 * Same list-calls filter pattern as `/api/retell/active-calls`.
 */
export async function getRetellLiveCallCount(opts: {
  agentId: string;
  campaignId?: string | null;
  apiKey?: string | null;
}): Promise<{ count: number; error: string | null }> {
  const apiKey = (opts.apiKey ?? process.env.RETELL_API_KEY)?.trim();
  if (!apiKey) {
    return { count: 0, error: "Η Retell δεν έχει ρυθμιστεί (λείπει RETELL_API_KEY)" };
  }
  const agentId = opts.agentId?.trim();
  if (!agentId) {
    return { count: 0, error: "Λείπει agent_id" };
  }

  try {
    const retellRes = await fetch("https://api.retellai.com/v2/list-calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filter_criteria: {
          agent_id: [agentId],
          call_status: ["ongoing"],
          call_type: ["phone_call"],
        },
        limit: 100,
      }),
    });
    const raw = (await retellRes.json().catch(() => [])) as unknown;
    if (!retellRes.ok) {
      return { count: 0, error: "Αποτυχία Retell list-calls" };
    }
    const list = Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : [];
    const campaignId = opts.campaignId?.trim() ?? "";
    let count = 0;
    for (const call of list) {
      if (campaignId) {
        const meta =
          call.metadata && typeof call.metadata === "object" && !Array.isArray(call.metadata)
            ? (call.metadata as Record<string, unknown>)
            : {};
        const callCampaign = String(meta.campaign_id ?? "").trim();
        if (callCampaign && callCampaign !== campaignId) continue;
      }
      count += 1;
    }
    return { count, error: null };
  } catch (e) {
    return {
      count: 0,
      error: e instanceof Error ? e.message : "Σφάλμα Retell live count",
    };
  }
}
