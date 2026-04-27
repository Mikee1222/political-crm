import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

/**
 * GET: επαλήθευση Webhook (Meta)
 * POST: εισερχόμενα (απλή καταγραφή στη βάση όπου είναι δυνατό)
 */
export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");
  const verify = process.env.WHATSAPP_VERIFY_TOKEN?.trim();
  if (mode === "subscribe" && token && verify && token === verify && challenge) {
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as
      | {
          entry?: Array<{
            changes?: Array<{
              value?: {
                messages?: Array<{
                  id?: string;
                  from?: string;
                  type?: string;
                  text?: { body?: string };
                }>;
              };
            }>;
          }>;
        }
      | null;
    const msg = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (msg?.id && (msg.text?.body || msg.type)) {
      const from = msg.from ?? "";
      const text = msg.text?.body ?? `[${msg.type ?? "msg"}]`;
      const admin = createServiceClient();
      const { data: c } = await admin
        .from("contacts")
        .select("id")
        .or(`phone.eq.${from},phone.eq.0${from.slice(-10)},phone.eq.+${from}`)
        .limit(1)
        .maybeSingle();
      const contactId = (c as { id?: string } | null)?.id ?? null;
      await admin.from("whatsapp_messages").insert({
        contact_id: contactId,
        direction: "inbound",
        message: text,
        status: "received",
        whatsapp_message_id: msg.id,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/whatsapp/webhook POST]", e);
    return nextJsonError();
  }
}
