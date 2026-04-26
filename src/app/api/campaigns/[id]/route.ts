import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { getCampaignRollup } from "@/lib/campaign-stats";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
  const { user, profile, supabase } = await getSessionWithProfile();
  if (!user) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  }
  if (!hasMinRole(profile?.role, "manager")) {
    return forbidden();
  }

  const { data: camp, error: campErr } = await supabase
    .from("campaigns")
    .select("id, name, created_at, started_at, description, status")
    .eq("id", params.id)
    .single();
  if (campErr || !camp) {
    return NextResponse.json({ error: "Καμπάνια δεν βρέθηκε" }, { status: 404 });
  }
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
  return NextResponse.json({
    campaign: { ...camp, status: (camp as { status?: string }).status ?? "active" },
    stats: rollup.stats,
    progress: Math.round(rollup.progress * 10) / 10,
    callsMade: rollup.callsMade,
    contactTotal: rollup.assignedCount,
    calls,
  });
  } catch (e) {
    console.error("[api/campaigns/id GET]", e);
    return nextJsonError();
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
  const { user, profile, supabase } = await getSessionWithProfile();
  if (!user) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  }
  if (!hasMinRole(profile?.role, "manager")) {
    return forbidden();
  }
  const body = (await request.json().catch(() => ({}))) as { status?: string; name?: string; description?: string | null };
  const patch: Record<string, string | null> = {};
  if (body.status === "active" || body.status === "completed") {
    patch.status = body.status;
  }
  if (body.name != null) patch.name = String(body.name).trim();
  if (body.description !== undefined) patch.description = body.description;
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
  const { user, profile, supabase } = await getSessionWithProfile();
  if (!user) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  }
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
