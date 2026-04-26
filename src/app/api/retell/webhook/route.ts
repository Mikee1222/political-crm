import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export async function POST(request: NextRequest) {
  const signature = request.headers.get("x-retell-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature header" }, { status: 400 });

  const supabase = await createClient();
  const body = await request.json();

  const contactId = body?.call?.retell_llm_dynamic_variables?.contact_id;
  const outcome = body?.call?.call_analysis?.call_successful
    ? "Positive"
    : body?.call?.disconnection_reason === "no-answer"
      ? "No Answer"
      : "Negative";

  if (!contactId) return NextResponse.json({ ok: true });

  const { data: contactRow } = await supabase
    .from("contacts")
    .select("first_name, last_name")
    .eq("id", contactId)
    .maybeSingle();
  const contactLabel =
    contactRow && typeof contactRow === "object" && "first_name" in contactRow
      ? `${String((contactRow as { first_name: string }).first_name)} ${String((contactRow as { last_name: string }).last_name)}`.trim()
      : "Επαφή";

  await supabase
    .from("contacts")
    .update({ call_status: outcome, last_contacted_at: new Date().toISOString() })
    .eq("id", contactId);

  await supabase.from("calls").insert({
    contact_id: contactId,
    campaign_id: body?.call?.metadata?.campaign_id ?? null,
    called_at: body?.call?.end_timestamp ? new Date(body.call.end_timestamp).toISOString() : new Date().toISOString(),
    duration_seconds: body?.call?.duration_ms ? Math.floor(Number(body.call.duration_ms) / 1000) : null,
    outcome,
    transferred_to_politician: Boolean(body?.call?.transferred),
    notes: body?.call?.call_analysis?.call_summary ?? null,
  });

  await logActivity({
    userId: null,
    action: "call_made",
    entityType: "contact",
    entityId: contactId,
    entityName: contactLabel,
    details: { source: "retell_webhook", outcome },
  });

  return NextResponse.json({ ok: true });
}
