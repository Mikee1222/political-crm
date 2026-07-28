import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity-log";
import { mergeCallMetadata, getContactId } from "@/lib/retell-llm";
import { resolveRetellCallOutcome } from "@/lib/retell-call-outcomes";
import { nextJsonError } from "@/lib/api-resilience";
import { verifyRetellWebhookSignature } from "@/lib/retell-webhook-verify";

export const dynamic = "force-dynamic";

type TranscriptEntry = { role: string; content?: string | null };

function transcriptSummary(call: Record<string, unknown> | null | undefined): string | null {
  if (!call) return null;
  type T = { transcript?: TranscriptEntry[] | string; transcript_object?: TranscriptEntry[] };
  const a = call as T;
  if (Array.isArray(a.transcript)) {
    return a.transcript
      .map((x) => `${x.role}: ${x.content ?? ""}`)
      .join("\n")
      .slice(0, 8000);
  }
  if (Array.isArray(a.transcript_object)) {
    return a.transcript_object
      .map((x) => `${x.role}: ${x.content ?? ""}`)
      .join("\n")
      .slice(0, 8000);
  }
  if (typeof a.transcript === "string") {
    return (a.transcript as string).slice(0, 8000);
  }
  return null;
}

/**
 * HMAC secret for x-retell-signature.
 * Retell signs with the API key that has the webhook badge — set the same value as RETELL_WEBHOOK_SECRET
 * (or leave secret unset in local/dev to skip verification).
 */
function retellWebhookSigningSecret(): string | undefined {
  return process.env.RETELL_WEBHOOK_SECRET?.trim() || process.env.RETELL_API_KEY?.trim() || undefined;
}

function assertRetellWebhookAuth(rawBody: string, request: NextRequest): NextResponse | null {
  const secret = retellWebhookSigningSecret();
  const isProd = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";

  if (!secret) {
    if (isProd) {
      console.error("[api/retell/webhook] RETELL_WEBHOOK_SECRET (or RETELL_API_KEY) missing — rejecting in production");
      return NextResponse.json({ error: "Webhook verification not configured" }, { status: 401 });
    }
    // Local/dev: allow without secret so sandbox testing still works.
    return null;
  }

  const signature = request.headers.get("x-retell-signature");
  if (!verifyRetellWebhookSignature(rawBody, secret, signature)) {
    return NextResponse.json({ error: "Μη έγκυρη υπογραφή webhook" }, { status: 401 });
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
  const rawBody = await request.text();
  const authErr = assertRetellWebhookAuth(rawBody, request);
  if (authErr) return authErr;

  let body: { call?: Record<string, unknown> | null; event?: string };
  try {
    body = JSON.parse(rawBody) as { call?: Record<string, unknown> | null; event?: string };
  } catch {
    return NextResponse.json({ error: "Άκυρο JSON" }, { status: 400 });
  }
  const ev = body.event;
  if (ev === "call_started") {
    return NextResponse.json({ ok: true });
  }
  if (ev && ev !== "call_ended") {
    return NextResponse.json({ ok: true });
  }
  const call = (body.call ?? (body as unknown as Record<string, unknown> & { id?: string })) as Record<string, unknown> | null;
  if (!call || typeof call !== "object") {
    return NextResponse.json({ ok: true });
  }

  const meta = mergeCallMetadata(
    call as {
      metadata?: Record<string, unknown> | null;
      retell_llm_dynamic_variables?: Record<string, string> | null;
    },
  ) as Record<string, string | undefined | null>;
  const cId = getContactId(meta);
  if (!cId) {
    return NextResponse.json({ ok: true });
  }
  const contactIdFinal = cId;

  const durationMs = Number(
    (call as { duration_ms?: number; duration_milliseconds?: number }).duration_ms
      ?? (call as { duration_milliseconds?: number }).duration_milliseconds
      ?? 0,
  );
  const durationSec = Number.isFinite(durationMs) && durationMs > 0 ? Math.floor(durationMs / 1000) : 0;

  const { call_status, outcome, transferred, reason } = resolveRetellCallOutcome(call, durationSec);
  const s1 = transcriptSummary(call);
  const s2 = (call as { call_analysis?: { call_summary?: string | null } })?.call_analysis?.call_summary ?? null;
  const rawNotes = s1 ?? s2;
  const notes: string | null = rawNotes ? String(rawNotes).slice(0, 5000) : null;

  const admin = createServiceClient();
  const { data: contactRow, error: fetchErr } = await admin
    .from("contacts")
    .select("id, first_name, last_name")
    .eq("id", contactIdFinal)
    .maybeSingle();
  if (fetchErr || !contactRow) {
    return NextResponse.json(
      { error: "Η επαφή δεν βρέθηκε" + (fetchErr ? `: ${fetchErr.message}` : "") },
      { status: 404 },
    );
  }
  const contactLabel =
    `${(contactRow as { first_name?: string; last_name?: string }).first_name ?? ""} ${
      (contactRow as { first_name?: string; last_name?: string }).last_name ?? ""
    }`.trim() || "Επαφή";
  const campaignIdRaw = meta.campaign_id ?? (call as { metadata?: { campaign_id?: string } }).metadata?.campaign_id;
  const campaignId =
    typeof campaignIdRaw === "string" && campaignIdRaw.length
      ? campaignIdRaw
      : null;
  const calledAt = (() => {
    const ts = (call as { end_timestamp?: number; end_time?: string }).end_timestamp
      || (call as { start_timestamp?: number }).start_timestamp
      || Date.now();
    if (typeof ts === "number") return new Date(ts).toISOString();
    return new Date().toISOString();
  })();
  const { error: uErr } = await admin
    .from("contacts")
    .update({ call_status, last_contacted_at: new Date().toISOString() })
    .eq("id", contactIdFinal);
  if (uErr) {
    return NextResponse.json(
      { error: `Σφάλμα ενημέρωσης επαφής: ${uErr.message}` } satisfies { error: string },
      { status: 500 },
    );
  }
  const payload = {
    called_at: calledAt,
    duration_seconds: durationSec > 0 ? durationSec : null,
    outcome,
    transferred_to_politician: Boolean(transferred),
    notes,
  } as const;

  let updatedPending = false;
  if (campaignId) {
    const { data: pend } = await admin
      .from("calls")
      .select("id")
      .eq("contact_id", contactIdFinal)
      .eq("campaign_id", campaignId)
      .eq("outcome", "Pending")
      .order("called_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const pendId = (pend as { id?: string } | null)?.id;
    if (pendId) {
      const { error: upErr } = await admin.from("calls").update(payload).eq("id", pendId);
      if (upErr) {
        return NextResponse.json(
          { error: `Σφάλμα ενημέρωσης κλήσης: ${upErr.message}` } satisfies { error: string },
          { status: 500 },
        );
      }
      updatedPending = true;
    }
  }
  if (!updatedPending) {
    const { error: insErr } = await admin.from("calls").insert({
      contact_id: contactIdFinal,
      campaign_id: campaignId,
      called_at: payload.called_at,
      duration_seconds: payload.duration_seconds,
      outcome: payload.outcome,
      transferred_to_politician: payload.transferred_to_politician,
      notes: payload.notes,
    });
    if (insErr) {
      return NextResponse.json(
        { error: `Σφάλμα εγγραφής κλήσης: ${insErr.message}` } satisfies { error: string },
        { status: 500 },
      );
    }
  }
  await logActivity({
    userId: null,
    action: "call_made",
    entityType: "contact",
    entityId: contactIdFinal,
    entityName: contactLabel,
    details: {
      source: "retell_webhook",
      outcome,
      transferred: Boolean(transferred),
      duration_seconds: durationSec,
      reason,
    },
  });
  return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/retell/webhook]", e);
    return nextJsonError();
  }
}
