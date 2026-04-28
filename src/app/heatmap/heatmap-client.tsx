"use client";

import type { ComponentType } from "react";
import { useCallback, useEffect, useState } from "react";
import { fetchWithTimeout } from "@/lib/client-fetch";
import type { DynamicMapProps } from "@/components/map/DynamicMap";
import { lux } from "@/lib/luxury-styles";
import { hasMinRole } from "@/lib/roles";
import { useProfile } from "@/contexts/profile-context";

export type MapMode = "contacts" | "positive" | "negative";

export type ForMapRow = {
  muni: string;
  total: number;
  positive: number;
  negative: number;
  pending: number;
  noAnswer: number;
  heat: number;
  lat: number;
  lng: number;
  radius: number;
  ndPercent?: number;
  syrizaPercent?: number;
  pasokPercent?: number;
  totalElectionVotes?: number;
  crmPositivePercent?: number;
  compareHighlight?: boolean;
};

export type MapColorVariant = "gold" | "nd" | "compare";

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
  maxCount?: number;
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

export function HeatmapClient({ DynamicMap }: { DynamicMap: ComponentType<DynamicMapProps> }) {
  const { profile, loading: profileLoading } = useProfile();
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
  const maxHeat = Math.max(1, data?.maxCount ?? data?.maxTotal ?? 1);

  const markers: HeatmapMarker[] = (data?.forMap ?? []).map((r) => ({
    lat: r.lat,
    lng: r.lng,
    muni: r.muni,
    total: r.total,
    heat: r.heat,
  }));

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
        <div className="relative w-full min-h-[500px] flex-1 overflow-hidden rounded-2xl">
          {data ? <DynamicMap markers={markers} maxHeat={maxHeat} /> : null}
          {!data && !err && (
            <div
              className="flex w-full items-center justify-center rounded-2xl border border-[var(--border)] bg-[#0a0f1a]/50 text-sm text-[var(--text-secondary)]"
              style={{ height: 500, width: "100%" }}
            >
              Φόρτωση δεδομένων χάρτη…
            </div>
          )}
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
              );
            })}
          </ol>
        </aside>
      </div>
    </div>
  );
}
