import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { logActivity } from "@/lib/activity-log";
import { firstNameFromFull } from "@/lib/activity-descriptions";
import { getCampaignRollup } from "@/lib/campaign-stats";
import { listContactIdsMatching, type ContactFilter } from "@/lib/contacts-filter-query";
import { nextJsonError } from "@/lib/api-resilience";

export async function GET() {
  try {
  const { user, profile, supabase } = await getSessionWithProfile();
  if (!user) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  }
  if (!hasMinRole(profile?.role, "manager")) {
    return forbidden();
  }

  const { data: campaignRows, error } = await supabase
    .from("campaigns")
    .select("id, name, started_at, created_at, description, status")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const campaigns = (campaignRows ?? []) as Array<{
    id: string;
    name: string;
    started_at: string | null;
    created_at: string | null;
    description: string | null;
    status: string | null;
  }>;

  const withStats = await Promise.all(
    campaigns.map(async (campaign) => {
      const rollup = await getCampaignRollup(supabase, campaign.id);
      return {
        ...campaign,
        status: campaign.status ?? "active",
        description: campaign.description,
        stats: rollup.stats,
        progress: Math.round(rollup.progress * 10) / 10,
        callsMade: rollup.callsMade,
        contactTotal: rollup.assignedCount,
      };
    }),
  );

  return NextResponse.json({ campaigns: withStats });
  } catch (e) {
    console.error("[api/campaigns GET]", e);
    return nextJsonError();
  }
}

export async function POST(request: NextRequest) {
  try {
  const { user, profile, supabase } = await getSessionWithProfile();
  if (!user) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  }
  if (!hasMinRole(profile?.role, "manager")) {
    return forbidden();
  }

  const body = (await request.json()) as {
    name?: string;
    description?: string;
    filter?: ContactFilter;
  };
  const name = String(body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Υποχρεωτικό όνομα" }, { status: 400 });
  }

  const f: ContactFilter = {
    call_status: body.filter?.call_status,
    area: body.filter?.area,
    municipality: body.filter?.municipality,
    priority: body.filter?.priority,
    tag: body.filter?.tag,
  };
  const hasFilter = Boolean(
    f.call_status || f.area || f.municipality || f.priority || f.tag,
  );
  if (!hasFilter) {
    return NextResponse.json(
      { error: "Επιλέξτε τουλάχιστον ένα κριτήριο φίλτρου για τις επαφές" },
      { status: 400 },
    );
  }

  const { ids: contactIds, error: idErr } = await listContactIdsMatching(supabase, f);
  if (idErr) return NextResponse.json({ error: idErr }, { status: 400 });
  if (contactIds.length === 0) {
    return NextResponse.json(
      { error: "Καμία επαφή δεν ταιριάζει με το φίλτρο" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("campaigns")
    .insert({
      name,
      description: body.description ? String(body.description) : null,
      started_at: new Date().toISOString(),
      status: "active",
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
  return NextResponse.json({ campaign: data, assigned_contacts: contactIds.length });
  } catch (e) {
    console.error("[api/campaigns POST]", e);
    return nextJsonError();
  }
}
