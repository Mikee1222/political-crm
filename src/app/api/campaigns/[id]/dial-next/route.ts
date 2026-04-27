import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { getNextUncalledContactIds } from "@/lib/campaign-dial-queue";
import { insertPendingCampaignCall } from "@/lib/campaign-pending-call";
import { executeRetellCreatePhoneCall } from "@/lib/retell-execute-outbound";
import { getRetellAgentIdForCampaign } from "@/lib/campaign-retell-agent";
import { clampConcurrentLines } from "@/lib/campaign-concurrent-lines";

export const dynamic = "force-dynamic";

const GAP_MS = 500;

type DialResult =
  | { contact_id: string; ok: true; call_id: string | null }
  | { contact_id: string; ok: false; error: string; detail?: unknown };

/**
 * Εκκινεί έως `concurrent_lines` παράλληλες Retell κλήσεις (500ms καθυστέρηση μεταξύ εκκινήσεων).
 */
export async function POST(_: Request, { params }: { params: { id: string } }) {
  const crm = await checkCRMAccess();
  if (!crm.allowed) return crm.response;
  const { profile, supabase } = crm;
  if (!hasMinRole(profile?.role, "manager")) {
    return forbidden();
  }

  if (!process.env.RETELL_API_KEY) {
    return NextResponse.json(
      { error: "Η Retell δεν έχει ρυθμιστεί (λείπει RETELL_API_KEY)" },
      { status: 503 },
    );
  }

  const campaignId = params.id;
  const { data: campDial, error: campDialErr } = await supabase
    .from("campaigns")
    .select("concurrent_lines")
    .eq("id", campaignId)
    .maybeSingle();
  if (campDialErr) {
    return NextResponse.json({ error: campDialErr.message }, { status: 400 });
  }
  if (!campDial) {
    return NextResponse.json({ error: "Καμπάνια δεν βρέθηκε" }, { status: 404 });
  }
  const batch = clampConcurrentLines((campDial as { concurrent_lines?: unknown }).concurrent_lines);

  const { contactIds, error: queueErr } = await getNextUncalledContactIds(supabase, campaignId, batch);
  if (queueErr) {
    return NextResponse.json({ error: queueErr }, { status: 400 });
  }
  if (contactIds.length === 0) {
    return NextResponse.json(
      { error: "Έχετε κληθεί όλες οι επαφές της καμπάνιας" },
      { status: 400 },
    );
  }

  const agentOverride = await getRetellAgentIdForCampaign(supabase, campaignId);
  if (!agentOverride) {
    return NextResponse.json(
      { error: "Λείπει Retell agent (τύπος καμπάνιας ή RETELL_AGENT_ID)" },
      { status: 503 },
    );
  }

  const dialOne = async (contactId: string): Promise<DialResult> => {
    const { data: contact, error: contactErr } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, phone")
      .eq("id", contactId)
      .single();
    if (contactErr || !contact) {
      return { contact_id: contactId, ok: false, error: "Η επαφή δεν βρέθηκε" };
    }
    const row = contact as {
      id: string;
      first_name: string | null;
      last_name: string | null;
      phone: string | null;
    };
    const retell = await executeRetellCreatePhoneCall(row, campaignId, agentOverride);
    if (!retell.ok) {
      return {
        contact_id: contactId,
        ok: false,
        error: retell.error,
        ...(retell.detail != null ? { detail: retell.detail } : {}),
      };
    }
    await supabase.from("contacts").update({ call_status: "Pending" }).eq("id", contactId);
    const { error: pendErr } = await insertPendingCampaignCall(supabase, contactId, campaignId);
    if (pendErr) {
      return { contact_id: contactId, ok: false, error: `Καταγραφή κλήσης: ${pendErr.message}` };
    }
    return { contact_id: contactId, ok: true, call_id: retell.call_id };
  };

  const tasks = contactIds.map(
    (cid, i) =>
      new Promise<DialResult>((resolve) => {
        setTimeout(() => {
          void dialOne(cid).then(resolve);
        }, i * GAP_MS);
      }),
  );
  const results = await Promise.all(tasks);

  const anyOk = results.some((r) => r.ok);
  if (!anyOk) {
    const first = results[0];
    return NextResponse.json(
      {
        error: first && !first.ok ? first.error : "Αποτυχία κλήσεων",
        results,
      },
      { status: 400 },
    );
  }

  const firstOk = results.find((r) => r.ok) as Extract<DialResult, { ok: true }> | undefined;
  return NextResponse.json({
    success: true,
    results,
    contact_id: firstOk?.contact_id,
    call_id: firstOk?.call_id ?? null,
  });
}
