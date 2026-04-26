import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity-log";
import { mergeCallMetadata, getContactId } from "@/lib/retell-llm";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = 'force-dynamic';

type TranscriptEntry = { role: string; content?: string | null };

function getLastAgentFromCall(call: Record<string, unknown> | null | undefined): string {
  if (!call) return "";
  const obj = call as { transcript?: TranscriptEntry[]; transcript_object?: TranscriptEntry[] };
  const list = (obj.transcript_object as TranscriptEntry[] | undefined) || (obj.transcript as TranscriptEntry[] | undefined);
  if (Array.isArray(list)) {
    for (let i = list.length - 1; i >= 0; i--) {
      const r = list[i];
      if (r && String(r.role).toLowerCase() === "agent" && (r.content ?? "")) {
        return String(r.content);
      }
    }
  }
  if (typeof obj.transcript === "string" && (obj.transcript as string).length) {
    const t = (obj.transcript as string)
      .split("\n")
      .filter((l) => /^\s*agent[:\s]/i.test(l) || l.includes("Agent:"));
    if (t.length) return t[t.length - 1]!.replace(/^\s*agent[:\s]*/i, "").replace(/^Agent:\s*/i, "").trim();
  }
  return "";
}

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
 * call_successful, duration, disconnection, last agent line (συνδέω / ενοχλήσαμε / etc.)
 */
function resolveOutcome(
  call: Record<string, unknown> | null | undefined,
  durationSec: number,
  lastAgent: string,
) {
  if (Number.isFinite(durationSec) && durationSec >= 0 && durationSec < 10) {
    return { call_status: "No Answer" as const, outcome: "No Answer" as const, transferred: false, reason: "σύντομη/χωρίς απάντηση" };
  }
  const la = lastAgent;
  if (/συνδέ/iu.test(la) || /Ένα(?:ν)?\s*στιγμ|στιγμάκι/iu.test(la)) {
    return { call_status: "Positive" as const, outcome: "Positive" as const, transferred: true, reason: "μετάφορα" };
  }
  if (/Λυπάμαι/iu.test(la) && /ενοχλ/iu.test(la)) {
    return { call_status: "Negative" as const, outcome: "Negative" as const, transferred: false, reason: "αρνητική/ενόχληση" };
  }
  const dReason =
    (call as { disconnection_reason?: string }).disconnection_reason
    || (call as { disconnection?: string }).disconnection
    || "";
  if (dReason && /no_?answer|not_?connected|unanswered/iu.test(String(dReason))) {
    return { call_status: "No Answer" as const, outcome: "No Answer" as const, transferred: false, reason: "retell" };
  }
  return { call_status: "No Answer" as const, outcome: "No Answer" as const, transferred: false, reason: "προεπιλογή" };
}

export async function POST(request: NextRequest) {
  try {
  const signature = request.headers.get("x-retell-signature");
  if (!signature) {
    return NextResponse.json({ error: "Λείπει η κεφαλίδα x-retell-signature" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    call?: Record<string, unknown> | null;
    event?: string;
  };
  const call = (body.call ?? (body as unknown as Record<string, unknown> & { id?: string })) as Record<string, unknown> | null;
  if (!call || typeof call !== "object") {
    return NextResponse.json({ ok: true, skipped: "χωρίς call" });
  }

  const meta = mergeCallMetadata(
    call as {
      metadata?: Record<string, unknown> | null;
      retell_llm_dynamic_variables?: Record<string, string> | null;
    },
  ) as Record<string, string | undefined | null>;
  const cId = getContactId(meta);
  if (!cId) {
    return NextResponse.json(
      { ok: true, detail: "χωρίς contact_id — δεν αποθηκεύουμε" } satisfies { ok: boolean; detail: string },
    );
  }
  const contactIdFinal = cId;

  const durationMs = Number(
    (call as { duration_ms?: number; duration_milliseconds?: number }).duration_ms
      ?? (call as { duration_milliseconds?: number }).duration_milliseconds
      ?? 0,
  );
  const durationSec = Number.isFinite(durationMs) && durationMs > 0 ? Math.floor(durationMs / 1000) : 0;

  const lastAgent = getLastAgentFromCall(call);
  const { call_status, outcome, transferred, reason } = resolveOutcome(call, durationSec, lastAgent);
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
  const { error: insErr } = await admin.from("calls").insert({
    contact_id: contactIdFinal,
    campaign_id: campaignId,
    called_at: calledAt,
    duration_seconds: durationSec > 0 ? durationSec : null,
    outcome,
    transferred_to_politician: Boolean(transferred),
    notes,
  });
  if (insErr) {
    return NextResponse.json(
      { error: `Σφάλμα εγγραφής κλήσης: ${insErr.message}` } satisfies { error: string },
      { status: 500 },
    );
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
