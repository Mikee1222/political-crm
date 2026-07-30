import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { logActivity } from "@/lib/activity-log";
import { firstNameFromFull } from "@/lib/activity-descriptions";
import { getCampaignRollup } from "@/lib/campaign-stats";
import {
  contactFilterHasCriteria,
  listContactIdsMatching,
  type ContactFilter,
} from "@/lib/contacts-filter-query";
import { nextJsonError } from "@/lib/api-resilience";
import { clampConcurrentLines } from "@/lib/campaign-concurrent-lines";
import { resolveRetellAgentName } from "@/lib/campaign-retell-agent";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }

    const { data: campaignRows, error } = await supabase
      .from("campaigns")
      .select(
        "id, name, started_at, created_at, description, status, sentiment_data, channel, campaign_type_id, retell_agent_id, concurrent_lines",
      )
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const campaigns = (campaignRows ?? []) as Array<{
      id: string;
      name: string;
      started_at: string | null;
      created_at: string | null;
      description: string | null;
      status: string | null;
      sentiment_data: unknown;
      channel?: string | null;
      retell_agent_id?: string | null;
      concurrent_lines?: number | null;
    }>;

    const agentIds = [
      ...new Set(
        campaigns
          .map((c) => String(c.retell_agent_id ?? "").trim())
          .filter(Boolean)
          .concat([(process.env.RETELL_AGENT_ID ?? "").trim()].filter(Boolean)),
      ),
    ];
    const agentNameById = new Map<string, string>();
    if (agentIds.length > 0) {
      const { data: agents } = await supabase
        .from("retell_agents")
        .select("agent_id, name")
        .in("agent_id", agentIds);
      for (const a of (agents ?? []) as Array<{ agent_id: string; name: string }>) {
        if (a.agent_id) agentNameById.set(a.agent_id, a.name);
      }
    }

    const withStats = await Promise.all(
      campaigns.map(async (campaign) => {
        const rollup = await getCampaignRollup(supabase, campaign.id);
        const agentId =
          String(campaign.retell_agent_id ?? "").trim() ||
          (process.env.RETELL_AGENT_ID ?? "").trim() ||
          null;
        const agent_name = agentId
          ? agentNameById.get(agentId) ?? agentId
          : null;
        return {
          ...campaign,
          status: campaign.status ?? "active",
          description: campaign.description,
          stats: rollup.stats,
          progress: Math.round(rollup.progress * 10) / 10,
          callsMade: rollup.callsMade,
          contactTotal: rollup.withPhone,
          withPhone: rollup.withPhone,
          withoutPhone: rollup.withoutPhone,
          remaining: rollup.remaining,
          retell_agent_name: agent_name,
          retell_agent_id_resolved: agentId,
        };
      }),
    );

    const pr = (s: { total: number; positive: number }) =>
      s.total > 0 ? (s.positive / s.total) * 100 : 0;
    const withSentiment = withStats.map((c, i) => {
      const cur = pr(c.stats);
      const prev = i < withStats.length - 1 ? pr(withStats[i + 1]!.stats) : null;
      const trendDelta = prev != null ? Math.round((cur - prev) * 10) / 10 : null;
      return {
        ...c,
        sentiment: {
          positiveRate: Math.round(cur * 10) / 10,
          trendDelta,
          previousCampaignId: i < withStats.length - 1 ? withStats[i + 1]!.id : null,
        },
      };
    });

    return NextResponse.json({ campaigns: withSentiment });
  } catch (e) {
    console.error("[api/campaigns GET]", e);
    return nextJsonError();
  }
}

export async function POST(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { user, profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }

    const body = (await request.json()) as {
      name?: string;
      description?: string;
      filter?: ContactFilter;
      contact_ids?: string[];
      channel?: string;
      campaign_type_id?: string | null;
      concurrent_lines?: number;
    };
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Υποχρεωτικό όνομα" }, { status: 400 });
    }

    let contactIds: string[] = [];
    if (Array.isArray(body.contact_ids) && body.contact_ids.length > 0) {
      contactIds = [...new Set(body.contact_ids.map((x) => String(x).trim()).filter(Boolean))];
    } else {
      const rawGroupIds = body.filter?.group_ids;
      const group_ids = Array.isArray(rawGroupIds)
        ? [...new Set(rawGroupIds.map((x) => String(x).trim()).filter(Boolean))]
        : undefined;
      const f: ContactFilter = {
        call_status: body.filter?.call_status,
        area: body.filter?.area,
        municipality: body.filter?.municipality,
        priority: body.filter?.priority,
        tag: body.filter?.tag,
        group_ids: group_ids?.length ? group_ids : undefined,
      };
      if (!contactFilterHasCriteria(f)) {
        return NextResponse.json(
          { error: "Επιλέξτε τουλάχιστον ένα κριτήριο φίλτρου για τις επαφές ή contact_ids" },
          { status: 400 },
        );
      }

      const { ids, error: idErr } = await listContactIdsMatching(supabase, f);
      if (idErr) return NextResponse.json({ error: idErr }, { status: 400 });
      contactIds = ids;
    }
    if (contactIds.length === 0) {
      return NextResponse.json(
        { error: "Καμία επαφή δεν ταιριάζει με το φίλτρο" },
        { status: 400 },
      );
    }

    const channel = body.channel === "whatsapp" ? "whatsapp" : "call";
    let campaign_type_id: string | null = null;
    let retell_agent_id: string | null = null;
    const ctRaw = body.campaign_type_id != null ? String(body.campaign_type_id).trim() : "";
    if (ctRaw) {
      const { data: ctRow, error: ctErr } = await supabase
        .from("campaign_types")
        .select("id, retell_agent_id")
        .eq("id", ctRaw)
        .maybeSingle();
      if (ctErr || !ctRow) {
        return NextResponse.json({ error: "Άκυρος τύπος καμπάνιας" }, { status: 400 });
      }
      campaign_type_id = (ctRow as { id: string }).id;
      const ra = String((ctRow as { retell_agent_id?: string | null }).retell_agent_id ?? "").trim();
      retell_agent_id = ra || null;
    }

    const concurrent_lines = clampConcurrentLines(body.concurrent_lines);

    const { data, error } = await supabase
      .from("campaigns")
      .insert({
        name,
        description: body.description ? String(body.description) : null,
        started_at: new Date().toISOString(),
        status: "active",
        channel,
        campaign_type_id,
        retell_agent_id,
        concurrent_lines,
      })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const campaign = data as { id: string; name: string };
    const rows = contactIds.map((contact_id) => ({ campaign_id: campaign.id, contact_id }));
    const { error: ccErr } = await supabase.from("campaign_contacts").insert(rows);
    if (ccErr) {
      await supabase.from("campaigns").delete().eq("id", campaign.id);
      return NextResponse.json({ error: ccErr.message }, { status: 400 });
    }

    const agentInfo = retell_agent_id
      ? await resolveRetellAgentName(supabase, retell_agent_id)
      : { agent_id: null, agent_name: null };

    const cname = String(campaign.name ?? "Καμπάνια");
    await logActivity({
      userId: user.id,
      action: "campaign_started",
      entityType: "campaign",
      entityId: campaign.id,
      entityName: cname,
      details: {
        actor_name: firstNameFromFull(profile?.full_name),
        contact_count: contactIds.length,
      },
    });
    return NextResponse.json({
      campaign: data,
      assigned_contacts: contactIds.length,
      retell_agent_name: agentInfo.agent_name,
    });
  } catch (e) {
    console.error("[api/campaigns POST]", e);
    return nextJsonError();
  }
}
