"use client";

import { useCallback, useEffect, useState } from "react";
import { lux } from "@/lib/luxury-styles";
import { fetchWithTimeout } from "@/lib/client-fetch";

type Crm = {
  telegram_chat_id: string;
  telegram_morning_auto: boolean;
  has_stored_token: boolean;
  telegram_bot_token_preview: string | null;
};

export function TelegramSettingsSection() {
  const [data, setData] = useState<Crm | null>(null);
  const [token, setToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [auto, setAuto] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetchWithTimeout("/api/crm-settings");
      if (!res.ok) {
        setErr("Δεν φορτώθηκαν οι ρυθμίσεις");
        return;
      }
      const j = (await res.json()) as { settings?: Crm; error?: string };
      if (j.error) {
        setErr(j.error);
        return;
      }
      const s = j.settings;
      if (s) {
        setData(s);
        setChatId(s.telegram_chat_id);
        setAuto(s.telegram_morning_auto);
        setToken("");
      }
    } catch {
      setErr("Σφάλμα δικτύου");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (patch: Partial<{ telegram_bot_token: string; telegram_chat_id: string; telegram_morning_auto: boolean }>) => {
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const body: Record<string, string | boolean> = { ...patch };
      if (Object.prototype.hasOwnProperty.call(body, "telegram_bot_token") && !String(body.telegram_bot_token ?? "").trim()) {
        delete body.telegram_bot_token;
      }
      const res = await fetchWithTimeout("/api/crm-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErr(j.error ?? "Αποτυχία");
        return;
      }
      setMsg("Αποθηκεύτηκε.");
      await load();
    } catch {
      setErr("Σφάλμα δικτύου");
    } finally {
      setSaving(false);
    }
  };

  const testSend = async () => {
    setSending(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetchWithTimeout("/api/telegram/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "🧪 Δοκιμαστικό μήνυμα από CRM — Καραγκούνης" }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErr(j.error ?? "Αποτυχία αποστολής");
        return;
      }
      setMsg("Στάλθηκε δοκιμαστικό μήνυμα.");
    } catch {
      setErr("Σφάλμα δικτύου");
    } finally {
      setSending(false);
    }
  };

  if (loading && !data) {
    return (
      <section className={lux.card + " w-full min-w-0 max-w-full"}>
        <h2 className={lux.sectionTitle + " mb-2"}>Telegram Bot</h2>
        <p className="text-sm text-[var(--text-muted)]">Φόρτωση…</p>
      </section>
    );
  }

  return (
    <section className={lux.card + " w-full min-w-0 max-w-full"}>
      <h2 className={lux.sectionTitle + " mb-2"}>Telegram — πρωινό briefing</h2>
      <p className="mb-4 text-sm text-[var(--text-secondary)]">
        Ρυθμίστε token και chat. Μπορείτε να χρησιμοποιηθούν εναλλακτικά env{" "}
        <code className="rounded bg-[var(--bg-elevated)] px-1">TELEGRAM_BOT_TOKEN</code> /{" "}
        <code className="rounded bg-[var(--bg-elevated)] px-1">TELEGRAM_CHAT_ID</code> χωρίς αποθήκευση εδώ.
      </p>
      {data?.has_stored_token && (
        <p className="mb-2 text-xs text-[var(--text-secondary)]">
          Token στη βάση: {data.telegram_bot_token_preview ? <strong>{data.telegram_bot_token_preview}</strong> : "—"}
        </p>
      )}
      {err && <p className="mb-2 text-sm text-red-300">{err}</p>}
      {msg && <p className="mb-2 text-sm text-emerald-300">{msg}</p>}

      <div className="grid w-full min-w-0 max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="min-w-0 sm:col-span-2">
          <label className={lux.label} htmlFor="tg-token">
            Bot token
          </label>
          <input
            id="tg-token"
            className={lux.input}
            type="password"
            autoComplete="off"
            placeholder="Νέο token (αφήστε κενό να κρατήσετε το υπάρχον)"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </div>
        <div>
          <label className={lux.label} htmlFor="tg-chat">
            Chat ID
          </label>
          <input
            id="tg-chat"
            className={lux.input}
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder="π.χ. -100123…"
          />
        </div>
        <div className="flex flex-col justify-end">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-primary)]">
            <input
              type="checkbox"
              className="h-4 w-4 rounded"
              checked={auto}
              onChange={(e) => {
                const v = e.target.checked;
                setAuto(v);
                void save({ telegram_morning_auto: v, telegram_chat_id: chatId });
              }}
            />
            Αυτόματη αποστολή κάθε πρωί
          </label>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className={lux.btnPrimary}
          disabled={saving}
          onClick={() => void save({ ...(token.trim() ? { telegram_bot_token: token } : {}), telegram_chat_id: chatId, telegram_morning_auto: auto })}
        >
          {saving ? "Αποθήκευση…" : "Αποθήκευση"}
        </button>
        <button
          type="button"
          className={lux.btnSecondary}
          disabled={sending}
          onClick={() => void testSend()}
        >
          {sending ? "Αποστολή…" : "Αποστολή δοκιμαστικού"}
        </button>
      </div>
    </section>
  );
}
