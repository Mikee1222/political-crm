"use client";

import { useCallback, useEffect, useState } from "react";
import { lux } from "@/lib/luxury-styles";
import { fetchWithTimeout, CLIENT_FETCH_TIMEOUT_MS } from "@/lib/client-fetch";
import type { ContactGroupRow } from "@/lib/contact-groups";

type LogRow = {
  id: string;
  to_email: string;
  subject: string;
  template: string;
  status: string;
  created_at: string;
};

export function EmailSettingsSection() {
  const [log, setLog] = useState<LogRow[] | null>(null);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ns, setNs] = useState("");
  const [nhtml, setNhtml] = useState("<p>Γεια σας,</p><p>…</p>");
  const [gId, setGId] = useState<string>("");
  const [groups, setGroups] = useState<ContactGroupRow[] | null>(null);
  const [news, setNews] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [a, b] = await Promise.all([
        fetchWithTimeout("/api/email/logs", { timeoutMs: CLIENT_FETCH_TIMEOUT_MS }),
        fetchWithTimeout("/api/groups", { timeoutMs: CLIENT_FETCH_TIMEOUT_MS }),
      ]);
      if (a.ok) {
        const j = (await a.json()) as { logs?: LogRow[] };
        setLog(j.logs ?? []);
      }
      if (b.ok) {
        const j2 = (await b.json()) as { groups?: ContactGroupRow[] };
        setGroups(j2.groups ?? []);
      }
    } catch {
      setLog([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className={lux.card} id="email">
      <h2 className={lux.sectionTitle}>Email (Resend)</h2>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">Δοκιμή, newsletter και καταγραφή αποστολών</p>
      {err && <p className="mt-2 text-sm text-amber-200" role="alert">{err}</p>}
      {ok && <p className="mt-2 text-sm text-[#4ADE80]" role="status">{ok}</p>}

      <div className="mt-4">
        <button
          type="button"
          className={lux.btnPrimary}
          disabled={sending}
          onClick={async () => {
            setSending(true);
            setErr(null);
            setOk(null);
            try {
              const res = await fetchWithTimeout("/api/email/test", { method: "POST" });
              const j = (await res.json().catch(() => ({}))) as { error?: string; to?: string };
              if (!res.ok) {
                setErr(j.error ?? "Σφάλμα");
                return;
              }
              setOk(j.to ? `Δοκιμαστικό email στο ${j.to}` : "Στάλθηκε.");
              void load();
            } catch {
              setErr("Δίκτυο");
            } finally {
              setSending(false);
            }
          }}
        >
          {sending ? "…" : "Δοκιμαστικό email (admin)"}
        </button>
      </div>

      <div className="mt-8">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Newsletter</h3>
        <div className="mt-2 space-y-2">
          <input
            className={lux.input + " w-full max-w-md"}
            value={ns}
            onChange={(e) => setNs(e.target.value)}
            placeholder="Θέμα"
            aria-label="Θέμα"
          />
          <textarea
            className="min-h-[100px] w-full max-w-2xl rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/40 px-2 py-2 text-sm"
            value={nhtml}
            onChange={(e) => setNhtml(e.target.value)}
            placeholder="HTML περιεχόμενο"
            aria-label="HTML"
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div>
              <span className="text-xs text-[var(--text-muted)]">Ομάδα παραληπτών (προαιρετικό = όλοι)</span>
              <select
                className="mt-1 min-h-11 w-full max-w-xs rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/40 px-2"
                value={gId}
                onChange={(e) => setGId(e.target.value)}
                aria-label="Ομάδα"
              >
                <option value="">Όλοι με email</option>
                {(groups ?? []).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className={lux.btnGold + " w-fit"}
              disabled={news}
              onClick={async () => {
                if (!ns.trim() || !nhtml.trim()) {
                  setErr("Θέμα + περιεχόμενο");
                  return;
                }
                setNews(true);
                setErr(null);
                setOk(null);
                try {
                  const res = await fetchWithTimeout("/api/email/newsletter", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      subject: ns,
                      html: nhtml,
                      group_id: gId || null,
                    }),
                    timeoutMs: 120_000,
                  });
                  const j = (await res.json().catch(() => ({}))) as { error?: string; sent?: number; total?: number };
                  if (!res.ok) {
                    setErr(j.error ?? "Σφάλμα");
                    return;
                  }
                  setOk(`Στάλθηκαν ${j.sent ?? 0} από ${j.total ?? "?"}.`);
                  void load();
                } catch {
                  setErr("Δίκτυο");
                } finally {
                  setNews(false);
                }
              }}
            >
              {news ? "Αποστολή…" : "Αποστολή newsletter"}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Καταγραφή (τελευταία)</h3>
        {log == null && <p className="text-sm text-[var(--text-muted)]">Φόρτωση…</p>}
        {log && log.length === 0 && <p className="text-sm text-[var(--text-muted)]">Καμία καταχώριση.</p>}
        {log && log.length > 0 && (
          <div className="mt-2 max-h-60 overflow-y-auto rounded-lg border border-[var(--border)]/60">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase text-[var(--text-muted)]">
                <tr>
                  <th className="p-2">Ημ/νια</th>
                  <th className="p-2">Πρός</th>
                  <th className="p-2">Θέμα</th>
                  <th className="p-2">Ψηφ</th>
                </tr>
              </thead>
              <tbody>
                {log.map((r) => (
                  <tr key={r.id} className="border-t border-[var(--border)]/30">
                    <td className="p-1.5 text-[10px] text-[var(--text-secondary)]">
                      {new Date(r.created_at).toLocaleString("el-GR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="p-1.5">{r.to_email}</td>
                    <td className="p-1.5">{r.subject}</td>
                    <td className="p-1.5">{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button type="button" className={lux.btnSecondary + " mt-2 !py-1.5 !text-xs"} onClick={() => void load()}>
          Ανανέωση καταγραφών
        </button>
      </div>
    </section>
  );
}
