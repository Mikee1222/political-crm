"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { lux } from "@/lib/luxury-styles";

type WMsg = {
  id: string;
  direction: string;
  message: string;
  status: string;
  created_at: string;
  contacts: { first_name: string; last_name: string; phone: string | null } | null;
};

export function WhatsappSettingsSection() {
  const [test, setTest] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [templates, setTemplates] = useState<Array<Record<string, unknown>> | null>(null);
  const [log, setLog] = useState<WMsg[]>([]);

  const load = useCallback(async () => {
    const [t, m] = await Promise.all([
      fetchWithTimeout("/api/whatsapp/templates"),
      fetchWithTimeout("/api/whatsapp/messages?limit=50"),
    ]);
    if (t.ok) {
      const j = (await t.json()) as { templates?: unknown[]; info?: string; error?: string };
      setTemplates((j.templates as Array<Record<string, unknown>>) ?? []);
    }
    if (m.ok) {
      const j2 = (await m.json()) as { messages?: WMsg[] };
      setLog(j2.messages ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    const r = await fetchWithTimeout("/api/whatsapp/test");
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; details?: unknown };
    setTesting(false);
    if (j.ok) {
      setTest("Συνδεδεμένο: " + JSON.stringify(j.details ?? {}));
    } else {
      setTest(j.error ?? "Σφάλμα");
    }
  };

  return (
    <section className={lux.card} data-hq-card>
      <h2 className={lux.pageTitle + " mb-1"}>WhatsApp</h2>
      <p className="text-sm text-[var(--text-secondary)]">Ρυθμίστε env WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_VERIFY_TOKEN (webhook).</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={lux.btnPrimary + " !py-2 text-sm"} disabled={testing} onClick={() => void runTest()}>
          {testing ? "Έλεγχος…" : "Έλεγχος σύνδεσης"}
        </button>
      </div>
      {test && <p className="mt-2 text-xs text-[var(--text-secondary)] break-all">{test}</p>}

      <h3 className="mt-6 text-xs font-semibold uppercase text-[var(--text-muted)]">Πρότυπα (Meta)</h3>
      {templates && templates.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">Καμία λίστα — προσθέστε WHATSAPP_WABA_ID για Graph API.</p>
      ) : (
        <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-sm">
          {(templates ?? []).map((t, i) => (
            <li key={i} className="text-[var(--text-primary)]">
              {String(t.name ?? "?")} · {String(t.status ?? "")}
            </li>
          ))}
        </ul>
      )}

      <h3 className="mt-6 text-xs font-semibold uppercase text-[var(--text-muted)]">Απεσταλμένα / εισερχόμενα (ιστορικό)</h3>
      <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-xs">
        {log.map((w) => (
          <li key={w.id} className="border-b border-[var(--border)]/50 py-1 text-[var(--text-secondary)]">
            <span className="text-[var(--accent-gold)]">{w.direction}</span> {new Date(w.created_at).toLocaleString("el-GR")}{" "}
            {w.contacts
              ? `${w.contacts.first_name} ${w.contacts.last_name}`.trim()
              : "—"}{" "}
            — {w.message.slice(0, 120)}
            {w.message.length > 120 ? "…" : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}
