import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { createServiceClient } from "@/lib/supabase/admin";
import { nextJsonError } from "@/lib/api-resilience";
import { sendWhatsAppMessage, isWhatsAppConfigured } from "@/lib/whatsapp";
export const dynamic = 'force-dynamic';
const schema = z.object({
  contact_ids: z.array(z.string()).min(1),
  action: z.enum(["update_status", "add_to_campaign", "delete", "send_whatsapp"]),
  value: z.string().optional(),
});

const STATUSES = new Set(["Pending", "Positive", "Negative", "No Answer"]);

export async function POST(request: NextRequest) {
  try {
  const crm = await checkCRMAccess();
  if (!crm.allowed) return crm.response;
  const { profile, supabase } = crm;
  if (!hasMinRole(profile?.role, "manager")) {
    return forbidden();
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Άκυρα δεδομένα" }, { status: 400 });
  }
  const { contact_ids, action, value } = parsed.data;

  if (action === "update_status") {
    if (!value || !STATUSES.has(value)) {
      return NextResponse.json({ error: "Άκυρη κατάσταση" }, { status: 400 });
    }
    const { error } = await supabase.from("contacts").update({ call_status: value }).in("id", contact_ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, updated: contact_ids.length });
  }

  if (action === "add_to_campaign") {
    if (!value) return NextResponse.json({ error: "Άκυρη καμπάνια" }, { status: 400 });
    const { data: camp, error: e1 } = await supabase.from("campaigns").select("id, name").eq("id", value).maybeSingle();
    if (e1 || !camp) return NextResponse.json({ error: "Η καμπάνια δεν βρέθηκε" }, { status: 400 });
    const rows = contact_ids.map((contact_id) => ({ campaign_id: value, contact_id }));
    const { error: e2 } = await supabase.from("campaign_contacts").upsert(rows, { onConflict: "campaign_id,contact_id" });
    if (e2) return NextResponse.json({ error: e2.message }, { status: 400 });
    return NextResponse.json({ ok: true, added: contact_ids.length, campaign: camp.name });
  }

  if (action === "delete") {
    if (profile?.role !== "admin") return forbidden();
    const admin = createServiceClient();
    const { error } = await admin.from("contacts").delete().in("id", contact_ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, deleted: contact_ids.length });
  }

  if (action === "send_whatsapp") {
    const message = (value ?? "").trim();
    if (!message) {
      return NextResponse.json({ error: "Κενό μήνυμα" }, { status: 400 });
    }
    if (!isWhatsAppConfigured()) {
      return NextResponse.json({ error: "Το WhatsApp δεν έχει ρυθμιστεί" }, { status: 503 });
    }
    const { data: list, error: le } = await supabase
      .from("contacts")
      .select("id, phone")
      .in("id", contact_ids);
    if (le) {
      return NextResponse.json({ error: le.message }, { status: 400 });
    }
    let sent = 0;
    for (const row of list ?? []) {
      const phone = (row as { phone: string | null }).phone;
      const cid = (row as { id: string }).id;
      if (!phone?.trim()) continue;
      const r = await sendWhatsAppMessage(phone, message);
      if (r.ok) {
        sent += 1;
        void supabase.from("whatsapp_messages").insert({
          contact_id: cid,
          direction: "outbound",
          message,
          status: "sent",
          whatsapp_message_id: r.messageId,
        });
      }
      await new Promise((res) => setTimeout(res, 1000));
    }
    return NextResponse.json({ ok: true, sent, requested: contact_ids.length });
  }

  return NextResponse.json({ error: "Άγνωστη ενέργεια" }, { status: 400 });
  } catch (e) {
    console.error("[api/contacts/bulk-action]", e);
    return nextJsonError();
  }
}
