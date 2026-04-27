import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = "force-dynamic";

const KEYS = ["telegram_bot_token", "telegram_chat_id", "telegram_morning_auto"] as const;

function maskToken(t: string) {
  if (t.length <= 8) {
    return "****";
  }
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
}

export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const { data, error } = await supabase
      .from("crm_settings")
      .select("key, value")
      .in("key", [...KEYS]);
    if (error) {
      return NextResponse.json({ error: error.message, settings: {} });
    }
    const raw = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
    return NextResponse.json({
      settings: {
        telegram_chat_id: raw.telegram_chat_id ?? "",
        telegram_morning_auto: raw.telegram_morning_auto === "1" || raw.telegram_morning_auto === "true",
        has_stored_token: Boolean(raw.telegram_bot_token),
        telegram_bot_token_preview: raw.telegram_bot_token ? maskToken(String(raw.telegram_bot_token)) : null,
      },
    });
  } catch (e) {
    console.error("[api/crm-settings GET]", e);
    return nextJsonError();
  }
}

export async function PUT(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const body = (await request.json()) as {
      telegram_bot_token?: string;
      telegram_chat_id?: string;
      telegram_morning_auto?: boolean;
    };
    const now = new Date().toISOString();
    if (body.telegram_morning_auto !== undefined) {
      const { error } = await supabase
        .from("crm_settings")
        .upsert(
          { key: "telegram_morning_auto", value: body.telegram_morning_auto ? "1" : "0", updated_at: now },
          { onConflict: "key" },
        );
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    if (body.telegram_chat_id != null) {
      const { error } = await supabase
        .from("crm_settings")
        .upsert({ key: "telegram_chat_id", value: String(body.telegram_chat_id), updated_at: now }, { onConflict: "key" });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    if (body.telegram_bot_token != null && String(body.telegram_bot_token).trim() !== "") {
      const { error } = await supabase
        .from("crm_settings")
        .upsert({ key: "telegram_bot_token", value: String(body.telegram_bot_token).trim(), updated_at: now }, { onConflict: "key" });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/crm-settings PUT]", e);
    return nextJsonError();
  }
}
