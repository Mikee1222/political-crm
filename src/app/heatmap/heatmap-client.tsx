"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { lux } from "@/lib/luxury-styles";
import { hasMinRole } from "@/lib/roles";
import { useProfile } from "@/contexts/profile-context";
import type { ForMapRow, MapMode } from "@/components/heatmap/municipal-map";
import { MunicipalMap } from "@/components/heatmap/municipal-map";

type MuniRow = {
  muni: string;
  total: number;
  positive: number;
  negative: number;
  pending: number;
  noAnswer: number;
  heat: number;
};

type ApiPayload = {
  mode: MapMode;
  forMap: ForMapRow[];
  top10: MuniRow[];
  maxTotal: number;
};

const modes: { id: MapMode; label: string }[] = [
  { id: "contacts", label: "Επαφές" },
  { id: "positive", label: "Θετικοί" },
  { id: "negative", label: "Αρνητικοί" },
];

function muniShort(name: string) {
  return name.replace(/^Δήμος /, "");
}

export function HeatmapClient() {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  const [mode, setMode] = useState<MapMode>("contacts");
  const [data, setData] = useState<ApiPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const canView = hasMinRole(profile?.role, "manager");

  const load = useCallback(async (m: MapMode) => {
    setErr(null);
    const res = await fetch(`/api/heatmap/municipalities?mode=${encodeURIComponent(m)}`);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(j.error ?? "Σφάλμα φόρτωσης");
      setData(null);
      return;
    }
    const j = (await res.json()) as ApiPayload;
    setData(j);
  }, []);

  useEffect(() => {
    if (profileLoading || !canView) return;
    void load(mode);
  }, [load, mode, canView, profileLoading]);

  const onSelectMuni = useCallback(
    (muni: string) => {
      const p = new URLSearchParams();
      p.set("municipality", muni);
      if (mode === "positive") p.set("call_status", "Positive");
      if (mode === "negative") p.set("call_status", "Negative");
      router.push(`/contacts?${p.toString()}`);
    },
    [mode, router],
  );

  if (profileLoading) {
    return (
      <div className={`${lux.pageBg} ${lux.pageAnimated} p-6`}>
        <p className="text-sm text-[var(--text-secondary)]">Φόρτωση…</p>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className={`${lux.pageBg} ${lux.pageAnimated} p-6`}>
        <div className={lux.card}>
          <h1 className={lux.pageTitle}>Χάρτης</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">Δεν έχετε πρόσβαση σε αυτή τη σελίδα.</p>
        </div>
      </div>
    );
  }

  const top = data?.top10 ?? [];
  const maxTop = top.length ? Math.max(1, ...top.map((r) => r.total)) : 1;

  return (
    <div className={`${lux.pageBg} ${lux.pageAnimated} min-h-0 space-y-4 p-4 pb-24 md:pb-6`}>
      <div className={lux.card + " !p-4"}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className={lux.pageTitle}>Χάρτης</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Αιτωλοακαρνανία — κατανομή επαφών ανά δήμο</p>
          </div>
          <div className="inline-flex flex-wrap gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/50 p-1">
            {modes.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setMode(b.id)}
                className={[
                  "btn-scale rounded-lg px-4 py-2 text-sm font-medium transition",
                  mode === b.id
                    ? "bg-[rgba(201,168,76,0.18)] text-[var(--accent-gold)] ring-1 ring-inset ring-[var(--accent-gold)]/40"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                ].join(" ")}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {err && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-200">{err}</div>
      )}

      <div className="flex min-h-0 flex-col gap-4 lg:flex-row">
        <div className="relative min-h-[min(60vh,560px)] flex-1">
          {data && (
            <MunicipalMap forMap={data.forMap} onSelect={onSelectMuni} />
          )}
          <div
            className="pointer-events-none absolute bottom-3 left-3 z-[500] max-w-[min(100%,220px)] rounded-xl border border-[var(--border)] bg-[#0a1628]/95 px-3 py-2.5 text-[10px] text-[var(--text-secondary)] shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-md"
            role="img"
            aria-label="Υπόμνημα"
          >
            <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-[#4a6080]">Υπόμνημα</p>
            <ul className="space-y-1.5">
              <li className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full border border-[var(--border)]" />
                <span>0 — κενό</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#C9A84C]/30" />
                <span>1–10 (ανά επιλεγμένη προβολή)</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#C9A84C]/60" />
                <span>11–50</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#E8C96B]/80" />
                <span>51–100</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#E8C96B] shadow-[0_0_8px_rgba(201,168,76,0.7)]" />
                <span>100+ (φωτισμός)</span>
              </li>
            </ul>
          </div>
        </div>

        <aside
          className="data-hq-card w-full max-w-full shrink-0 space-y-3 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-[0_4px_24px_rgba(0,0,0,0.4)] lg:max-w-[300px] xl:max-w-[320px]"
          aria-label="Κορυφαίοι δήμοι"
        >
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#4a6080]">Top 10 δήμων</h2>
          {top.length === 0 && !err && (
            <p className="text-sm text-[var(--text-muted)]">Φόρτωση…</p>
          )}
          <ol className="space-y-3">
            {top.map((r, i) => (
              <li key={r.muni} className="min-w-0">
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[var(--text-primary)]" title={r.muni}>
                    {i + 1}. {muniShort(r.muni)}
                  </span>
                  <span className="shrink-0 text-[12px] tabular-nums text-[var(--accent-gold)]">{r.total}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[#162540]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#6b4f18] to-[#C9A84C] shadow-[0_0_12px_rgba(201,168,76,0.4)]"
                    style={{ width: `${Math.min(100, (r.total / maxTop) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}
