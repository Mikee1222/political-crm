"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import * as XLSX from "xlsx";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { PageHeader } from "@/components/ui/page-header";
import { useFormToast } from "@/contexts/form-toast-context";
import { BarChart3, Download, HelpCircle } from "lucide-react";
import { useOptionalAlexandraPageContext } from "@/contexts/alexandra-page-context";

const GOLD = "#C9A84C";
const NAVY = "#0A1628";
const NAVY_MID = "#1e5fa8";
const RED = "#DC2626";
const MUTED = "#64748b";
const CHART_CYCL = [GOLD, NAVY_MID, NAVY, RED, "#2dd4bf", "#8B6914", "#E8C96B", "#3B5F8A", "#94A3B8"];

type Trend = "up" | "down" | "flat";
type RangeKey = "7d" | "30d" | "90d" | "6mo" | "1yr" | "custom";

type NV = { name: string; value: number; color?: string | null };
type AnalyticsPayload = {
  range?: { key: RangeKey; from: string; to: string; days: number };
  meta?: Record<string, unknown>;
  kpis?: {
    totalContacts: number;
    newContacts30d: number;
    newContactsTrend: Trend;
    positiveCount: number;
    positivePercent: number;
    positiveTrend: Trend;
    completedRequests: number;
    completedRequestsTrend: Trend;
    totalRequests: number;
    openRequests: number;
    calls30d: number;
    callsTrend: Trend;
    noPhone: number;
    noPhonePercent: number;
    deceased: number;
    deceasedPercent: number;
    noNumber: number;
    noNumberPercent: number;
    negative: number;
    negativePercent: number;
  };
  byMunicipality: NV[];
  top10Municipalities?: NV[];
  byPoliticalStance: NV[];
  byCallStatus: NV[];
  byAgeGroup: NV[];
  callsOverTime: Array<{ date: string; count: number }>;
  campaignSuccess: Array<{ id: string; name: string; successRate: number; totalCalls: number }>;
  contactsPerWeek?: Array<{ weekStart: string; label: string; count: number }>;
  requestCategories?: NV[];
  muniPositiveRows?: Array<{ name: string; total: number; positive: number; rate: number }>;
  activityFeed?: Array<{ id: string; text: string; timeAgo: string }>;
  requestsByStatus?: NV[];
  requestsByMonth?: Array<{ monthStart: string; label: string; count: number }>;
  requestsByAssignee?: NV[];
  callsByUser?: NV[];
  callsByOutcome?: NV[];
  positiveByMonth?: Array<{ monthStart: string; label: string; newMembers: number; cumulative: number }>;
  topGroups?: NV[];
  requestsBySource?: NV[];
  municipalityBreakdown?: Array<{
    name: string;
    total: number;
    positive: number;
    negative: number;
    deceased: number;
    requests: number;
    positivePct: number;
  }>;
  activityTimeline?: Array<{
    weekStart: string;
    label: string;
    contacts: number;
    requests: number;
    calls: number;
  }>;
  namedaySummary?: {
    todayLabel: string;
    todayNames: string[];
    todayContactCount: number;
    weekNames: string[];
    weekContactCount: number;
    link: string;
    contactsTodayLink: string;
  };
};

const empty: AnalyticsPayload = {
  byMunicipality: [],
  top10Municipalities: [],
  byPoliticalStance: [],
  byCallStatus: [],
  byAgeGroup: [],
  callsOverTime: [],
  campaignSuccess: [],
  contactsPerWeek: [],
  requestCategories: [],
  muniPositiveRows: [],
  activityFeed: [],
  requestsByStatus: [],
  requestsByMonth: [],
  requestsByAssignee: [],
  callsByUser: [],
  callsByOutcome: [],
  positiveByMonth: [],
  topGroups: [],
  requestsBySource: [],
  municipalityBreakdown: [],
  activityTimeline: [],
};

const tooltipStyle = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: "0.5rem",
};

const RANGE_OPTIONS: Array<{ key: RangeKey; label: string }> = [
  { key: "7d", label: "7 ημ." },
  { key: "30d", label: "30 ημ." },
  { key: "90d", label: "90 ημ." },
  { key: "6mo", label: "6 μήνες" },
  { key: "1yr", label: "1 έτος" },
  { key: "custom", label: "Προσαρμογή" },
];

function TrendMark({ t }: { t: Trend | undefined }) {
  const dir = t ?? "flat";
  const cls =
    dir === "up" ? "text-emerald-400" : dir === "down" ? "text-red-400/90" : "text-[var(--text-muted)]";
  const sym = dir === "up" ? "↑" : dir === "down" ? "↓" : "→";
  return (
    <span className={["text-lg font-bold tabular-nums", cls].join(" ")} aria-hidden>
      {sym}
    </span>
  );
}

function ChartFrame({ h = 320, children }: { h?: number; children: React.ReactNode }) {
  return <div style={{ height: h }} className="relative w-full min-h-[260px] min-w-0">{children}</div>;
}

function NoChartData() {
  return (
    <div className="flex h-[260px] w-full items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-elevated)]/40 text-sm text-[var(--text-muted)]">
      Δεν υπάρχουν δεδομένα
    </div>
  );
}

function ChartSkeleton({ h = 280 }: { h?: number }) {
  return (
    <div
      className="animate-pulse rounded-xl bg-[var(--bg-elevated)]/60"
      style={{ height: h }}
      aria-hidden
    />
  );
}

function HelpTip({ text }: { text: string }) {
  return (
    <span className="group relative ml-1 inline-flex align-middle" title={text}>
      <HelpCircle className="h-3.5 w-3.5 text-[var(--text-muted)] opacity-70 transition group-hover:text-[#C9A84C]" />
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-56 -translate-x-1/2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-2 text-[11px] font-normal normal-case tracking-normal text-[var(--text-secondary)] shadow-lg group-hover:block">
        {text}
      </span>
    </span>
  );
}

function ChartCard({
  title,
  help,
  children,
  loading,
}: {
  title: string;
  help?: string;
  children: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-md md:p-5">
      <h2 className="mb-3 flex shrink-0 items-center text-xs font-bold uppercase tracking-[0.15em] text-[#C9A84C]">
        {title}
        {help ? <HelpTip text={help} /> : null}
      </h2>
      <div className="min-h-0 w-full min-w-0 flex-1">{loading ? <ChartSkeleton /> : children}</div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  trend,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  trend?: Trend;
  accent?: "gold" | "red" | "navy";
}) {
  const glow =
    accent === "red"
      ? "bg-red-500/10"
      : accent === "navy"
        ? "bg-[#1e5fa8]/15"
        : "bg-[#C9A84C]/10";
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-gradient-to-br from-[var(--bg-card)] to-[var(--bg-elevated)]/80 p-5 shadow-[0_4px_24px_rgba(0,0,0,0.2)]">
      <div className={`pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full ${glow} blur-2xl`} aria-hidden />
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className="text-3xl font-bold tabular-nums tracking-tight text-[var(--text-primary)] md:text-4xl">{value}</p>
        {trend ? <TrendMark t={trend} /> : null}
      </div>
      {sub ? <p className="mt-1 text-xs text-[var(--text-secondary)]">{sub}</p> : null}
    </div>
  );
}

function KpiSkeleton() {
  return <div className="h-[108px] animate-pulse rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)]/50" />;
}

type MuniSortKey = "name" | "total" | "positive" | "negative" | "deceased" | "requests" | "positivePct";

export default function AnalyticsPage() {
  const { showToast } = useFormToast();
  const alexPage = useOptionalAlexandraPageContext();
  const [data, setData] = useState<AnalyticsPayload>(empty);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeKey>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [muniSort, setMuniSort] = useState<{ key: MuniSortKey; dir: "asc" | "desc" }>({
    key: "total",
    dir: "desc",
  });

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    const qs = new URLSearchParams({ range });
    if (range === "custom" && customFrom && customTo) {
      qs.set("from", customFrom);
      qs.set("to", customTo);
    }
    const res = await fetchWithTimeout(`/api/analytics?${qs.toString()}`, { timeoutMs: 120_000 });
    const j = (await res.json()) as AnalyticsPayload & { error?: string };
    setLoading(false);
    if (!res.ok) {
      const msg = j.error ?? "Σφάλμα";
      setErr(msg);
      showToast(msg, "error");
      return;
    }
    setData({ ...empty, ...j });
  }, [showToast, range, customFrom, customTo]);

  useEffect(() => {
    if (range === "custom" && (!customFrom || !customTo)) return;
    void load();
  }, [load, range, customFrom, customTo]);

  const setPageContext = alexPage?.setPageContext;
  useEffect(() => {
    if (!setPageContext) return;
    setPageContext({ type: "analytics" });
    return () => setPageContext(null);
  }, [setPageContext]);

  const muni10 = useMemo(
    () => [...(data.top10Municipalities ?? [])].filter((d) => d.value > 0).sort((a, b) => b.value - a.value),
    [data.top10Municipalities],
  );
  const muni10h = useMemo(() => [...muni10].reverse(), [muni10]);
  const stanceV = useMemo(() => (data.byPoliticalStance ?? []).filter((d) => d.value > 0), [data.byPoliticalStance]);
  const callStatusV = useMemo(() => (data.byCallStatus ?? []).filter((d) => d.value > 0), [data.byCallStatus]);
  const ageV = useMemo(() => data.byAgeGroup ?? [], [data.byAgeGroup]);
  const callsT = useMemo(() => data.callsOverTime ?? [], [data.callsOverTime]);
  const weekV = useMemo(() => data.contactsPerWeek ?? [], [data.contactsPerWeek]);
  const reqCat = useMemo(() => [...(data.requestCategories ?? [])].reverse().slice(-15), [data.requestCategories]);
  const kpis = data.kpis;

  const sortedMuni = useMemo(() => {
    const rows = [...(data.municipalityBreakdown ?? [])];
    const { key, dir } = muniSort;
    rows.sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (typeof av === "string" && typeof bv === "string") {
        return dir === "asc" ? av.localeCompare(bv, "el") : bv.localeCompare(av, "el");
      }
      return dir === "asc" ? Number(av) - Number(bv) : Number(bv) - Number(av);
    });
    return rows;
  }, [data.municipalityBreakdown, muniSort]);

  function toggleMuniSort(key: MuniSortKey) {
    setMuniSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" },
    );
  }

  function exportExcel() {
    const wb = XLSX.utils.book_new();
    const kpiRows = [
      ["Μετρική", "Τιμή"],
      ["Σύνολο επαφών", kpis?.totalContacts ?? 0],
      ["Νέες 30ημ", kpis?.newContacts30d ?? 0],
      ["Θετικοί", kpis?.positiveCount ?? 0],
      ["Θετικοί %", kpis?.positivePercent ?? 0],
      ["Ολοκληρωμένα αιτήματα", kpis?.completedRequests ?? 0],
      ["Σύνολο αιτημάτων", kpis?.totalRequests ?? 0],
      ["Ανοικτά αιτήματα", kpis?.openRequests ?? 0],
      ["Κλήσεις 30ημ", kpis?.calls30d ?? 0],
      ["Χωρίς τηλέφωνο", kpis?.noPhone ?? 0],
      ["Αποβιώσαντες", kpis?.deceased ?? 0],
      ["Χωρίς αριθμό", kpis?.noNumber ?? 0],
      ["Αρνητικοί", kpis?.negative ?? 0],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(kpiRows), "KPIs");

    const sheet = (name: string, rows: Array<Record<string, unknown>>) => {
      if (!rows.length) return;
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name.slice(0, 31));
    };

    sheet(
      "Δήμοι",
      (data.municipalityBreakdown ?? []).map((r) => ({
        Δήμος: r.name,
        Σύνολο: r.total,
        Θετικοί: r.positive,
        Αρνητικοί: r.negative,
        Αποβιώσαντες: r.deceased,
        Αιτήματα: r.requests,
        "% Θετικοί": r.positivePct,
      })),
    );
    sheet(
      "Αιτήματα κατάσταση",
      (data.requestsByStatus ?? []).map((r) => ({ Κατάσταση: r.name, Πλήθος: r.value })),
    );
    sheet(
      "Αιτήματα μήνας",
      (data.requestsByMonth ?? []).map((r) => ({ Μήνας: r.label, Πλήθος: r.count })),
    );
    sheet(
      "Ομάδες",
      (data.topGroups ?? []).map((r) => ({ Ομάδα: r.name, Πλήθος: r.value })),
    );
    sheet(
      "Ηλικίες",
      (data.byAgeGroup ?? []).map((r) => ({ Ομάδα: r.name, Πλήθος: r.value })),
    );
    sheet(
      "Πηγές",
      (data.requestsBySource ?? []).map((r) => ({ Πηγή: r.name, Πλήθος: r.value })),
    );
    sheet(
      "Χρονολόγιο",
      (data.activityTimeline ?? []).map((r) => ({
        Εβδομάδα: r.label,
        Επαφές: r.contacts,
        Αιτήματα: r.requests,
        Κλήσεις: r.calls,
      })),
    );

    XLSX.writeFile(wb, `analytics-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast("Η αναφορά κατέβηκε", "success");
  }

  const hBar = (rows: NV[], reverse = true) => {
    const d = reverse ? [...rows].reverse() : rows;
    if (!d.length) return <NoChartData />;
    return (
      <ChartFrame>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={d} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
            <XAxis type="number" tick={{ fill: MUTED, fontSize: 11 }} />
            <YAxis type="category" dataKey="name" width={120} tick={{ fill: MUTED, fontSize: 10 }} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={20} isAnimationActive animationDuration={900}>
              {d.map((_, i) => (
                <Cell key={i} fill={CHART_CYCL[i % CHART_CYCL.length]!} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>
    );
  };

  const donut = (rows: NV[]) => {
    const d = rows.filter((r) => r.value > 0);
    if (!d.length) return <NoChartData />;
    return (
      <ChartFrame>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={d}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="46%"
              outerRadius="72%"
              paddingAngle={2}
              stroke="var(--border)"
              strokeWidth={1}
              isAnimationActive
              animationDuration={1000}
            >
              {d.map((_, i) => (
                <Cell key={i} fill={CHART_CYCL[i % CHART_CYCL.length]!} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </ChartFrame>
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-6 md:gap-8">
      <PageHeader
        title="Αναλυτικά"
        subtitle="Πλήρης εικόνα επαφών, κλήσεων, αιτημάτων και καμπανιών — ενημερώνεται από τη βάση σε πραγματικό χρόνο."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportExcel}
              disabled={loading}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-xs font-semibold text-[#C9A84C] transition hover:border-[#C9A84C]/50 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Εξαγωγή αναφοράς
            </button>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-[#C9A84C]">
              <BarChart3 className="h-5 w-5" />
            </div>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => setRange(opt.key)}
            className={[
              "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
              range === opt.key
                ? "border-[#C9A84C] bg-[#C9A84C]/15 text-[#C9A84C]"
                : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[#C9A84C]/40",
            ].join(" ")}
          >
            {opt.label}
          </button>
        ))}
        {range === "custom" ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5"
            />
            <span>—</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5"
            />
          </div>
        ) : null}
      </div>

      {err && <p className="text-sm text-red-400">{err}</p>}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-5">
        {loading && !kpis ? (
          Array.from({ length: 10 }).map((_, i) => <KpiSkeleton key={i} />)
        ) : (
          <>
            <KpiCard label="Σύνολο επαφών" value={String(kpis?.totalContacts ?? 0)} sub="Εγγεγραμμένες επαφές στο CRM" accent="navy" />
            <KpiCard
              label="Νέες (30 μέρες)"
              value={String(kpis?.newContacts30d ?? 0)}
              sub="Έναντι προηγούμενου 30ημέρου"
              trend={kpis?.newContactsTrend}
            />
            <KpiCard
              label="Θετικοί %"
              value={`${kpis?.positivePercent ?? 0}%`}
              sub={`${kpis?.positiveCount ?? 0} στην ομάδα ΘΕΤΙΚΟΣ`}
              accent="gold"
            />
            <KpiCard
              label="Ολοκληρωμένα αιτήματα"
              value={String(kpis?.completedRequests ?? 0)}
              sub="Επιτυχή · τάση 30ημ vs προηγ."
              trend={kpis?.completedRequestsTrend}
            />
            <KpiCard
              label="Σύνολο αιτημάτων"
              value={String(kpis?.totalRequests ?? 0)}
              sub={`${kpis?.openRequests ?? 0} ανοικτά / σε εξέλιξη`}
              accent="navy"
            />
            <KpiCard
              label="Κλήσεις (30 μέρες)"
              value={String(kpis?.calls30d ?? 0)}
              sub="Έναντι προηγούμενου 30ημέρου"
              trend={kpis?.callsTrend}
            />
            <KpiCard
              label="Χωρίς τηλέφωνο"
              value={String(kpis?.noPhone ?? 0)}
              sub={`${kpis?.noPhonePercent ?? 0}% του συνόλου`}
            />
            <KpiCard
              label="Αποβιώσαντες"
              value={String(kpis?.deceased ?? 0)}
              sub={`${kpis?.deceasedPercent ?? 0}% · ομάδα ΑΠΕΒΙΩΣΕ`}
              accent="red"
            />
            <KpiCard
              label="Χωρίς αριθμό"
              value={String(kpis?.noNumber ?? 0)}
              sub={`${kpis?.noNumberPercent ?? 0}% · ομάδα ΧΩΡΙΣ ΑΡΙΘΜΟ`}
            />
            <KpiCard
              label="Αρνητικοί"
              value={String(kpis?.negative ?? 0)}
              sub={`${kpis?.negativePercent ?? 0}% · ομάδα ΑΡΝΗΤΙΚΟΣ`}
              accent="red"
            />
          </>
        )}
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        <ChartCard title="Επαφές ανά δήμο (κορυφαίοι 10)" help="Top 10 δήμοι κατά αριθμό επαφών." loading={loading}>
          {muni10h.length === 0 ? <NoChartData /> : (
            <ChartFrame>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={muni10h} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
                  <XAxis type="number" tick={{ fill: MUTED, fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={108} tick={{ fill: MUTED, fontSize: 10 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={22} isAnimationActive animationDuration={900}>
                    {muni10h.map((_, i) => (
                      <Cell key={i} fill={CHART_CYCL[i % CHART_CYCL.length]!} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
          )}
        </ChartCard>

        <ChartCard title="Κατανομή κατάστασης κλήσης" help="call_status στις επαφές." loading={loading}>
          {donut(callStatusV)}
        </ChartCard>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        <ChartCard title="Πολιτική στάση / ομάδες" help="Κατανομή μελών μέσω contact_group_members." loading={loading}>
          {stanceV.length === 0 ? <NoChartData /> : (
            <ChartFrame>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stanceV}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius="78%"
                    paddingAngle={1.5}
                    stroke="var(--border)"
                    strokeWidth={1}
                    isAnimationActive
                    animationDuration={1000}
                  >
                    {stanceV.map((_, i) => (
                      <Cell key={i} fill={CHART_CYCL[i % CHART_CYCL.length]!} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </ChartFrame>
          )}
        </ChartCard>

        <ChartCard
          title="Κατανομή ηλικιών"
          help="Buckets: 18-25 … 75+, Άγνωστο (και <18 αν υπάρχουν)."
          loading={loading}
        >
          {ageV.length === 0 ? <NoChartData /> : (
            <ChartFrame>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ageV} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.35} />
                  <XAxis dataKey="name" tick={{ fill: MUTED, fontSize: 10 }} />
                  <YAxis tick={{ fill: MUTED, fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} isAnimationActive animationDuration={900}>
                    {ageV.map((_, i) => (
                      <Cell key={i} fill={i % 2 === 0 ? NAVY_MID : GOLD} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
          )}
        </ChartCard>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        <ChartCard title="Αιτήματα ανά κατάσταση" help="Κανονικοποιημένες καταστάσεις αιτημάτων." loading={loading}>
          {donut(data.requestsByStatus ?? [])}
        </ChartCard>
        <ChartCard title="Αιτήματα ανά μήνα" help="created_at αιτημάτων · τελευταίοι 12 μήνες." loading={loading}>
          {(data.requestsByMonth ?? []).length === 0 ? <NoChartData /> : (
            <ChartFrame>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.requestsByMonth} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.35} />
                  <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 10 }} />
                  <YAxis tick={{ fill: MUTED, fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" fill={NAVY_MID} radius={[6, 6, 0, 0]} isAnimationActive animationDuration={900} />
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
          )}
        </ChartCard>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        <ChartCard title="Αιτήματα ανά χειριστή" help="requests.assigned_to (κειμενικό πεδίο)." loading={loading}>
          {hBar((data.requestsByAssignee ?? []).slice(0, 15))}
        </ChartCard>
        <ChartCard
          title="Κλήσεις ανά χειριστή"
          help="calls.marked_by_user_id → profiles (fallback marked_by_name)."
          loading={loading}
        >
          {hBar((data.callsByUser ?? []).slice(0, 15))}
        </ChartCard>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        <ChartCard title="Κλήσεις ανά αποτέλεσμα" help="calls.outcome." loading={loading}>
          {donut(data.callsByOutcome ?? [])}
        </ChartCard>
        <ChartCard
          title="Εξέλιξη θετικών ανά μήνα"
          help="Αθροιστικά μέλη ΘΕΤΙΚΟΣ από contact_group_members.created_at (bulk import μπορεί να εμφανίζει spike σε έναν μήνα)."
          loading={loading}
        >
          {(data.positiveByMonth ?? []).length === 0 ? <NoChartData /> : (
            <ChartFrame>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.positiveByMonth} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.35} />
                  <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 10 }} />
                  <YAxis tick={{ fill: MUTED, fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line
                    type="monotone"
                    dataKey="cumulative"
                    name="Αθροιστικά"
                    stroke={GOLD}
                    strokeWidth={2.5}
                    dot={{ fill: NAVY, r: 3 }}
                    isAnimationActive
                    animationDuration={1100}
                  />
                  <Line
                    type="monotone"
                    dataKey="newMembers"
                    name="Νέα"
                    stroke={NAVY_MID}
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                  <Legend />
                </LineChart>
              </ResponsiveContainer>
            </ChartFrame>
          )}
        </ChartCard>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        <ChartCard title="Top 10 ομάδες" help="Μέλη ανά ομάδα (junction)." loading={loading}>
          {hBar((data.topGroups ?? []).slice(0, 10))}
        </ChartCard>
        <ChartCard
          title="Αιτήματα ανά πηγή"
          help="Η στήλη source δεν υπάρχει στο requests — απόδοση μέσω επαφής (contact.source)."
          loading={loading}
        >
          {donut((data.requestsBySource ?? []).slice(0, 12))}
        </ChartCard>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        <ChartCard title="Κλήσεις ανά ημέρα" help="Κλήσεις στο επιλεγμένο εύρος ημερομηνιών." loading={loading}>
          {callsT.length === 0 ? <NoChartData /> : (
            <ChartFrame>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={callsT} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.35} />
                  <XAxis dataKey="date" tick={{ fill: MUTED, fontSize: 10 }} />
                  <YAxis tick={{ fill: MUTED, fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke={GOLD}
                    strokeWidth={2.5}
                    dot={{ fill: NAVY, r: 3, stroke: GOLD, strokeWidth: 1 }}
                    isAnimationActive
                    animationDuration={1200}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartFrame>
          )}
        </ChartCard>

        <ChartCard title="Απόδοση καμπανιών (θετικό %)" loading={loading}>
          {(data.campaignSuccess ?? []).length === 0 ? <NoChartData /> : (
            <ChartFrame h={340}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.campaignSuccess.map((c) => ({
                    name: c.name.length > 26 ? `${c.name.slice(0, 24)}…` : c.name,
                    fullName: c.name,
                    successRate: c.successRate,
                    total: c.totalCalls,
                  }))}
                  margin={{ top: 4, right: 8, left: 0, bottom: 52 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.35} />
                  <XAxis dataKey="name" angle={-28} textAnchor="end" height={68} tick={{ fill: MUTED, fontSize: 10 }} interval={0} />
                  <YAxis tick={{ fill: MUTED, fontSize: 11 }} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: number) => [`${value}%`, "Θετικό %"]}
                    labelFormatter={(_l, payload) => (payload?.[0]?.payload as { fullName?: string })?.fullName ?? ""}
                  />
                  <Bar dataKey="successRate" radius={[6, 6, 0, 0]} maxBarSize={36} isAnimationActive animationDuration={900}>
                    {data.campaignSuccess.map((_, i) => (
                      <Cell key={i} fill={i % 2 === 0 ? NAVY : GOLD} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
          )}
        </ChartCard>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        <ChartCard title="Νέες επαφές ανά εβδομάδα (12 εβδομάδες)" loading={loading}>
          {weekV.length === 0 ? <NoChartData /> : (
            <ChartFrame>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weekV} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <defs>
                    <linearGradient id="wkFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={GOLD} stopOpacity={0.45} />
                      <stop offset="100%" stopColor={GOLD} stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.35} />
                  <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 10 }} />
                  <YAxis tick={{ fill: MUTED, fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="count" stroke={GOLD} strokeWidth={2} fill="url(#wkFill)" isAnimationActive animationDuration={1100} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartFrame>
          )}
        </ChartCard>

        <ChartCard title="Αιτήματα ανά κατηγορία" loading={loading}>
          {reqCat.length === 0 ? <NoChartData /> : hBar(reqCat)}
        </ChartCard>
      </div>

      <ChartCard
        title="Χρονολόγιο δραστηριότητας"
        help="Σωρευτική εβδομαδιαία δραστηριότητα: νέες επαφές, αιτήματα, κλήσεις (~6 μήνες)."
        loading={loading}
      >
        {(data.activityTimeline ?? []).length === 0 ? <NoChartData /> : (
          <ChartFrame h={360}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.activityTimeline} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.35} />
                <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 10 }} />
                <YAxis tick={{ fill: MUTED, fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                <Area type="monotone" dataKey="contacts" stackId="1" name="Επαφές" stroke={GOLD} fill={GOLD} fillOpacity={0.55} />
                <Area type="monotone" dataKey="requests" stackId="1" name="Αιτήματα" stroke={NAVY_MID} fill={NAVY_MID} fillOpacity={0.55} />
                <Area type="monotone" dataKey="calls" stackId="1" name="Κλήσεις" stroke={RED} fill={RED} fillOpacity={0.45} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartFrame>
        )}
      </ChartCard>

      <ChartCard
        title="Γεωγραφική κατανομή"
        help="Όλοι οι δήμοι: σύνολο, θετικοί/αρνητικοί/αποβιώσαντες (ομάδες), αιτήματα. Κλικ στις κεφαλίδες για ταξινόμηση."
        loading={loading}
      >
        {sortedMuni.length === 0 ? (
          <NoChartData />
        ) : (
          <div className="max-h-[480px] overflow-auto rounded-xl border border-[var(--border)]/60">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-[var(--bg-card)]">
                <tr className="border-b border-[var(--border)] text-left text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                  {(
                    [
                      ["name", "Δήμος"],
                      ["total", "Σύνολο"],
                      ["positive", "Θετικοί"],
                      ["negative", "Αρνητικοί"],
                      ["deceased", "Αποβιώσαντες"],
                      ["requests", "Αιτήματα"],
                      ["positivePct", "% Θετικοί"],
                    ] as Array<[MuniSortKey, string]>
                  ).map(([key, label]) => (
                    <th key={key} className="cursor-pointer px-3 py-2 hover:text-[#C9A84C]" onClick={() => toggleMuniSort(key)}>
                      {label}
                      {muniSort.key === key ? (muniSort.dir === "asc" ? " ↑" : " ↓") : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedMuni.map((row) => (
                  <tr key={row.name} className="border-b border-[var(--border)]/50 last:border-0">
                    <td className="max-w-[160px] truncate px-3 py-2 font-medium text-[var(--text-primary)]">{row.name}</td>
                    <td className="px-3 py-2 tabular-nums text-[var(--text-secondary)]">{row.total}</td>
                    <td className="px-3 py-2 tabular-nums text-[#C9A84C]">{row.positive}</td>
                    <td className="px-3 py-2 tabular-nums text-red-400">{row.negative}</td>
                    <td className="px-3 py-2 tabular-nums text-[var(--text-secondary)]">{row.deceased}</td>
                    <td className="px-3 py-2 tabular-nums text-[var(--text-secondary)]">{row.requests}</td>
                    <td className="px-3 py-2 font-semibold tabular-nums text-[#C9A84C]">{row.positivePct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>

      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        <ChartCard title="Δήμοι με υψηλότερο ποσοστό θετικών" loading={loading}>
          {(data.muniPositiveRows ?? []).length === 0 ? (
            <NoChartData />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[var(--border)]/60">
              <table className="w-full min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                    <th className="px-3 py-2">Δήμος</th>
                    <th className="px-3 py-2 text-right">Θετικοί</th>
                    <th className="px-3 py-2 text-right">Σύνολο</th>
                    <th className="px-3 py-2 text-right">%</th>
                    <th className="min-w-[120px] px-3 py-2">Ράβδος</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.muniPositiveRows ?? []).map((row) => (
                    <tr key={row.name} className="border-b border-[var(--border)]/50 last:border-0">
                      <td className="max-w-[140px] truncate px-3 py-2 font-medium text-[var(--text-primary)]">{row.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">{row.positive}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">{row.total}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-[#C9A84C]">{row.rate}%</td>
                      <td className="px-3 py-2">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-elevated)]">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[#1e5fa8] to-[#C9A84C] transition-all"
                            style={{ width: `${Math.min(100, row.rate)}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Σύνοψη εορτολογίου" help="Ονόματα ημερολογίου σήμερα / εβδομάδα + σύνδεσμοι." loading={loading}>
          {!data.namedaySummary ? (
            <NoChartData />
          ) : (
            <div className="space-y-4 text-sm text-[var(--text-primary)]">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Σήμερα · {data.namedaySummary.todayLabel}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-[#C9A84C]">{data.namedaySummary.todayContactCount}</p>
                <p className="text-xs text-[var(--text-secondary)]">επαφές που εορτάζουν (ονομαστική αντιστοίχιση)</p>
                <p className="mt-2 text-xs text-[var(--text-secondary)]">
                  {(data.namedaySummary.todayNames ?? []).slice(0, 12).join(", ") || "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Εβδομάδα (ονόματα ημερολογίου)</p>
                <p className="mt-2 text-xs text-[var(--text-secondary)]">
                  {(data.namedaySummary.weekNames ?? []).slice(0, 24).join(", ") || "—"}
                </p>
              </div>
              <div className="flex flex-wrap gap-3 pt-1">
                <Link href={data.namedaySummary.contactsTodayLink} className="text-xs font-semibold text-[#C9A84C] underline-offset-2 hover:underline">
                  Επαφές που εορτάζουν σήμερα →
                </Link>
                <Link href={data.namedaySummary.link} className="text-xs font-semibold text-[var(--text-secondary)] underline-offset-2 hover:underline">
                  Πλήρες εορτολόγιο →
                </Link>
              </div>
            </div>
          )}
        </ChartCard>
      </div>

      <ChartCard title="Πρόσφατη δραστηριότητα" loading={loading}>
        {(data.activityFeed ?? []).length === 0 ? (
          <NoChartData />
        ) : (
          <ul className="max-h-[320px] space-y-2 overflow-y-auto pr-1 text-sm">
            {(data.activityFeed ?? []).map((a) => (
              <li
                key={a.id}
                className="rounded-xl border border-[var(--border)]/70 bg-[var(--bg-elevated)]/40 px-3 py-2.5 text-[var(--text-primary)]"
              >
                <p className="leading-snug">{a.text}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{a.timeAgo}</p>
              </li>
            ))}
          </ul>
        )}
      </ChartCard>
    </div>
  );
}
