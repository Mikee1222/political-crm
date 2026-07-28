import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import {
  getRetellAgentIdForCampaign,
  resolveRetellAgentName,
} from "@/lib/campaign-retell-agent";
import { isSameEuropeAthensCalendarDay } from "@/lib/campaign-athens-day";
import { nextJsonError } from "@/lib/api-resilience";
import { clampConcurrentLines } from "@/lib/campaign-concurrent-lines";
import {
  detectRetellTransfer,
  isConcludedRetellOutcome,
  isPositiveRetellOutcome,
  retellOutcomeLabel,
} from "@/lib/retell-call-outcomes";
import { getCampaignRollup } from "@/lib/campaign-stats";
import { pickCampaignDialPhone } from "@/lib/campaign-contact-phone";
import {
  getRequestStatusQueryValues,
  REQUEST_STATUS_OPEN,
} from "@/lib/request-statuses";

export const dynamic = "force-dynamic";

type RetellListCall = Record<string, unknown>;

type OpenRequestChip = {
  id: string;
  title: string | null;
  category: string | null;
  status: string | null;
};

type ContactOpenRequests = {
  open_requests_count: number;
  open_requests: OpenRequestChip[];
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function callStartMs(call: RetellListCall): number | null {
  const raw =
    call.start_timestamp ??
    call.start_time ??
    call.started_at ??
    call.begin_timestamp ??
    null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    // Retell often uses ms since epoch
    return raw > 1e12 ? raw : raw * 1000;
  }
  if (typeof raw === "string" && raw.trim()) {
    const t = Date.parse(raw);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

/** Ringing vs connected heuristic for live Retell phone calls. */
function resolveCallPhase(
  durationSec: number | null,
  transferred: boolean,
): "ringing" | "connected" {
  if (transferred) return "connected";
  if (durationSec == null) return "ringing";
  return durationSec < 8 ? "ringing" : "connected";
}

async function fetchOpenRequestsByContactIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  contactIds: string[],
): Promise<Map<string, ContactOpenRequests>> {
  const map = new Map<string, ContactOpenRequests>();
  const unique = [...new Set(contactIds.filter(Boolean))];
  for (const id of unique) {
    map.set(id, { open_requests_count: 0, open_requests: [] });
  }
  if (unique.length === 0) return map;

  const openStatuses = getRequestStatusQueryValues(REQUEST_STATUS_OPEN);
  const { data: rows, error } = await supabase
    .from("requests")
    .select("id, title, category, status, contact_id, created_at")
    .in("contact_id", unique)
    .in("status", openStatuses)
    .order("created_at", { ascending: false });

  if (error || !rows) return map;

  type ReqRow = {
    id: string;
    title: string | null;
    category: string | null;
    status: string | null;
    contact_id: string;
  };

  for (const row of rows as ReqRow[]) {
    const bucket = map.get(row.contact_id);
    if (!bucket) continue;
    bucket.open_requests_count += 1;
    if (bucket.open_requests.length < 3) {
      bucket.open_requests.push({
        id: row.id,
        title: row.title,
        category: row.category,
        status: row.status,
      });
    }
  }
  return map;
}

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

    const agentInfo = await resolveRetellAgentName(crm.supabase, agentId);

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

    // Filter ongoing to this campaign when metadata present
    const now = Date.now();
    const ongoingBase = list
      .map((call) => {
        const meta = asRecord(call.metadata) ?? {};
        const callCampaign = String(meta.campaign_id ?? "").trim();
        if (campaignId && callCampaign && callCampaign !== campaignId) {
          return null;
        }
        const contactId = String(meta.contact_id ?? "").trim() || null;
        const first = String(meta.first_name ?? "").trim();
        const last = String(meta.last_name ?? "").trim();
        const name = [first, last].filter(Boolean).join(" ") || null;
        const toNumber = String(call.to_number ?? meta.to_number ?? "").trim() || null;
        const start = callStartMs(call);
        const duration_so_far_sec =
          start != null ? Math.max(0, Math.floor((now - start) / 1000)) : null;
        const transferred_to_kk = detectRetellTransfer(call);
        const call_phase = resolveCallPhase(duration_so_far_sec, transferred_to_kk);
        return {
          call_id: String(call.call_id ?? call.id ?? ""),
          contact_id: contactId,
          contact_name: name,
          phone: toNumber,
          duration_so_far_sec,
          started_at: start != null ? new Date(start).toISOString() : null,
          call_phase,
          transferred_to_kk,
          campaign_id: callCampaign || null,
          open_requests_count: 0,
          open_requests: [] as OpenRequestChip[],
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);

    // Fill missing names from CRM for campaign calls
    if (campaignId) {
      const needIds = ongoingBase
        .filter((o) => o.contact_id && !o.contact_name)
        .map((o) => o.contact_id!);
      if (needIds.length > 0) {
        const { data: contacts } = await crm.supabase
          .from("contacts")
          .select("id, first_name, last_name, phone, phone2, landline")
          .in("id", needIds);
        const cmap = new Map(
          ((contacts ?? []) as Array<{
            id: string;
            first_name: string | null;
            last_name: string | null;
            phone: string | null;
            phone2: string | null;
            landline: string | null;
          }>).map((c) => [c.id, c]),
        );
        for (const o of ongoingBase) {
          if (!o.contact_id) continue;
          const c = cmap.get(o.contact_id);
          if (!c) continue;
          if (!o.contact_name) {
            o.contact_name = [c.first_name, c.last_name].filter(Boolean).join(" ") || null;
          }
          if (!o.phone) {
            o.phone = pickCampaignDialPhone(c);
          }
        }
      }
    }

    let called_today: number | null = null;
    let success_rate_today_pct: number | null = null;
    let concurrent_lines = 3;
    let last_completed: Array<{
      id: string;
      contact_id: string;
      contact_name: string | null;
      phone: string | null;
      outcome: string | null;
      outcome_label: string;
      called_at: string | null;
      duration_seconds: number | null;
      open_requests_count: number;
      open_requests: OpenRequestChip[];
    }> = [];
    let progress: number | null = null;
    let callsMade: number | null = null;
    let contactTotal: number | null = null;
    let remaining: number | null = null;
    let avgDurationSec: number | null = null;
    let estimatedRemainingSec: number | null = null;
    let estimated_completion_at: string | null = null;
    let stats: {
      total: number;
      positive: number;
      negative: number;
      noAnswer: number;
    } | null = null;

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
        .select(
          "id, called_at, outcome, duration_seconds, contact_id, contacts(first_name, last_name, phone, phone2, landline)",
        )
        .eq("campaign_id", campaignId)
        .order("called_at", { ascending: false });
      if (!cErr && callRows) {
        type CallRow = {
          id: string;
          called_at: string | null;
          outcome: string | null;
          duration_seconds: number | null;
          contact_id: string;
          contacts:
            | {
                first_name: string | null;
                last_name: string | null;
                phone: string | null;
                phone2: string | null;
                landline: string | null;
              }
            | {
                first_name: string | null;
                last_name: string | null;
                phone: string | null;
                phone2: string | null;
                landline: string | null;
              }[]
            | null;
        };
        const rows = callRows as CallRow[];
        const todayRows = rows.filter(
          (r) => r.called_at && isSameEuropeAthensCalendarDay(r.called_at),
        );
        called_today = todayRows.length;
        const concluded = todayRows.filter((r) => isConcludedRetellOutcome(r.outcome));
        const pos = concluded.filter((r) => isPositiveRetellOutcome(r.outcome)).length;
        success_rate_today_pct =
          concluded.length > 0 ? Math.round((pos / concluded.length) * 1000) / 10 : null;

        last_completed = rows
          .filter((r) => isConcludedRetellOutcome(r.outcome))
          .slice(0, 5)
          .map((r) => {
            const cont = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts;
            return {
              id: r.id,
              contact_id: r.contact_id,
              contact_name: cont
                ? [cont.first_name, cont.last_name].filter(Boolean).join(" ") || null
                : null,
              phone: cont ? pickCampaignDialPhone(cont) : null,
              outcome: r.outcome,
              outcome_label: retellOutcomeLabel(r.outcome),
              called_at: r.called_at,
              duration_seconds: r.duration_seconds,
              open_requests_count: 0,
              open_requests: [] as OpenRequestChip[],
            };
          });
      }

      const rollup = await getCampaignRollup(crm.supabase, campaignId);
      stats = rollup.stats;
      progress = Math.round(rollup.progress * 10) / 10;
      callsMade = rollup.callsMade;
      contactTotal = rollup.withPhone;
      remaining = rollup.remaining;
      avgDurationSec = rollup.avgDurationSec;
      estimatedRemainingSec =
        avgDurationSec != null && remaining > 0
          ? Math.round((avgDurationSec * remaining) / Math.max(1, concurrent_lines))
          : remaining === 0
            ? 0
            : null;
      if (estimatedRemainingSec != null && estimatedRemainingSec > 0) {
        estimated_completion_at = new Date(Date.now() + estimatedRemainingSec * 1000).toISOString();
      } else if (estimatedRemainingSec === 0) {
        estimated_completion_at = new Date().toISOString();
      }

      const requestContactIds = [
        ...ongoingBase.map((o) => o.contact_id).filter((id): id is string => Boolean(id)),
        ...last_completed.map((lc) => lc.contact_id),
      ];
      const reqMap = await fetchOpenRequestsByContactIds(crm.supabase, requestContactIds);
      for (const o of ongoingBase) {
        if (!o.contact_id) continue;
        const bucket = reqMap.get(o.contact_id);
        if (!bucket) continue;
        o.open_requests_count = bucket.open_requests_count;
        o.open_requests = bucket.open_requests;
      }
      for (const lc of last_completed) {
        const bucket = reqMap.get(lc.contact_id);
        if (!bucket) continue;
        lc.open_requests_count = bucket.open_requests_count;
        lc.open_requests = bucket.open_requests;
      }
    }

    return NextResponse.json({
      agent_id: agentId,
      agent_name: agentInfo.agent_name,
      ongoing_count: ongoingBase.length,
      ongoing_calls: ongoingBase,
      last_completed,
      called_today,
      success_rate_today_pct,
      concurrent_lines: campaignId ? concurrent_lines : undefined,
      stats,
      progress,
      callsMade,
      contactTotal,
      remaining,
      avgDurationSec,
      estimatedRemainingSec,
      estimated_completion_at,
    });
  } catch (e) {
    console.error("[api/retell/active-calls GET]", e);
    return nextJsonError();
  }
}
