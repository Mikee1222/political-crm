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
  parseCampaignFilterBody,
  serializeCampaignFilter,
  type ContactFilter,
} from "@/lib/contacts-filter-query";
import { nextJsonError } from "@/lib/api-resilience";
import { clampConcurrentLines } from "@/lib/campaign-concurrent-lines";
import { resolveRetellAgentName } from "@/lib/campaign-retell-agent";
export const dynamic = "force-dynamic";

const CAMPAIGN_LIST_SELECT =
  "id, name, started_at, created_at, description, status, sentiment_data, channel, campaign_type_id, retell_agent_id, concurrent_lines";

type CampaignListRow = {
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
};

type CampaignSort = "newest" | "oldest" | "alphabetical" | "success";

function parseCampaignSort(raw: string | null): CampaignSort {
  if (raw === "oldest" || raw === "alphabetical" || raw === "success") return raw;
  return "newest";
}

function escapeIlike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function successRate(stats: { total: number; positive: number }): number {
  return stats.total > 0 ? (stats.positive / stats.total) * 100 : 0;
}

export async function GET(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }

    const sp = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
    const pageSize = Math.min(
      50,
      Math.max(1, parseInt(sp.get("page_size") || "5", 10) || 5),
    );
    const statusParam = (sp.get("status") || "").trim().toLowerCase();
    const channelParam = (sp.get("channel") || "").trim().toLowerCase();
    const q = (sp.get("q") || "").trim();
    const sort = parseCampaignSort((sp.get("sort") || "").trim().toLowerCase());

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const applyFilters = (query: any) => {
      let qBuilder = query;
      if (statusParam === "active" || statusParam === "completed") {
        qBuilder = qBuilder.eq("status", statusParam);
      }
      if (channelParam === "whatsapp") {
        qBuilder = qBuilder.eq("channel", "whatsapp");
      } else if (channelParam === "call") {
        qBuilder = qBuilder.or("channel.eq.call,channel.is.null");
      }
      if (q) {
        qBuilder = qBuilder.ilike("name", `%${escapeIlike(q)}%`);
      }
      return qBuilder;
    };

    let campaignRows: CampaignListRow[] = [];
    let total = 0;

    if (sort === "success") {
      // Success-rate sort needs rollups first — load all matching rows, then paginate in memory.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let listQuery: any = supabase
        .from("campaigns")
        .select(CAMPAIGN_LIST_SELECT, { count: "exact" });
      listQuery = applyFilters(listQuery).order("created_at", { ascending: false });
      const { data, error, count } = await listQuery;
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      campaignRows = (data ?? []) as CampaignListRow[];
      total = count ?? campaignRows.length;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let listQuery: any = supabase
        .from("campaigns")
        .select(CAMPAIGN_LIST_SELECT, { count: "exact" });
      listQuery = applyFilters(listQuery);
      if (sort === "oldest") {
        listQuery = listQuery.order("created_at", { ascending: true });
      } else if (sort === "alphabetical") {
        listQuery = listQuery.order("name", { ascending: true });
      } else {
        listQuery = listQuery.order("created_at", { ascending: false });
      }
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const { data, error, count } = await listQuery.range(from, to);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      campaignRows = (data ?? []) as CampaignListRow[];
      total = count ?? 0;
    }

    const campaigns = campaignRows;

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

    let pageStats = withStats;
    if (sort === "success") {
      const sorted = [...withStats].sort(
        (a, b) => successRate(b.stats) - successRate(a.stats),
      );
      const from = (page - 1) * pageSize;
      pageStats = sorted.slice(from, from + pageSize);
    }

    const withSentiment = pageStats.map((c, i) => {
      const cur = successRate(c.stats);
      const prev = i < pageStats.length - 1 ? successRate(pageStats[i + 1]!.stats) : null;
      const trendDelta = prev != null ? Math.round((cur - prev) * 10) / 10 : null;
      return {
        ...c,
        sentiment: {
          positiveRate: Math.round(cur * 10) / 10,
          trendDelta,
          previousCampaignId: i < pageStats.length - 1 ? pageStats[i + 1]!.id : null,
        },
      };
    });

    return NextResponse.json({
      campaigns: withSentiment,
      total,
      page,
      page_size: pageSize,
    });
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
      filter?: ContactFilter | Record<string, unknown>;
      contact_ids?: string[];
      channel?: string;
      campaign_type_id?: string | null;
      concurrent_lines?: number;
    };
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Υποχρεωτικό όνομα" }, { status: 400 });
    }

    const manualIds = Array.isArray(body.contact_ids)
      ? [...new Set(body.contact_ids.map((x) => String(x).trim()).filter(Boolean))]
      : [];
    const f = parseCampaignFilterBody(body.filter ?? {});
    // Campaigns default to dialable contacts when has_phone omitted.
    if (body.filter == null || (body.filter as ContactFilter).has_phone === undefined) {
      f.has_phone = "has";
    }
    const hasFilter = contactFilterHasCriteria(f);

    if (!manualIds.length && !hasFilter) {
      return NextResponse.json(
        { error: "Επιλέξτε τουλάχιστον ένα κριτήριο φίλτρου για τις επαφές ή contact_ids" },
        { status: 400 },
      );
    }

    let filterIds: string[] = [];
    let filterMatchTotal: number | undefined;
    if (hasFilter) {
      const { ids, error: idErr, match_total } = await listContactIdsMatching(supabase, f, {
        applyHasPhone: true,
        defaultHasPhone: true,
      });
      if (idErr) return NextResponse.json({ error: idErr }, { status: 400 });
      filterIds = ids;
      filterMatchTotal = match_total;
    }

    // Manual selections UNION filter matches.
    const contactIds = [...new Set([...filterIds, ...manualIds])];
    if (contactIds.length === 0) {
      return NextResponse.json(
        { error: "Καμία επαφή δεν ταιριάζει με το φίλτρο" },
        { status: 400 },
      );
    }

    const filtersJson = hasFilter ? serializeCampaignFilter(f) : null;

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
        filters: filtersJson,
      })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const campaign = data as { id: string; name: string };
    const rows = contactIds.map((contact_id) => ({ campaign_id: campaign.id, contact_id }));
    const INSERT_CHUNK = 500;
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const chunk = rows.slice(i, i + INSERT_CHUNK);
      const { error: ccErr } = await supabase.from("campaign_contacts").insert(chunk);
      if (ccErr) {
        await supabase.from("campaigns").delete().eq("id", campaign.id);
        return NextResponse.json({ error: ccErr.message }, { status: 400 });
      }
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

    const assigned_count = contactIds.length;
    const warning =
      filterMatchTotal != null && assigned_count < filterMatchTotal
        ? `Ανατέθηκαν ${assigned_count} επαφές αλλά το φίλτρο ταιριάζει σε ${filterMatchTotal} (πιθανό όριο σελίδας).`
        : undefined;

    return NextResponse.json({
      campaign: data,
      assigned_contacts: assigned_count,
      assigned_count,
      ...(warning ? { warning } : {}),
      retell_agent_name: agentInfo.agent_name,
    });
  } catch (e) {
    console.error("[api/campaigns POST]", e);
    return nextJsonError();
  }
}
