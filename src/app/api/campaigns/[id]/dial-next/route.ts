import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { getNextUncalledContactIds } from "@/lib/campaign-dial-queue";
import {
  attachRetellCallIdToPending,
  insertPendingCampaignCall,
  markPendingCallFailed,
} from "@/lib/campaign-pending-call";
import { executeRetellCreatePhoneCall } from "@/lib/retell-execute-outbound";
import { getRetellAgentIdForCampaign } from "@/lib/campaign-retell-agent";
import { clampConcurrentLines } from "@/lib/campaign-concurrent-lines";
import { cleanExpiredPendingCalls } from "@/lib/pending-call-cleanup";
import { getRetellLiveCallCount } from "@/lib/retell-live-calls";

export const dynamic = "force-dynamic";

const GAP_MS = 500;

type DialResult =
  | { contact_id: string; ok: true; call_id: string | null }
  | { contact_id: string; ok: false; error: string; detail?: unknown };

/**
 * Εκκινεί έως `concurrent_lines` παράλληλες Retell κλήσεις (500ms καθυστέρηση μεταξύ εκκινήσεων).
 * Παραλείπει επαφές χωρίς αριθμό. `?redial_no_answer=1` για επανεκκίνηση «Δεν απάντησε».
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
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
  const redialNoAnswer =
    request.nextUrl.searchParams.get("redial_no_answer") === "1" ||
    request.nextUrl.searchParams.get("redial_no_answer") === "true";

  const { data: campDial, error: campDialErr } = await supabase
    .from("campaigns")
    .select("concurrent_lines, channel, status")
    .eq("id", campaignId)
    .maybeSingle();
  if (campDialErr) {
    return NextResponse.json({ error: campDialErr.message }, { status: 400 });
  }
  if (!campDial) {
    return NextResponse.json({ error: "Καμπάνια δεν βρέθηκε" }, { status: 404 });
  }

  const status = String((campDial as { status?: string | null }).status ?? "").trim();
  if (status !== "active") {
    return NextResponse.json(
      { error: "Η καμπάνια πρέπει να είναι ενεργή για κλήσεις" },
      { status: 400 },
    );
  }

  const channel = String((campDial as { channel?: string | null }).channel ?? "call").trim() || "call";
  if (channel !== "call") {
    return NextResponse.json(
      { error: "Η καμπάνια δεν είναι καναλιού κλήσης — οι κλήσεις Retell δεν ισχύουν" },
      { status: 400 },
    );
  }

  try {
    await cleanExpiredPendingCalls(supabase, { campaignId });
  } catch (e) {
    console.warn(
      "[api/campaigns/dial-next] cleanExpiredPendingCalls:",
      e instanceof Error ? e.message : e,
    );
  }

  const concurrentLines = clampConcurrentLines((campDial as { concurrent_lines?: unknown }).concurrent_lines);

  const agentOverride = await getRetellAgentIdForCampaign(supabase, campaignId);
  if (!agentOverride) {
    return NextResponse.json(
      { error: "Λείπει Retell agent (τύπος καμπάνιας ή RETELL_AGENT_ID)" },
      { status: 503 },
    );
  }

  const { count: liveCount, error: liveErr } = await getRetellLiveCallCount({
    agentId: agentOverride,
    campaignId,
  });
  if (liveErr) {
    console.warn("[api/campaigns/dial-next] live count:", liveErr);
  }

  const batch = Math.max(0, concurrentLines - liveCount);
  if (batch === 0) {
    return NextResponse.json({ message: "All lines busy", dialed: 0 });
  }

  const { contactIds, error: queueErr } = await getNextUncalledContactIds(
    supabase,
    campaignId,
    batch,
    { redialNoAnswer },
  );
  if (queueErr) {
    return NextResponse.json({ error: queueErr }, { status: 400 });
  }
  if (contactIds.length === 0) {
    return NextResponse.json(
      {
        error: redialNoAnswer
          ? "Δεν υπάρχουν επαφές «Δεν απάντησε» για επανεκκίνηση"
          : "Έχετε κληθεί όλες οι επαφές της καμπάνιας",
      },
      { status: 400 },
    );
  }

  const dialOne = async (contactId: string): Promise<DialResult> => {
    const { data: contact, error: contactErr } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, phone, phone2, landline")
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
      phone2: string | null;
      landline: string | null;
    };

    // 1) Insert Pending before Retell so the queue / webhook can track the attempt.
    const pending = await insertPendingCampaignCall(supabase, contactId, campaignId);
    if (pending.error || !pending.id) {
      return {
        contact_id: contactId,
        ok: false,
        error: `Καταγραφή κλήσης: ${pending.error?.message ?? "άγνωστο"}`,
      };
    }
    const pendingId = pending.id;

    await supabase.from("contacts").update({ call_status: "Pending" }).eq("id", contactId);

    // 2) Call Retell
    const retell = await executeRetellCreatePhoneCall(row, campaignId, agentOverride);
    if (!retell.ok) {
      // 4) Don't leave stuck Pending
      await markPendingCallFailed(supabase, pendingId);
      return {
        contact_id: contactId,
        ok: false,
        error: retell.error,
        ...(retell.detail != null ? { detail: retell.detail } : {}),
      };
    }

    // 3) Attach retell_call_id to Pending row
    if (retell.call_id) {
      const { error: attachErr } = await attachRetellCallIdToPending(
        supabase,
        pendingId,
        retell.call_id,
      );
      if (attachErr) {
        console.warn("[api/campaigns/dial-next] attach retell_call_id:", attachErr.message);
      }
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
    dialed: results.filter((r) => r.ok).length,
    contact_id: firstOk?.contact_id,
    call_id: firstOk?.call_id ?? null,
    redial_no_answer: redialNoAnswer,
  });
}
