import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { getCampaignRollup } from "@/lib/campaign-stats";
import { nextJsonError } from "@/lib/api-resilience";
import { clampConcurrentLines } from "@/lib/campaign-concurrent-lines";
import { contactHasAnyCampaignPhone, campaignPhoneLabels } from "@/lib/campaign-contact-phone";
import { resolveCampaignContactStatus } from "@/lib/campaign-contact-status";
import {
  getRetellAgentInfoForCampaign,
  resolveRetellAgentName,
} from "@/lib/campaign-retell-agent";
import { fetchRowsInBatches } from "@/lib/supabase-batch";

export const dynamic = "force-dynamic";

const PAGE_SIZE_DEFAULT = 50;

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }

    const { data: camp, error: campErr } = await supabase
      .from("campaigns")
      .select(
        "id, name, created_at, started_at, description, status, channel, campaign_type_id, retell_agent_id, concurrent_lines, last_no_answer_redial_at, filters, campaign_types ( id, name, color, retell_agent_id )",
      )
      .eq("id", params.id)
      .single();
    if (campErr || !camp) {
      return NextResponse.json({ error: "Καμπάνια δεν βρέθηκε" }, { status: 404 });
    }

    const sp = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
    const pageSizeRaw = parseInt(sp.get("page_size") ?? String(PAGE_SIZE_DEFAULT), 10);
    const pageSize = Math.min(100, Math.max(1, Number.isFinite(pageSizeRaw) ? pageSizeRaw : PAGE_SIZE_DEFAULT));

    type ContactShape = {
      id: string;
      first_name: string;
      last_name: string;
      phone: string | null;
      phone2: string | null;
      landline: string | null;
    };

    type AssignedRowRaw = {
      contact_id: string;
      added_at: string;
      contacts: ContactShape | ContactShape[] | null;
    };

    const { rows: assignedRows, error: assErr } = await fetchRowsInBatches<AssignedRowRaw>(
      (from, to) =>
        supabase
          .from("campaign_contacts")
          .select(
            "contact_id, added_at, contacts ( id, first_name, last_name, phone, phone2, landline )",
          )
          .eq("campaign_id", params.id)
          .order("added_at", { ascending: true })
          .order("contact_id", { ascending: true })
          .range(from, to),
    );
    if (assErr) {
      return NextResponse.json({ error: assErr }, { status: 400 });
    }

    const allAssigned = assignedRows.map((r) => {
      const c = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts;
      return {
        contact_id: r.contact_id,
        added_at: r.added_at,
        contact: c ?? null,
      };
    });

    // Hide no-phone from the dialable table
    const withPhoneAssigned = allAssigned.filter((row) =>
      contactHasAnyCampaignPhone(row.contact),
    );

    const { rows: allCallMeta, error: callMetaErr } = await fetchRowsInBatches<{
      contact_id: string | null;
      outcome: string | null;
    }>((from, to) =>
      supabase
        .from("calls")
        .select("contact_id, outcome")
        .eq("campaign_id", params.id)
        .order("id", { ascending: true })
        .range(from, to),
    );
    if (callMetaErr) {
      return NextResponse.json({ error: callMetaErr }, { status: 400 });
    }

    const outcomesByContact = new Map<string, string[]>();
    const callCountByContact = new Map<string, number>();
    for (const r of allCallMeta) {
      if (!r.contact_id) continue;
      callCountByContact.set(r.contact_id, (callCountByContact.get(r.contact_id) ?? 0) + 1);
      const list = outcomesByContact.get(r.contact_id) ?? [];
      list.push(r.outcome ?? "");
      outcomesByContact.set(r.contact_id, list);
    }

    const assignedTotal = withPhoneAssigned.length;
    const pageCount = Math.max(1, Math.ceil(assignedTotal / pageSize));
    const safePage = Math.min(page, pageCount);
    const sliceStart = (safePage - 1) * pageSize;
    const pageRows = withPhoneAssigned.slice(sliceStart, sliceStart + pageSize);

    const assigned_contacts = pageRows.map((row) => {
      const phones = campaignPhoneLabels(row.contact);
      const outcomes = outcomesByContact.get(row.contact_id) ?? [];
      const status = resolveCampaignContactStatus(outcomes);
      return {
        contact_id: row.contact_id,
        added_at: row.added_at,
        contact: row.contact
          ? {
              id: row.contact.id,
              first_name: row.contact.first_name,
              last_name: row.contact.last_name,
              phone: phones.phone,
              phone2: phones.phone2,
              landline: phones.landline,
            }
          : null,
        call_count: callCountByContact.get(row.contact_id) ?? 0,
        campaign_status: status,
      };
    });

    const rollup = await getCampaignRollup(supabase, params.id);
    const outcome = sp.get("outcome");

    type CallLogRow = {
      id: string;
      called_at: string | null;
      outcome: string | null;
      duration_seconds: number | null;
      transferred_to_politician: boolean | null;
      notes: string | null;
      contact_id: string;
      contacts: unknown;
    };

    const { rows: callLogRows, error: callLogErr } = await fetchRowsInBatches<CallLogRow>(
      (from, to) => {
        let q = supabase
          .from("calls")
          .select(
            "id, called_at, outcome, duration_seconds, transferred_to_politician, notes, contact_id, contacts(phone, phone2, landline, first_name, last_name)",
          )
          .eq("campaign_id", params.id)
          .order("called_at", { ascending: false })
          .order("id", { ascending: false });
        if (outcome) q = q.eq("outcome", outcome);
        return q.range(from, to);
      },
    );
    if (callLogErr) return NextResponse.json({ error: callLogErr }, { status: 400 });

    const calls = callLogRows.map((row) => {
      const cont = row.contacts;
      const contact = Array.isArray(cont) ? cont[0] : cont;
      return {
        ...row,
        contacts: contact ?? null,
        transcript: row.notes,
      };
    });

    const campRow = { ...(camp as Record<string, unknown>) };
    const nestedType = campRow.campaign_types;
    const typeFlat = Array.isArray(nestedType) ? nestedType[0] : nestedType;
    delete campRow.campaign_types;

    const agentInfo = await getRetellAgentInfoForCampaign(supabase, params.id);
    // Prefer catalog name even when campaign stores only id
    const storedAgent = String((camp as { retell_agent_id?: string | null }).retell_agent_id ?? "").trim();
    const agentResolved = storedAgent
      ? await resolveRetellAgentName(supabase, storedAgent)
      : agentInfo;

    const concurrent = clampConcurrentLines(
      (camp as { concurrent_lines?: unknown }).concurrent_lines,
    );
    const remaining = rollup.remaining;
    const avg = rollup.avgDurationSec;
    const estimatedRemainingSec =
      avg != null && remaining > 0 ? Math.round((avg * remaining) / concurrent) : remaining === 0 ? 0 : null;

    return NextResponse.json({
      campaign: {
        ...(campRow as object),
        status: (camp as { status?: string }).status ?? "active",
        campaign_type: typeFlat ?? null,
        retell_agent_name: agentResolved.agent_name,
        retell_agent_id_resolved: agentResolved.agent_id,
        last_no_answer_redial_at:
          (camp as { last_no_answer_redial_at?: string | null }).last_no_answer_redial_at ?? null,
      },
      stats: rollup.stats,
      progress: Math.round(rollup.progress * 10) / 10,
      callsMade: rollup.callsMade,
      contactTotal: rollup.withPhone,
      withPhone: rollup.withPhone,
      withoutPhone: rollup.withoutPhone,
      assignedTotalAll: rollup.assignedCount,
      remaining,
      avgDurationSec: avg,
      estimatedRemainingSec,
      assigned_contacts,
      assigned_pagination: {
        page: safePage,
        page_size: pageSize,
        total: assignedTotal,
        page_count: pageCount,
      },
      calls,
    });
  } catch (e) {
    console.error("[api/campaigns/id GET]", e);
    return nextJsonError();
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const body = (await request.json().catch(() => ({}))) as {
      status?: string;
      name?: string;
      description?: string | null;
      concurrent_lines?: number;
    };
    const patch: Record<string, string | number | null> = {};
    if (body.status === "active" || body.status === "completed") {
      patch.status = body.status;
    }
    if (body.name != null) patch.name = String(body.name).trim();
    if (body.description !== undefined) {
      patch.description =
        body.description == null || body.description === ""
          ? null
          : String(body.description);
    }
    if (body.concurrent_lines !== undefined) {
      patch.concurrent_lines = clampConcurrentLines(body.concurrent_lines);
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Άκυρα δεδομένα" }, { status: 400 });
    }
    if (patch.name != null && !String(patch.name).trim()) {
      return NextResponse.json({ error: "Υποχρεωτικό όνομα" }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("campaigns")
      .update(patch)
      .eq("id", params.id)
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ campaign: data });
  } catch (e) {
    console.error("[api/campaigns/id PATCH]", e);
    return nextJsonError();
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const { error } = await supabase.from("campaigns").delete().eq("id", params.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/campaigns/id DELETE]", e);
    return nextJsonError();
  }
}
