import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { sendTelegramMessage } from "@/lib/telegram-send";
import { createServiceClient } from "@/lib/supabase/admin";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }

    const body = (await request.json()) as { text?: string; chat_id?: string };
    const text = String(body.text ?? "").trim();
    if (!text) {
      return NextResponse.json({ error: "Κενό μήνυμα" }, { status: 400 });
    }

    let token = process.env.TELEGRAM_BOT_TOKEN;
    let chatId = body.chat_id ? String(body.chat_id) : process.env.TELEGRAM_CHAT_ID;
    try {
      const s = createServiceClient();
      const { data: rows } = await s
        .from("crm_settings")
        .select("key, value")
        .in("key", ["telegram_bot_token", "telegram_chat_id"]);
      const map = Object.fromEntries((rows ?? []).map((r) => [r.key as string, r.value as string]));
      if (!token && map.telegram_bot_token) {
        token = map.telegram_bot_token;
      }
      if (!chatId && map.telegram_chat_id) {
        chatId = map.telegram_chat_id;
      }
    } catch {
      /* crm_settings may not exist yet */
    }
    if (!token) {
      return NextResponse.json({ error: "Ρυθμίστε TELEGRAM_BOT_TOKEN (env ή crm_settings)" }, { status: 500 });
    }
    if (!chatId) {
      return NextResponse.json({ error: "Ρυθμίστε TELEGRAM_CHAT_ID" }, { status: 500 });
    }
    const sent = await sendTelegramMessage(text, chatId, token);
    if (!sent.ok) {
      return NextResponse.json({ error: sent.error }, { status: 502 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[api/telegram/send]", e);
    return nextJsonError();
  }
}
