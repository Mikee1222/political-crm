"use client";

import { useCallback, useEffect, useState } from "react";
import { MUNICIPALITIES } from "@/lib/aitoloakarnania-data";
import { lux } from "@/lib/luxury-styles";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { HqSelect } from "@/components/ui/hq-select";
import { useFormToast } from "@/contexts/form-toast-context";

type Row = { id: string; municipality: string; party: string; percentage: number; year: number };

export function ElectoralSettingsSection() {
  const { showToast } = useFormToast();
  const year = 2023;
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [muni, setMuni] = useState<string>(MUNICIPALITIES[0]?.name ?? "");
  const [pct, setPct] = useState("40");
  const [party, setParty] = useState("ΝΔ");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetchWithTimeout(`/api/electoral-results?year=${year}`);
      const j = (await res.json()) as { rows?: Row[]; error?: string };
      if (!res.ok) {
        const msg = j.error ?? "Φόρτωση";
        setErr(msg);
        showToast(msg, "error");
        return;
      }
      setRows(j.rows ?? []);
    } catch {
      const msg = "Σφάλμα δικτύου";
      setErr(msg);
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [year, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const addLocal = () => {
    const p = parseFloat(pct);
    if (!muni || !Number.isFinite(p)) {
      setErr("Συμπληρώστε δήμο και ποσοστό");
      return;
    }
    setErr(null);
    setRows((prev) => {
      const next = prev.filter((r) => r.municipality !== muni || r.party !== party);
      return [
        ...next,
        { id: `new-${muni}-${party}`, municipality: muni, party, percentage: p, year },
      ];
    });
  };

  const saveServer = async () => {
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetchWithTimeout("/api/electoral-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year,
          replace: true,
          rows: rows.map((r) => ({ municipality: r.municipality, party: r.party, percentage: r.percentage })),
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; inserted?: number };
      if (!res.ok) {
        const msg = j.error ?? "Αποτυχία";
        setErr(msg);
        showToast(msg, "error");
        return;
      }
      const msg = `Αποθηκεύτηκαν ${j.inserted ?? rows.length} γραμμές.`;
      setMsg(msg);
      showToast(msg, "success");
      await load();
    } catch {
      const msg = "Σφάλμα δικτύου";
      setErr(msg);
      showToast(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={lux.card}>
      <h2 className={lux.sectionTitle + " mb-1"}>Εκλογικά 2023 (ΝΔ % ανά δήμο)</h2>
      <p className="mb-4 text-sm text-[var(--text-secondary)]">
        Τα ονόματα δήμων πρέπει να ταιριάζουν ακριβώς με του χάρτη. Για μπόνους σκορ, χρειάζεται % Νέας Δημοκρατίας ≥ 38%.
      </p>
      {err && <p className="mb-2 text-sm text-red-300">{err}</p>}
      {msg && <p className="mb-2 text-sm text-emerald-300">{msg}</p>}

      <div className="mb-4 flex w-full min-w-0 max-w-2xl flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-0 sm:min-w-0 sm:flex-1">
          <label className={lux.label} htmlFor="el-muni">
            Δήμος
          </label>
          <HqSelect id="el-muni" className={lux.select} value={muni} onChange={(e) => setMuni(e.target.value)}>
            {MUNICIPALITIES.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name}
              </option>
            ))}
          </HqSelect>
        </div>
        <div className="w-full min-w-0 sm:w-32">
          <label className={lux.label} htmlFor="el-party">
            Κόμμα
          </label>
          <input id="el-party" className={lux.input + " w-full min-w-0"} value={party} onChange={(e) => setParty(e.target.value)} />
        </div>
        <div className="w-full min-w-0 sm:w-28">
          <label className={lux.label} htmlFor="el-pct">
            %
          </label>
          <input
            id="el-pct"
            className={lux.input + " w-full min-w-0"}
            type="text"
            inputMode="decimal"
            value={pct}
            onChange={(e) => setPct(e.target.value)}
          />
        </div>
        <button type="button" className={lux.btnSecondary + " w-full !py-2.5 sm:w-auto"} onClick={addLocal}>
          Προσθήκη / ενημέρωση λίστας
        </button>
      </div>

      {loading && <p className="text-sm text-[var(--text-muted)]">Φόρτωση…</p>}

      {!loading && (
        <div className="max-h-64 overflow-y-auto rounded-lg border border-[var(--border)]">
          <table className="w-full min-w-0 text-sm">
            <thead>
              <tr className={lux.tableHead + " border-b border-[var(--border)]"}>
                <th className="p-2 text-left">Δήμος</th>
                <th className="p-2">Κόμμα</th>
                <th className="p-2">%</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .slice()
                .sort((a, b) => a.municipality.localeCompare(b.municipality, "el"))
                .map((r) => (
                  <tr key={r.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="p-2 text-[var(--text-primary)]">{r.municipality}</td>
                    <td className="p-2 text-center text-[var(--text-secondary)]">{r.party}</td>
                    <td className="p-2 text-right font-mono text-[var(--text-primary)]">
                      {Number(r.percentage).toFixed(2)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="p-3 text-sm text-[var(--text-secondary)]">Δεν υπάρχουν ακόμη δεδομένα.</p>}
        </div>
      )}

      <button type="button" className={lux.btnPrimary + " mt-4"} disabled={saving || rows.length === 0} onClick={() => void saveServer()}>
        {saving ? "Αποθήκευση…" : "Αποθήκευση στη βάση (αντικαθιστά " + year + ")"}
      </button>
    </section>
  );
}
