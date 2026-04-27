import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { insertPendingCampaignCall } from "@/lib/campaign-pending-call";
import { executeRetellCreatePhoneCall } from "@/lib/retell-execute-outbound";
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  contact_id: z.string().uuid("Άκυρο contact_id"),
  campaign_id: z.string().uuid().optional().nullable(),
});

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!process.env.RETELL_API_KEY) {
    return NextResponse.json(
      { error: "Η Retell δεν έχει ρυθμιστεί (λείπει RETELL_API_KEY)" },
      { status: 503 },
    );
  }

  const crm = await checkCRMAccess();
  if (!crm.allowed) return crm.response;
  const { profile, supabase } = crm;
  if (!hasMinRole(profile?.role, "manager")) {
    return forbidden();
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().formErrors[0] ?? "Άκυρα δεδομένα" },
      { status: 400 },
    );
  }
  const { contact_id, campaign_id } = parsed.data;

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, phone, call_status")
    .eq("id", contact_id)
    .maybeSingle();

  if (contactError || !contact) {
    return NextResponse.json(
      { error: "Η επαφή δεν βρέθηκε" },
      { status: 404 },
    );
  }
  const row = contact as { id: string; first_name: string | null; last_name: string | null; phone: string | null };
  const retell = await executeRetellCreatePhoneCall(row, campaign_id ?? null);
  if (!retell.ok) {
    return NextResponse.json(
      { error: retell.error, ...(retell.detail != null ? { detail: retell.detail } : {}) },
      { status: retell.status },
    );
  }
  const payload = retell.retell;

  const { error: updError } = await supabase
    .from("contacts")
    .update({ call_status: "Pending" })
    .eq("id", contact_id);
  if (updError) {
    return NextResponse.json(
      { error: `Ενημέρωση επαφής απέτυχε: ${updError.message}` },
      { status: 500 },
    );
  }
  if (campaign_id) {
    const { error: pendErr } = await insertPendingCampaignCall(supabase, contact_id, campaign_id);
    if (pendErr) {
      return NextResponse.json(
        { error: `Καταγραφή κλήσης καμπάνιας: ${pendErr.message}` },
        { status: 500 },
      );
    }
  }
  return NextResponse.json({
    success: true,
    call_id: retell.call_id,
    retell: payload,
  });
}
