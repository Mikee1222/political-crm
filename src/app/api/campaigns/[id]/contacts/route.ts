import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    if (!hasMinRole(crm.profile?.role, "manager")) {
      return forbidden();
    }
    const campaignId = params.id;
    const body = (await request.json().catch(() => ({}))) as { contact_id?: string };
    const contact_id = String(body.contact_id ?? "").trim();
    if (!contact_id) {
      return NextResponse.json({ error: "Άκυρο contact_id" }, { status: 400 });
    }

    const { data: camp, error: campErr } = await crm.supabase
      .from("campaigns")
      .select("id")
      .eq("id", campaignId)
      .maybeSingle();
    if (campErr || !camp) {
      return NextResponse.json({ error: "Καμπάνια δεν βρέθηκε" }, { status: 404 });
    }

    const { data: contact, error: conErr } = await crm.supabase
      .from("contacts")
      .select("id")
      .eq("id", contact_id)
      .maybeSingle();
    if (conErr || !contact) {
      return NextResponse.json({ error: "Η επαφή δεν βρέθηκε" }, { status: 404 });
    }

    const { error: insErr } = await crm.supabase.from("campaign_contacts").insert({
      campaign_id: campaignId,
      contact_id,
    });
    if (insErr) {
      if (insErr.code === "23505") {
        return NextResponse.json({ error: "Η επαφή είναι ήδη στην καμπάνια" }, { status: 409 });
      }
      return NextResponse.json({ error: insErr.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/campaigns/id/contacts POST]", e);
    return nextJsonError();
  }
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    if (!hasMinRole(crm.profile?.role, "manager")) {
      return forbidden();
    }
    const campaignId = params.id;
    const contact_id = request.nextUrl.searchParams.get("contact_id")?.trim() ?? "";
    if (!contact_id) {
      return NextResponse.json({ error: "Άκυρο contact_id" }, { status: 400 });
    }
    const { error } = await crm.supabase
      .from("campaign_contacts")
      .delete()
      .eq("campaign_id", campaignId)
      .eq("contact_id", contact_id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/campaigns/id/contacts DELETE]", e);
    return nextJsonError();
  }
}
