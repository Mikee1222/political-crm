import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { sendWhatsAppMessage, isWhatsAppConfigured } from "@/lib/whatsapp";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  contact_id: z.string().uuid(),
  message: z.string().min(1).max(4096),
});

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
    const { contact_id, message } = parsed.data;
    const { data: c, error: ce } = await supabase
      .from("contacts")
      .select("id, phone, first_name, last_name")
      .eq("id", contact_id)
      .maybeSingle();
    if (ce || !c?.phone) {
      return NextResponse.json({ error: "Η επαφή δεν βρέθηκε ή δεν έχει τηλέφωνο" }, { status: 400 });
    }

    const result = await sendWhatsAppMessage(c.phone, message);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, detail: result.raw },
        { status: result.status && result.status < 500 ? 400 : 502 },
      );
    }

    const { error: insErr } = await supabase.from("whatsapp_messages").insert({
      contact_id,
      direction: "outbound",
      message,
      status: "sent",
      whatsapp_message_id: result.messageId,
    });
    if (insErr) {
      console.error("[whatsapp/send log]", insErr.message);
    }

    return NextResponse.json({ ok: true, whatsapp_message_id: result.messageId });
  } catch (e) {
    console.error("[api/whatsapp/send]", e);
    return nextJsonError();
  }
}
