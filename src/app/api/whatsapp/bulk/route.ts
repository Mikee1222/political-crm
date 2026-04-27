import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { sendWhatsAppMessage, isWhatsAppConfigured } from "@/lib/whatsapp";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z.object({
  contact_ids: z.array(z.string().uuid()).min(1).max(500),
  message: z.string().min(1).max(4096),
});

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) return forbidden();
    if (!isWhatsAppConfigured()) {
      return NextResponse.json({ error: "Το WhatsApp δεν έχει ρυθμιστεί" }, { status: 503 });
    }

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Άκυρα δεδομένα" }, { status: 400 });
    }
    const { contact_ids, message } = parsed.data;

    const { data: rows, error } = await supabase
      .from("contacts")
      .select("id, phone")
      .in("id", contact_ids);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    let sent = 0;
    const failures: { id: string; error: string }[] = [];

    for (const row of rows ?? []) {
      const phone = (row as { id: string; phone: string | null }).phone;
      const id = (row as { id: string }).id;
      if (!phone?.trim()) {
        failures.push({ id, error: "Χωρίς τηλέφωνο" });
        await sleep(1000);
        continue;
      }
      const result = await sendWhatsAppMessage(phone, message);
      if (result.ok) {
        sent += 1;
        void supabase.from("whatsapp_messages").insert({
          contact_id: id,
          direction: "outbound",
          message,
          status: "sent",
          whatsapp_message_id: result.messageId,
        });
      } else {
        failures.push({ id, error: result.error });
      }
      await sleep(1000);
    }

    return NextResponse.json({ ok: true, sent, failed: failures.length, failures });
  } catch (e) {
    console.error("[api/whatsapp/bulk]", e);
    return nextJsonError();
  }
}
