"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
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
import { HqSelect } from "@/components/ui/hq-select";
import { useFormToast } from "@/contexts/form-toast-context";
import { lux } from "@/lib/luxury-styles";
import { BarChart3 } from "lucide-react";

/** Gold + navy + accents — matches luxury theme */
const CHART = ["#C9A84C", "#1e5fa8", "#0A1628", "#2dd4bf", "#8B6914", "#E8C96B", "#3B5F8A", "#94A3B8", "#059669", "#7C3AED"];

type AnalyticsPayload = {
  byMunicipality: Array<{ name: string; value: number }>;
  byPoliticalStance: Array<{ name: string; value: number }>;
  byCallStatus: Array<{ name: string; value: number }>;
  byAgeGroup: Array<{ name: string; value: number }>;
  callsOverTime: Array<{ date: string; count: number }>;
  campaignSuccess: Array<{ id: string; name: string; successRate: number; totalCalls: number }>;
};

const empty: AnalyticsPayload = {
  byMunicipality: [],
  byPoliticalStance: [],
  byCallStatus: [],
  byAgeGroup: [],
  callsOverTime: [],
  campaignSuccess: [],
};

const tooltipStyle = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: "0.5rem",
};

function ChartFrame({ children }: { children: React.ReactNode }) {
  return <div className="relative h-[min(400px,55vh)] w-full min-h-[300px] sm:min-h-[320px]">{children}</div>;
}

function NoChartData() {
  return (
    <div className="flex h-[min(360px,50vh)] min-h-[220px] w-full items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-elevated)]/40 text-sm text-[var(--text-muted)]">
      Δεν υπάρχουν δεδομένα
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-md md:p-5">
      <h2 className="mb-3 shrink-0 text-sm font-bold uppercase tracking-wider text-[#C9A84C]">{title}</h2>
      <div className="min-h-0 w-full min-w-0 flex-1">{children}</div>
    </div>
  );
}

type ChartScope = "all" | "geo" | "trends";

export default function AnalyticsPage() {
  const { showToast } = useFormToast();
  const [data, setData] = useState<AnalyticsPayload>(empty);
  const [err, setErr] = useState<string | null>(null);
  const [chartScope, setChartScope] = useState<ChartScope>("all");

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
      byMunicipality: j.byMunicipality ?? [],
      byPoliticalStance: j.byPoliticalStance ?? [],
      byCallStatus: j.byCallStatus ?? [],
      byAgeGroup: j.byAgeGroup ?? [],
      callsOverTime: j.callsOverTime ?? [],
      campaignSuccess: j.campaignSuccess ?? [],
    });
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const muniV = useMemo(() => [...(data.byMunicipality ?? [])].reverse().filter((d) => d.value > 0), [data.byMunicipality]);
  const stanceV = useMemo(() => (data.byPoliticalStance ?? []).filter((d) => d.value > 0), [data.byPoliticalStance]);
  const callStatusV = useMemo(() => (data.byCallStatus ?? []).filter((d) => d.value > 0), [data.byCallStatus]);
  const ageV = useMemo(() => (data.byAgeGroup ?? []).filter((d) => d.value > 0), [data.byAgeGroup]);
  const callsT = useMemo(() => data.callsOverTime ?? [], [data.callsOverTime]);

  return (
    <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-6 md:gap-8">
      <PageHeader
        title="Αναλυτικά"
        subtitle="Συγκεντρωτική εικόνα επαφών και καμπανιών (ελληνικά)"
        actions={
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-[#C9A84C]">
            <BarChart3 className="h-5 w-5" />
          </div>
        }
      />
      {err && <p className="text-sm text-red-400">{err}</p>}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 max-w-xs flex-1">
          <label className={lux.label} htmlFor="analytics-scope">
            Φίλτρο διαγραμμάτων
          </label>
          <HqSelect
            id="analytics-scope"
            className={lux.select + " mt-1"}
            value={chartScope}
            onChange={(e) => setChartScope(e.target.value as ChartScope)}
          >
            <option value="all">Όλα</option>
            <option value="geo">Δήμοι, στάση, κλήσεις, ηλικίες</option>
            <option value="trends">Κλήσεις 30 ημ. & καμπάνιες</option>
          </HqSelect>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 md:gap-6 lg:grid-cols-2 lg:items-stretch">
        {(chartScope === "all" || chartScope === "geo") && (
        <ChartCard title="Επαφές ανά δήμο (πρώτοι 15)">
          {muniV.length === 0 ? (
            <NoChartData />
          ) : (
            <ChartFrame>
              <ResponsiveContainer width="100%" height="100%" minHeight={300}>
                <BarChart
                  data={muniV}
                  layout="vertical"
                  margin={{ top: 4, right: 8, left: 4, bottom: 4 }}
                >
                  <XAxis type="number" tick={{ fill: "var(--text-secondary)", fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={110}
                    tick={{ fill: "var(--text-secondary)", fontSize: 10 }}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: "var(--text-primary)" }}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={24}>
                    {muniV.map((_, i) => (
                      <Cell key={i} fill={CHART[i % CHART.length]!} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
          )}
        </ChartCard>
        )}

        {(chartScope === "all" || chartScope === "geo") && (
        <ChartCard title="Πολιτική στάση">
          {stanceV.length === 0 ? (
            <NoChartData />
          ) : (
            <ChartFrame>
              <ResponsiveContainer width="100%" height="100%" minHeight={300}>
                <PieChart>
                  <Pie
                    data={stanceV}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius="42%"
                    outerRadius="72%"
                    paddingAngle={2}
                    stroke="var(--border)"
                    strokeWidth={1}
                  >
                    {stanceV.map((_, i) => (
                      <Cell key={i} fill={CHART[i % CHART.length]!} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v: number, _n, p) => [
                      v,
                      (p?.payload as { name?: string })?.name ?? "",
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </ChartFrame>
          )}
        </ChartCard>
        )}

        {(chartScope === "all" || chartScope === "geo") && (
        <ChartCard title="Κατάσταση κλήσης">
          {callStatusV.length === 0 ? (
            <NoChartData />
          ) : (
            <ChartFrame>
              <ResponsiveContainer width="100%" height="100%" minHeight={300}>
                <PieChart>
                  <Pie
                    data={callStatusV}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius="48%"
                    outerRadius="75%"
                    paddingAngle={1.5}
                    stroke="var(--border)"
                    strokeWidth={1}
                  >
                    {callStatusV.map((_, i) => (
                      <Cell key={i} fill={CHART[i % CHART.length]!} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v: number) => [v, "Κλήσεις"]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </ChartFrame>
          )}
        </ChartCard>
        )}

        {(chartScope === "all" || chartScope === "geo") && (
        <ChartCard title="Ηλικίες (ομάδες)">
          {ageV.length === 0 ? (
            <NoChartData />
          ) : (
            <ChartFrame>
              <ResponsiveContainer width="100%" height="100%" minHeight={300}>
                <BarChart data={ageV} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <XAxis dataKey="name" tick={{ fill: "var(--text-secondary)", fontSize: 11 }} />
                  <YAxis tick={{ fill: "var(--text-secondary)", fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="value" fill="#1e5fa8" radius={[4, 4, 0, 0]}>
                    {ageV.map((_, i) => (
                      <Cell key={i} fill={i % 2 === 0 ? "#1e5fa8" : "#C9A84C"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
          )}
        </ChartCard>
        )}

        {(chartScope === "all" || chartScope === "trends") && (
        <ChartCard title="Κλήσεις (30 ημέρες)">
          {callsT.length === 0 ? (
            <NoChartData />
          ) : (
            <ChartFrame>
              <ResponsiveContainer width="100%" height="100%" minHeight={300}>
                <LineChart data={callsT} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <XAxis dataKey="date" tick={{ fill: "var(--text-secondary)", fontSize: 10 }} />
                  <YAxis tick={{ fill: "var(--text-secondary)", fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#C9A84C"
                    strokeWidth={2.5}
                    dot={{ fill: "#0A1628", r: 3, stroke: "#C9A84C", strokeWidth: 1 }}
                    activeDot={{ r: 5, fill: "#C9A84C" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartFrame>
          )}
        </ChartCard>
        )}

        {(chartScope === "all" || chartScope === "trends") && (
        <ChartCard title="Επιτυχία καμπανιών (θετικό / σύνολο)">
          {(data.campaignSuccess ?? []).length === 0 ? (
            <NoChartData />
          ) : (
            <ChartFrame>
              <ResponsiveContainer width="100%" height="100%" minHeight={320}>
                <BarChart
                  data={data.campaignSuccess.map((c) => ({
                    name: c.name.length > 28 ? c.name.slice(0, 26) + "…" : c.name,
                    fullName: c.name,
                    successRate: c.successRate,
                    total: c.totalCalls,
                  }))}
                  margin={{ top: 4, right: 8, left: 0, bottom: 56 }}
                >
                  <XAxis
                    dataKey="name"
                    angle={-32}
                    textAnchor="end"
                    height={72}
                    tick={{ fill: "var(--text-secondary)", fontSize: 10 }}
                    interval={0}
                  />
                  <YAxis tick={{ fill: "var(--text-secondary)", fontSize: 11 }} domain={[0, 100]} unit="%" />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: number) => [`${value}%`, "Ποσοστό"]}
                    labelFormatter={(_label, payload) => {
                      const pl = payload?.[0]?.payload as { fullName?: string } | undefined;
                      return pl?.fullName ?? String(_label ?? "");
                    }}
                  />
                  <Bar dataKey="successRate" fill="#0A1628" radius={[4, 4, 0, 0]} maxBarSize={40}>
                    {data.campaignSuccess.map((_, i) => (
                      <Cell key={i} fill={i % 2 === 0 ? "#0A1628" : "#C9A84C"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
          )}
        </ChartCard>
        )}
      </div>
    </div>
  );
}
