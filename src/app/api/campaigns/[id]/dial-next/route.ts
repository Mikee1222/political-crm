import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { getNextUncalledContactId } from "@/lib/campaign-dial-queue";
import { insertPendingCampaignCall } from "@/lib/campaign-pending-call";
import { executeRetellCreatePhoneCall } from "@/lib/retell-execute-outbound";

export const dynamic = "force-dynamic";

/**
 * Dials the next contact in the campaign (first assigned with no call row in this campaign).
 * Same behavior as GET next-uncalled + POST /api/retell/call (kept for backward compatibility).
 */
export async function POST(_: Request, { params }: { params: { id: string } }) {
  const crm = await checkCRMAccess();
  if (!crm.allowed) return crm.response;
  const { profile, supabase } = crm;
  if (!hasMinRole(profile?.role, "manager")) {
    return forbidden();
  }

  const campaignId = params.id;
  const { contactId: nextId, error: queueErr } = await getNextUncalledContactId(supabase, campaignId);
  if (queueErr) {
    return NextResponse.json({ error: queueErr }, { status: 400 });
  }
  if (!nextId) {
    return NextResponse.json(
      { error: "Έχετε κληθεί όλες οι επαφές της καμπάνιας" },
      { status: 400 },
    );
  }

  const { data: contact, error: contactErr } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, phone")
    .eq("id", nextId)
    .single();
  if (contactErr || !contact) {
    return NextResponse.json({ error: "Η επαφή δεν βρέθηκε" }, { status: 404 });
  }

  const retell = await executeRetellCreatePhoneCall(
    contact as { id: string; first_name: string | null; last_name: string | null; phone: string | null },
    campaignId,
  );
  if (!retell.ok) {
    return NextResponse.json(
      { error: retell.error, ...(retell.detail != null ? { detail: retell.detail } : {}) },
      { status: retell.status },
    );
  }

  await supabase.from("contacts").update({ call_status: "Pending" }).eq("id", nextId);

  const { error: pendErr } = await insertPendingCampaignCall(supabase, nextId, campaignId);
  if (pendErr) {
    return NextResponse.json(
      { error: `Καταγραφή κλήσης: ${pendErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    contact_id: nextId,
    call_id: retell.call_id,
    retell: retell.retell,
  });
}
