import { checkCRMAccess } from "@/lib/crm-api-access";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
import {
  CRM_SETTINGS_KEY_REQUEST_STATUS_COLORS,
  mergeRequestStatusColors,
  parseRequestStatusColorsValue,
  serializeRequestStatusColors,
  type RequestStatusColorsMap,
} from "@/lib/request-status-colors";

export const dynamic = "force-dynamic";

const TELEGRAM_KEYS = ["telegram_bot_token", "telegram_chat_id", "telegram_morning_auto"] as const;

function maskToken(t: string) {
  if (t.length <= 8) {
    return "****";
  }
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
}

async function loadRequestStatusColors(supabase: SupabaseClient): Promise<RequestStatusColorsMap> {
  const { data, error } = await supabase
    .from("crm_settings")
    .select("value")
    .eq("key", CRM_SETTINGS_KEY_REQUEST_STATUS_COLORS)
    .maybeSingle();
  if (error) {
    return parseRequestStatusColorsValue(null);
  }
  return parseRequestStatusColorsValue(data?.value ?? null);
}

async function saveRequestStatusColors(supabase: SupabaseClient, colors: RequestStatusColorsMap) {
  const now = new Date().toISOString();
  const { error } = await supabase.from("crm_settings").upsert(
    {
      key: CRM_SETTINGS_KEY_REQUEST_STATUS_COLORS,
      value: serializeRequestStatusColors(colors),
      updated_at: now,
    },
    { onConflict: "key" },
  );
  return error;
}

export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    const request_status_colors = await loadRequestStatusColors(supabase);

    if (!hasMinRole(profile?.role, "manager")) {
      return NextResponse.json({ settings: { request_status_colors } });
    }

    const { data, error } = await supabase
      .from("crm_settings")
      .select("key, value")
      .in("key", [...TELEGRAM_KEYS]);
    if (error) {
      return NextResponse.json({ error: error.message, settings: { request_status_colors } });
    }
    const raw = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
    return NextResponse.json({
      settings: {
        request_status_colors,
        telegram_chat_id: raw.telegram_chat_id ?? "",
        telegram_morning_auto:
          raw.telegram_morning_auto === "1" || raw.telegram_morning_auto === "true",
        has_stored_token: Boolean(raw.telegram_bot_token),
        telegram_bot_token_preview: raw.telegram_bot_token
          ? maskToken(String(raw.telegram_bot_token))
          : null,
      },
    });
  } catch (e) {
    console.error("[api/crm-settings GET]", e);
    return nextJsonError();
  }
}

async function applyTelegramPatch(
  supabase: SupabaseClient,
  body: {
    telegram_bot_token?: string;
    telegram_chat_id?: string;
    telegram_morning_auto?: boolean;
  },
) {
  const now = new Date().toISOString();
  if (body.telegram_morning_auto !== undefined) {
    const { error } = await supabase.from("crm_settings").upsert(
      {
        key: "telegram_morning_auto",
        value: body.telegram_morning_auto ? "1" : "0",
        updated_at: now,
      },
      { onConflict: "key" },
    );
    if (error) return error;
  }
  if (body.telegram_chat_id != null) {
    const { error } = await supabase.from("crm_settings").upsert(
      { key: "telegram_chat_id", value: String(body.telegram_chat_id), updated_at: now },
      { onConflict: "key" },
    );
    if (error) return error;
  }
  if (body.telegram_bot_token != null && String(body.telegram_bot_token).trim() !== "") {
    const { error } = await supabase.from("crm_settings").upsert(
      {
        key: "telegram_bot_token",
        value: String(body.telegram_bot_token).trim(),
        updated_at: now,
      },
      { onConflict: "key" },
    );
    if (error) return error;
  }
  return null;
}

async function handleSettingsWrite(request: NextRequest) {
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
    request_status_colors?: Partial<RequestStatusColorsMap> | RequestStatusColorsMap;
  };

  if (body.request_status_colors !== undefined) {
    const existing = await loadRequestStatusColors(supabase);
    const merged = mergeRequestStatusColors(body.request_status_colors, existing);
    const err = await saveRequestStatusColors(supabase, merged);
    if (err) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
  }

  const telegramErr = await applyTelegramPatch(supabase, body);
  if (telegramErr) {
    return NextResponse.json({ error: telegramErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function PUT(request: NextRequest) {
  try {
    return await handleSettingsWrite(request);
  } catch (e) {
    console.error("[api/crm-settings PUT]", e);
    return nextJsonError();
  }
}

export async function PATCH(request: NextRequest) {
  try {
    return await handleSettingsWrite(request);
  } catch (e) {
    console.error("[api/crm-settings PATCH]", e);
    return nextJsonError();
  }
}
