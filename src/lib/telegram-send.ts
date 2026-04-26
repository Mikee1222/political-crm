/** Αποστολή μηνύματος μέσω Telegram Bot API */

export async function sendTelegramMessage(text: string, chatId: string, botToken: string): Promise<{ ok: boolean; error?: string }> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text.slice(0, 4096),
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { ok: false, error: t || res.statusText };
  }
  return { ok: true };
}

export function formatTelegramBriefing(b: {
  dateLabel: string;
  namesLine: string;
  contactCount: number;
  calendarLine: string;
  tasksLine: string;
  openRequests: number;
  overdue: number;
  callsYest: { total: number; positive: number };
}): string {
  return `🌅 Καλημέρα! Ημερήσια Ενημέρωση - ${b.dateLabel}

🎂 Γιορτάζουν σήμερα: ${b.namesLine} (${b.contactCount} επαφές)
📅 Πρόγραμμα: ${b.calendarLine}
✅ Tasks σήμερα: ${b.tasksLine}
📋 Ανοιχτά αιτήματα: ${b.openRequests} (${b.overdue} εκπρόθεσμα)
📞 Κλήσεις χθες: ${b.callsYest.total} (${b.callsYest.positive} θετικές)

Καλή δύναμη! 💪`;
}
