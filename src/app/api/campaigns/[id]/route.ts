import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { getCampaignRollup } from "@/lib/campaign-stats";
import { nextJsonError } from "@/lib/api-resilience";
import { clampConcurrentLines } from "@/lib/campaign-concurrent-lines";
export const dynamic = 'force-dynamic';

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
      "id, name, created_at, started_at, description, status, channel, campaign_type_id, retell_agent_id, concurrent_lines, campaign_types ( id, name, color, retell_agent_id )",
    )
    .eq("id", params.id)
    .single();
  if (campErr || !camp) {
    return NextResponse.json({ error: "Καμπάνια δεν βρέθηκε" }, { status: 404 });
  }

  const { data: assignedRows, error: assErr } = await supabase
    .from("campaign_contacts")
    .select("contact_id, added_at, contacts ( id, first_name, last_name, phone )")
    .eq("campaign_id", params.id)
    .order("added_at", { ascending: true });
  if (assErr) {
    return NextResponse.json({ error: assErr.message }, { status: 400 });
  }
  const assigned_contacts = (assignedRows ?? []).map((row: unknown) => {
    const r = row as {
      contact_id: string;
      added_at: string;
      contacts: { id: string; first_name: string; last_name: string; phone: string } | null;
    };
    const c = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts;
    return {
      contact_id: r.contact_id,
      added_at: r.added_at,
      contact: c ?? null,
    };
  });

  const rollup = await getCampaignRollup(supabase, params.id);
  const outcome = request.nextUrl.searchParams.get("outcome");
  let query = supabase
    .from("calls")
    .select("id, called_at, outcome, duration_seconds, transferred_to_politician, contact_id, contacts(phone, first_name, last_name)")
    .eq("campaign_id", params.id)
    .order("called_at", { ascending: false });
  if (outcome) query = query.eq("outcome", outcome);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const calls = (data ?? []).map((row) => {
    const cont = (row as { contacts: unknown }).contacts;
    const contact = Array.isArray(cont) ? cont[0] : cont;
    return { ...(row as object), contacts: contact ?? null };
  });
  const campRow = { ...(camp as Record<string, unknown>) };
  const nestedType = campRow.campaign_types;
  const typeFlat = Array.isArray(nestedType) ? nestedType[0] : nestedType;
  delete campRow.campaign_types;

  return NextResponse.json({
    campaign: {
      ...(campRow as object),
      status: (camp as { status?: string }).status ?? "active",
      campaign_type: typeFlat ?? null,
    },
    stats: rollup.stats,
    progress: Math.round(rollup.progress * 10) / 10,
    callsMade: rollup.callsMade,
    contactTotal: rollup.assignedCount,
    assigned_contacts,
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
  if (body.description !== undefined) patch.description = body.description;
  if (body.concurrent_lines !== undefined) {
    patch.concurrent_lines = clampConcurrentLines(body.concurrent_lines);
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Άκυρα δεδομένα" }, { status: 400 });
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
