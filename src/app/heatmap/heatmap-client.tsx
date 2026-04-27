"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { lux } from "@/lib/luxury-styles";
import { hasMinRole } from "@/lib/roles";
import { useProfile } from "@/contexts/profile-context";
import type { ForMapRow, MapColorVariant, MapMode } from "@/components/heatmap/municipal-map";

const MunicipalMap = dynamic(
  () => import("@/components/heatmap/municipal-map").then((m) => m.MunicipalMap),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex h-[60vh] min-h-[400px] w-full items-center justify-center rounded-2xl border border-[var(--border)] bg-[#0a0f1a] text-sm text-[var(--text-secondary)]"
        role="status"
        aria-live="polite"
      >
        Φόρτωση Leaflet…
      </div>
    ),
  },
);

type MuniRow = {
  muni: string;
  total: number;
  positive: number;
  negative: number;
  pending: number;
  noAnswer: number;
  heat: number;
  ndPercent?: number;
};

type ApiPayload = {
  view?: "crm" | "electoral" | "compare";
  mapColorVariant?: MapColorVariant;
  mode: MapMode;
  forMap: ForMapRow[];
  top10: MuniRow[];
  maxTotal: number;
};

const views: { id: "crm" | "electoral" | "compare"; label: string }[] = [
  { id: "crm", label: "Επαφές" },
  { id: "electoral", label: "Εκλογικά 2023" },
  { id: "compare", label: "Σύγκριση" },
];

const crmSubModes: { id: MapMode; label: string }[] = [
  { id: "contacts", label: "Όλες" },
  { id: "positive", label: "Θετικοί" },
  { id: "negative", label: "Αρνητικοί" },
];

function muniShort(name: string) {
  return name.replace(/^Δήμος /, "");
}

export function HeatmapClient() {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  const [view, setView] = useState<"crm" | "electoral" | "compare">("crm");
  const [mode, setMode] = useState<MapMode>("contacts");
  const [data, setData] = useState<ApiPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const canView = hasMinRole(profile?.role, "manager");

  const load = useCallback(async (m: MapMode, v: "crm" | "electoral" | "compare") => {
    setErr(null);
    const q = new URLSearchParams();
    q.set("view", v);
    if (v === "crm") {
      q.set("mode", m);
    } else {
      q.set("year", "2023");
    }
    const res = await fetchWithTimeout(`/api/heatmap/municipalities?${q.toString()}`);
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
    if (profileLoading || !canView) {
      return;
    }
    void load(mode, view);
  }, [load, mode, view, canView, profileLoading]);

  const onSelectMuni = useCallback(
    (muni: string) => {
      const p = new URLSearchParams();
      p.set("municipality", muni);
      if (view === "crm" && mode === "positive") {
        p.set("call_status", "Positive");
      }
      if (view === "crm" && mode === "negative") {
        p.set("call_status", "Negative");
      }
      router.push(`/contacts?${p.toString()}`);
    },
    [mode, router, view],
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
          <div className="flex flex-col gap-2 sm:items-end">
            <div className="inline-flex flex-wrap gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/50 p-1">
              {views.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    setView(b.id);
                  }}
                  className={[
                    "btn-scale rounded-lg px-3 py-2 text-sm font-medium transition",
                    view === b.id
                      ? "bg-[rgba(201,168,76,0.18)] text-[var(--accent-gold)] ring-1 ring-inset ring-[var(--accent-gold)]/40"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                  ].join(" ")}
                >
                  {b.label}
                </button>
              ))}
            </div>
            {view === "crm" && (
              <div className="inline-flex flex-wrap gap-1 rounded-lg border border-[var(--border)]/80 bg-[var(--bg-elevated)]/30 p-0.5">
                {crmSubModes.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setMode(b.id)}
                    className={[
                      "rounded-md px-3 py-1.5 text-xs font-medium transition",
                      mode === b.id
                        ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm"
                        : "text-[var(--text-secondary)]",
                    ].join(" ")}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {err && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-200">{err}</div>
      )}

      <div className="flex min-h-0 flex-col gap-4 lg:flex-row">
        <div className="relative h-[60vh] min-h-[420px] w-full flex-1 overflow-hidden rounded-2xl">
          {data && (
            <MunicipalMap
              forMap={data.forMap}
              onSelect={onSelectMuni}
              colorVariant={data.mapColorVariant ?? "gold"}
              tooltipMode={view}
            />
          )}
          <div
            className="pointer-events-none absolute bottom-3 left-3 z-[500] max-w-[min(100%,220px)] rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/95 px-3 py-2.5 text-[10px] text-[var(--text-secondary)] shadow-md backdrop-blur-md"
            role="img"
            aria-label="Υπόμνημα"
          >
            <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Υπόμνημα</p>
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
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            {view === "electoral" ? "Κορυφαίοι δήμοι (ΝΔ 2023)" : view === "compare" ? "Top 10 (επαφές CRM)" : "Top 10 δήμων"}
          </h2>
          {top.length === 0 && !err && (
            <p className="text-sm text-[var(--text-muted)]">Φόρτωση…</p>
          )}
          <ol className="space-y-3">
            {top.map((r, i) => {
              const elec = r as MuniRow & { ndPercent?: number };
              const barVal = view === "electoral" && typeof elec.ndPercent === "number" ? elec.ndPercent : r.total;
              const barMax = view === "electoral" ? 100 : maxTop;
              return (
              <li key={r.muni} className="min-w-0">
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[var(--text-primary)]" title={r.muni}>
                    {i + 1}. {muniShort(r.muni)}
                  </span>
                  <span className="shrink-0 text-[12px] tabular-nums text-[var(--accent-gold)]">
                    {view === "electoral" && typeof elec.ndPercent === "number"
                      ? `${elec.ndPercent.toFixed(1)}% ΝΔ`
                      : r.total}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#1e3a8a] to-[#3b82f6] shadow-[0_0_12px_rgba(30,58,138,0.4)]"
                    style={{
                      width: `${Math.min(100, view === "electoral" ? barVal : (barVal / barMax) * 100)}%`,
                    }}
                  />
                </div>
              </li>
            )})}
          </ol>
        </aside>
      </div>
    </div>
  );
}
