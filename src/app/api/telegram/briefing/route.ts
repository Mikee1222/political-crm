import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { fetchBriefingTodayData, resolveCalendarUserId } from "@/lib/briefing-data";
import { formatTelegramBriefing, sendTelegramMessage } from "@/lib/telegram-send";
export const dynamic = "force-dynamic";

/**
 * POST — αποστολή ημερήσιας ενημέρωσης (cron, n8n, κ.λπ.)
 * Ασφάλεια: header `X-Telegram-Briefing-Secret: <TELEGRAM_BRIEFING_SECRET>` (ή CRON_BRIEFING_KEY) — αν δεν οριστεί, ευάλωτο.
 */
export async function POST(request: NextRequest) {
  try {
    const secret = process.env.TELEGRAM_BRIEFING_SECRET || process.env.CRON_BRIEFING_KEY;
    if (secret) {
      const got = request.headers.get("x-telegram-briefing-secret");
      if (got !== secret) {
        return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
      }
    }

    let token = process.env.TELEGRAM_BOT_TOKEN;
    let chatId = process.env.TELEGRAM_CHAT_ID;
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
      /* */
    }
    if (!token || !chatId) {
      return NextResponse.json(
        { error: "Λείπει TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID (env ή crm_settings)" },
        { status: 500 },
      );
    }

    const supabase = createServiceClient();
    const calUser = await resolveCalendarUserId(supabase);
    const data = await fetchBriefingTodayData(supabase, calUser);

    const dateLabel = new Date().toLocaleDateString("el-GR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const namesLine =
      data.namedays.names.length > 0 ? data.namedays.names.slice(0, 12).join(", ") : "—";
    const calLines =
      !data.calendar.connected
        ? "Μη συνδεδεμένο ημερολόγιο"
        : data.calendar.events.length === 0
          ? "Καμία εκδήλωση"
          : data.calendar.events
              .slice(0, 8)
              .map((e) => (e.start ? `${e.title ?? "—"} (${e.start})` : e.title ?? "—"))
              .join(" · ");
    const tasksLine =
      data.tasksDueToday.length > 0
        ? data.tasksDueToday
            .slice(0, 5)
            .map((t) => t.title)
            .join(", ") + (data.tasksDueToday.length > 5 ? "…" : "")
        : "Κανένα";
    const text = formatTelegramBriefing({
      dateLabel,
      namesLine,
      contactCount: data.namedays.matchingContactsCount,
      calendarLine: calLines,
      tasksLine,
      openRequests: data.openRequestsCount,
      overdue: data.overdueRequestCount,
      callsYest: { total: data.callsYesterday.total, positive: data.callsYesterday.positive },
    });

    const sent = await sendTelegramMessage(text, chatId, token);
    if (!sent.ok) {
      return NextResponse.json({ error: sent.error ?? "Telegram" }, { status: 502 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[api/telegram/briefing]", e);
    return NextResponse.json({ error: "Σφάλμα" }, { status: 500 });
  }
}
