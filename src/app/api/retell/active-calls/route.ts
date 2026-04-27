import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { getRetellAgentIdForCampaign } from "@/lib/campaign-retell-agent";
import { isSameEuropeAthensCalendarDay } from "@/lib/campaign-athens-day";
import { nextJsonError } from "@/lib/api-resilience";
import { clampConcurrentLines } from "@/lib/campaign-concurrent-lines";
export const dynamic = "force-dynamic";

type RetellListCall = Record<string, unknown>;

export async function GET(request: NextRequest) {
  try {
    if (!process.env.RETELL_API_KEY) {
      return NextResponse.json(
        { error: "Η Retell δεν έχει ρυθμιστεί (λείπει RETELL_API_KEY)" },
        { status: 503 },
      );
    }

    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    if (!hasMinRole(crm.profile?.role, "manager")) {
      return forbidden();
    }

    const sp = request.nextUrl.searchParams;
    const campaignId = sp.get("campaign_id")?.trim() ?? "";
    const agentParam = sp.get("agent_id")?.trim() ?? "";

    let agentId: string | null = agentParam || null;
    if (!agentId && campaignId) {
      agentId = await getRetellAgentIdForCampaign(crm.supabase, campaignId);
    }
    if (!agentId) {
      return NextResponse.json(
        { error: "Χρειάζεται agent_id ή campaign_id με retell_agent_id" },
        { status: 400 },
      );
    }

    const retellRes = await fetch("https://api.retellai.com/v2/list-calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RETELL_API_KEY}`,
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
      return NextResponse.json(
        { error: "Αποτυχία Retell list-calls", detail: raw },
        { status: 400 },
      );
    }
    const list = Array.isArray(raw) ? (raw as RetellListCall[]) : [];

    let called_today: number | null = null;
    let success_rate_today_pct: number | null = null;
    let concurrent_lines = 3;

    if (campaignId) {
      const { data: campMeta } = await crm.supabase
        .from("campaigns")
        .select("concurrent_lines")
        .eq("id", campaignId)
        .maybeSingle();
      concurrent_lines = clampConcurrentLines(
        (campMeta as { concurrent_lines?: unknown } | null)?.concurrent_lines,
      );

      const { data: callRows, error: cErr } = await crm.supabase
        .from("calls")
        .select("called_at, outcome")
        .eq("campaign_id", campaignId);
      if (!cErr && callRows) {
        const todayRows = (callRows as Array<{ called_at: string | null; outcome: string | null }>).filter(
          (r) => r.called_at && isSameEuropeAthensCalendarDay(r.called_at),
        );
        called_today = todayRows.length;
        const concluded = todayRows.filter(
          (r) => r.outcome === "Positive" || r.outcome === "Negative" || r.outcome === "No Answer",
        );
        const pos = concluded.filter((r) => r.outcome === "Positive").length;
        success_rate_today_pct =
          concluded.length > 0 ? Math.round((pos / concluded.length) * 1000) / 10 : null;
      }
    }

    return NextResponse.json({
      agent_id: agentId,
      ongoing_count: list.length,
      ongoing_calls: list,
      called_today,
      success_rate_today_pct,
      concurrent_lines: campaignId ? concurrent_lines : undefined,
    });
  } catch (e) {
    console.error("[api/retell/active-calls GET]", e);
    return nextJsonError();
  }
}
