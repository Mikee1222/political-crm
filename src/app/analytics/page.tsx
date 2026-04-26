"use client";

import { useCallback, useEffect, useState } from "react";
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
import { lux } from "@/lib/luxury-styles";

const PALETTE = ["#C9A84C", "#0A1628", "#1e5fa8", "#2dd4bf", "#8B6914", "#94A3B8", "#D97706", "#059669", "#7C3AED", "#E11D48"];

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

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsPayload>(empty);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    const res = await fetchWithTimeout("/api/analytics");
    const j = (await res.json()) as AnalyticsPayload & { error?: string };
    if (!res.ok) {
      setErr(j.error ?? "Σφάλμα");
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
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-8">
      <div className={lux.card}>
        <h1 className={lux.pageTitle + " mb-1"}>Αναλυτικά</h1>
        <p className="text-sm text-[var(--text-secondary)]">Συγκεντρωτική εικόνα επαφών και καμπανιών (ελληνικά)</p>
        {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Επαφές ανά δήμο (πρώτοι 15)">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart
              data={[...data.byMunicipality].reverse()}
              layout="vertical"
              margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
            >
              <XAxis type="number" tick={{ fill: "var(--text-secondary)", fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="name"
                width={120}
                tick={{ fill: "var(--text-secondary)", fontSize: 10 }}
              />
              <Tooltip
                contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
                labelStyle={{ color: "var(--text-primary)" }}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {[...data.byMunicipality].reverse().map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]!} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Πολιτική στάση">
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie
                data={data.byPoliticalStance}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
              >
                {data.byPoliticalStance.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]!} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Κατάσταση κλήσης (donut)">
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie
                data={data.byCallStatus}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                label
              >
                {data.byCallStatus.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]!} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Ηλικίες (ομάδες)">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={data.byAgeGroup} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
              <XAxis dataKey="name" tick={{ fill: "var(--text-secondary)", fontSize: 11 }} />
              <YAxis tick={{ fill: "var(--text-secondary)", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }} />
              <Bar dataKey="value" fill="#1e5fa8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Κλήσεις (30 ημέρες)">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={data.callsOverTime} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
              <XAxis dataKey="date" tick={{ fill: "var(--text-secondary)", fontSize: 10 }} />
              <YAxis tick={{ fill: "var(--text-secondary)", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }} />
              <Line type="monotone" dataKey="count" stroke="#C9A84C" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Επιτυχία καμπανιών (θετικό / σύνολο κλήσεων)">
          <ResponsiveContainer width="100%" height={360}>
            <BarChart
              data={data.campaignSuccess.map((c) => ({
                name: c.name.length > 28 ? c.name.slice(0, 26) + "…" : c.name,
                fullName: c.name,
                successRate: c.successRate,
                total: c.totalCalls,
              }))}
              margin={{ top: 8, right: 8, left: 0, bottom: 64 }}
            >
              <XAxis
                dataKey="name"
                angle={-35}
                textAnchor="end"
                height={80}
                tick={{ fill: "var(--text-secondary)", fontSize: 10 }}
              />
              <YAxis tick={{ fill: "var(--text-secondary)", fontSize: 11 }} domain={[0, 100]} unit="%" />
              <Tooltip
                contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
                formatter={(value: number) => [`${value}%`, "Ποσοστό"]}
                labelFormatter={(label, payload) => {
                  const pl = payload?.[0]?.payload as { fullName?: string } | undefined;
                  return pl?.fullName ?? String(label ?? "");
                }}
              />
              <Bar dataKey="successRate" fill="#0A1628" radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="data-hq-card rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-md">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-[#C9A84C]">{title}</h2>
      {children}
    </div>
  );
}
