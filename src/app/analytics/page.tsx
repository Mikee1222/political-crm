"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { PageHeader } from "@/components/ui/page-header";
import { useFormToast } from "@/contexts/form-toast-context";
import { BarChart3 } from "lucide-react";

const GOLD = "#C9A84C";
const NAVY = "#0A1628";
const NAVY_MID = "#1e5fa8";
const MUTED = "#64748b";
const CHART_CYCL = [GOLD, NAVY_MID, NAVY, "#2dd4bf", "#8B6914", "#E8C96B", "#3B5F8A", "#94A3B8"];

type Trend = "up" | "down" | "flat";

type AnalyticsPayload = {
  kpis?: {
    totalContacts: number;
    newContacts30d: number;
    newContactsTrend: Trend;
    positivePercent: number;
    positiveTrend: Trend;
    completedRequests: number;
    completedRequestsTrend: Trend;
  };
  byMunicipality: Array<{ name: string; value: number }>;
  top10Municipalities?: Array<{ name: string; value: number }>;
  byPoliticalStance: Array<{ name: string; value: number }>;
  byCallStatus: Array<{ name: string; value: number }>;
  byAgeGroup: Array<{ name: string; value: number }>;
  callsOverTime: Array<{ date: string; count: number }>;
  campaignSuccess: Array<{ id: string; name: string; successRate: number; totalCalls: number }>;
  contactsPerWeek?: Array<{ weekStart: string; label: string; count: number }>;
  requestCategories?: Array<{ name: string; value: number }>;
  muniPositiveRows?: Array<{ name: string; total: number; positive: number; rate: number }>;
  activityFeed?: Array<{ id: string; text: string; timeAgo: string }>;
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
};

const tooltipStyle = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: "0.5rem",
};

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

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-md md:p-5">
      <h2 className="mb-3 shrink-0 text-xs font-bold uppercase tracking-[0.15em] text-[#C9A84C]">{title}</h2>
      <div className="min-h-0 w-full min-w-0 flex-1">{children}</div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  trend,
}: {
  label: string;
  value: string;
  sub?: string;
  trend?: Trend;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-gradient-to-br from-[var(--bg-card)] to-[var(--bg-elevated)]/80 p-5 shadow-[0_4px_24px_rgba(0,0,0,0.2)]">
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-[#C9A84C]/10 blur-2xl" aria-hidden />
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className="text-3xl font-bold tabular-nums tracking-tight text-[var(--text-primary)] md:text-4xl">{value}</p>
        {trend ? <TrendMark t={trend} /> : null}
      </div>
      {sub ? <p className="mt-1 text-xs text-[var(--text-secondary)]">{sub}</p> : null}
    </div>
  );
}

export default function AnalyticsPage() {
  const { showToast } = useFormToast();
  const [data, setData] = useState<AnalyticsPayload>(empty);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    const res = await fetchWithTimeout("/api/analytics");
    const j = (await res.json()) as AnalyticsPayload & { error?: string };
    if (!res.ok) {
      const msg = j.error ?? "Σφάλμα";
      setErr(msg);
      showToast(msg, "error");
      return;
    }
    setData({
      kpis: j.kpis,
      byMunicipality: j.byMunicipality ?? [],
      top10Municipalities: j.top10Municipalities ?? j.byMunicipality?.slice(0, 10) ?? [],
      byPoliticalStance: j.byPoliticalStance ?? [],
      byCallStatus: j.byCallStatus ?? [],
      byAgeGroup: j.byAgeGroup ?? [],
      callsOverTime: j.callsOverTime ?? [],
      campaignSuccess: j.campaignSuccess ?? [],
      contactsPerWeek: j.contactsPerWeek ?? [],
      requestCategories: j.requestCategories ?? [],
      muniPositiveRows: j.muniPositiveRows ?? [],
      activityFeed: j.activityFeed ?? [],
    });
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const muni10 = useMemo(
    () => [...(data.top10Municipalities ?? [])].filter((d) => d.value > 0).sort((a, b) => b.value - a.value),
    [data.top10Municipalities],
  );
  const muni10h = useMemo(() => [...muni10].reverse(), [muni10]);
  const stanceV = useMemo(() => (data.byPoliticalStance ?? []).filter((d) => d.value > 0), [data.byPoliticalStance]);
  const callStatusV = useMemo(() => (data.byCallStatus ?? []).filter((d) => d.value > 0), [data.byCallStatus]);
  const ageV = useMemo(() => (data.byAgeGroup ?? []).filter((d) => d.value > 0), [data.byAgeGroup]);
  const callsT = useMemo(() => data.callsOverTime ?? [], [data.callsOverTime]);
  const weekV = useMemo(() => data.contactsPerWeek ?? [], [data.contactsPerWeek]);
  const reqCat = useMemo(() => [...(data.requestCategories ?? [])].reverse().slice(-15), [data.requestCategories]);
  const kpis = data.kpis;

  return (
    <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-6 md:gap-8">
      <PageHeader
        title="Αναλυτικά"
        subtitle="Πλήρης εικόνα επαφών, κλήσεων, αιτημάτων και καμπανιών — ενημερώνεται από τη βάση σε πραγματικό χρόνο."
        actions={
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-[#C9A84C]">
            <BarChart3 className="h-5 w-5" />
          </div>
        }
      />
      {err && <p className="text-sm text-red-400">{err}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Σύνολο επαφών"
          value={String(kpis?.totalContacts ?? 0)}
          sub="Εγγεγραμμένες επαφές στο CRM"
        />
        <KpiCard
          label="Νέες (τελευταίες 30 μέρες)"
          value={String(kpis?.newContacts30d ?? 0)}
          sub="Έναντι προηγούμενου 30ημέρου"
          trend={kpis?.newContactsTrend}
        />
        <KpiCard
          label="Θετικοί %"
          value={`${kpis?.positivePercent ?? 0}%`}
          sub="Επαφές με κατάσταση «Θετικό» / σύνολο"
          trend={kpis?.positiveTrend}
        />
        <KpiCard
          label="Ολοκληρωμένα αιτήματα"
          value={String(kpis?.completedRequests ?? 0)}
          sub="Κατάσταση «Ολοκληρώθηκε» · ρυθμός ενημέρωσης"
          trend={kpis?.completedRequestsTrend}
        />
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        <ChartCard title="Επαφές ανά δήμο (κορυφαίοι 10)">
          {muni10h.length === 0 ? (
            <NoChartData />
          ) : (
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

        <ChartCard title="Κατανομή κατάστασης κλήσης">
          {callStatusV.length === 0 ? (
            <NoChartData />
          ) : (
            <ChartFrame>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={callStatusV}
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
                    {callStatusV.map((_, i) => (
                      <Cell key={i} fill={CHART_CYCL[i % CHART_CYCL.length]!} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v: number, _n, p) => [v, (p?.payload as { name?: string })?.name ?? ""]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </ChartFrame>
          )}
        </ChartCard>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        <ChartCard title="Πολιτική στάση">
          {stanceV.length === 0 ? (
            <NoChartData />
          ) : (
            <ChartFrame>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stanceV}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius="0%"
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

        <ChartCard title="Ηλικιακές ομάδες">
          {ageV.length === 0 ? (
            <NoChartData />
          ) : (
            <ChartFrame>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ageV} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.35} />
                  <XAxis dataKey="name" tick={{ fill: MUTED, fontSize: 11 }} />
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
        <ChartCard title="Κλήσεις ανά ημέρα (30 ημέρες)">
          {callsT.length === 0 ? (
            <NoChartData />
          ) : (
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
                    activeDot={{ r: 5, fill: GOLD }}
                    isAnimationActive
                    animationDuration={1200}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartFrame>
          )}
        </ChartCard>

        <ChartCard title="Απόδοση καμπανιών (θετικό %)">
          {(data.campaignSuccess ?? []).length === 0 ? (
            <NoChartData />
          ) : (
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
                  <XAxis
                    dataKey="name"
                    angle={-28}
                    textAnchor="end"
                    height={68}
                    tick={{ fill: MUTED, fontSize: 10 }}
                    interval={0}
                  />
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
        <ChartCard title="Νέες επαφές ανά εβδομάδα (12 εβδομάδες)">
          {weekV.length === 0 ? (
            <NoChartData />
          ) : (
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
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke={GOLD}
                    strokeWidth={2}
                    fill="url(#wkFill)"
                    isAnimationActive
                    animationDuration={1100}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartFrame>
          )}
        </ChartCard>

        <ChartCard title="Αιτήματα ανά κατηγορία">
          {reqCat.length === 0 ? (
            <NoChartData />
          ) : (
            <ChartFrame>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={reqCat} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
                  <XAxis type="number" tick={{ fill: MUTED, fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fill: MUTED, fontSize: 10 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={20} isAnimationActive animationDuration={900}>
                    {reqCat.map((_, i) => (
                      <Cell key={i} fill={CHART_CYCL[i % CHART_CYCL.length]!} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
          )}
        </ChartCard>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        <ChartCard title="Δήμοι με υψηλότερο ποσοστό θετικών">
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

        <ChartCard title="Πρόσφατη δραστηριότητα">
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
    </div>
  );
}
