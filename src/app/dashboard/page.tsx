"use client";

import {
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Inbox,
  PhoneCall,
  Sparkles,
  TrendingUp,
  UserPlus,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { ComponentType } from "react";
import { lux } from "@/lib/luxury-styles";

type DashboardData = {
  totalContacts: number;
  totalCallsToday: number;
  positiveRate: number;
  pendingContacts: number;
  recentActivity: Array<{ id: string; type: string; text: string; created_at: string }>;
};

type Briefing = {
  namedays: { names: string[]; matchingContactsCount: number; contactNames: string[] };
  tasksDueToday: Array<{ id: string; title: string; contact: string }>;
  openRequestsCount: number;
  contactsAddedThisWeek: number;
  campaigns: Array<{ id: string; name: string; started_at: string | null; callsTotal: number; positive: number }>;
};

type Act = { id: string; text: string; timeAgo: string; avatar: string };

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [acts, setActs] = useState<Act[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/dashboard").then((res) => res.json()),
      fetch("/api/briefing/today").then((res) => res.json()),
      fetch("/api/activity/recent").then((res) => res.json()),
    ]).then(([dashboardData, br, actData]) => {
      setData(dashboardData);
      if (!br.error) setBriefing(br);
      setActs(Array.isArray(actData.activities) ? actData.activities : []);
    });
  }, []);

  if (!data) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center">
        <p className="text-sm text-[var(--text-secondary)]">Φόρτωση…</p>
      </div>
    );
  }

  const safeTotalContacts = typeof data.totalContacts === "number" ? data.totalContacts : 0;
  const safeTotalCallsToday = typeof data.totalCallsToday === "number" ? data.totalCallsToday : 0;
  const safePositiveRate = typeof data.positiveRate === "number" ? data.positiveRate : 0;
  const safePendingContacts = typeof data.pendingContacts === "number" ? data.pendingContacts : 0;

  return (
    <div className="space-y-8">
      {briefing && (
        <section
          className={[
            lux.cardFlat,
            "relative !overflow-hidden border-l-[3px] !border-l-[var(--accent-gold)] !p-0",
            "grid gap-0 md:grid-cols-2",
          ].join(" ")}
        >
          <div className="col-span-full border-b border-[var(--border)] bg-gradient-to-r from-[rgba(201,168,76,0.08)] to-transparent px-5 py-3">
            <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-[var(--accent-gold)]">Ημερήσια ενημέρωση</h2>
          </div>
          <div className="border-b border-[var(--border)] p-5 md:border-b-0 md:border-r">
            <BriefRow
              icon={Sparkles}
              title="Κοινές γιορτές"
              value={
                briefing.namedays.matchingContactsCount
                  ? `${briefing.namedays.matchingContactsCount} επαφές`
                  : "Καμία αντιστοίχιση"
              }
              sub={
                briefing.namedays.names.length
                  ? briefing.namedays.names.slice(0, 4).join(", ") + (briefing.namedays.names.length > 4 ? "…" : "")
                  : "—"
              }
            />
            {briefing.namedays.contactNames.length > 0 && (
              <p className="mt-2 line-clamp-2 text-xs text-[var(--text-secondary)]" title={briefing.namedays.contactNames.join(", ")}>
                {briefing.namedays.contactNames.join(", ")}
              </p>
            )}
          </div>
          <div className="border-b border-[var(--border)] p-5 md:border-b-0 md:border-r">
            <BriefRow
              icon={CalendarClock}
              title="Tasks σήμερα"
              value={`${briefing.tasksDueToday.length} εκκρεμά`}
              sub={briefing.tasksDueToday.length ? briefing.tasksDueToday.map((t) => t.title).join(", ") : "Κανένα"}
            />
          </div>
          <div className="border-b border-[var(--border)] p-5 md:border-b-0 md:border-r">
            <BriefRow
              icon={Inbox}
              title="Ανοιχτά αιτήματα"
              value={String(briefing.openRequestsCount)}
              sub="Νέο / Σε εξέλιξη"
            />
          </div>
          <div className="border-b border-[var(--border)] p-5 md:col-span-2 md:border-b-0">
            <BriefRow
              icon={UserPlus}
              title="Νέες επαφές (εβδομάδα)"
              value={String(briefing.contactsAddedThisWeek)}
              sub="από τη Δευτέρα"
            />
          </div>
          {briefing.campaigns.length > 0 && (
            <div className="p-5 md:col-span-2 md:border-t md:border-[var(--border)]">
              <div className="mb-3 flex items-center gap-2 text-[var(--accent-gold)]">
                <BarChart3 className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">Ενεργές καμπάνιες</span>
              </div>
              <ul className="space-y-2 text-sm text-[var(--text-primary)]">
                {briefing.campaigns.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/40 px-3 py-2">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-xs text-[var(--text-secondary)]">
                      {c.callsTotal} κλήσεις · {c.positive} θετικές
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          title="Σύνολο επαφών"
          value={safeTotalContacts}
          hint="Βάση δεδομένων"
          icon={CheckCircle2}
          iconBg="bg-[var(--accent-blue)]/20"
          iconColor="text-[var(--accent-blue-bright)]"
          sub={<TrendLine positive />}
          stagger="hq-stagger-0"
        />
        <Stat
          title="Κλήσεις σήμερα"
          value={safeTotalCallsToday}
          hint="Ημερήσια δραστηριότητα"
          icon={PhoneCall}
          iconBg="bg-[var(--warning)]/20"
          iconColor="text-[var(--warning)]"
          sub={<TrendLine positive={safeTotalCallsToday > 0} />}
          stagger="hq-stagger-1"
        />
        <Stat
          title="Θετικό ποσοστό"
          value={`${safePositiveRate.toFixed(1)}%`}
          hint="Από όλες τις κλήσεις"
          icon={TrendingUp}
          iconBg="bg-[var(--success)]/20"
          iconColor="text-[var(--success)]"
          sub={<TrendLine positive={safePositiveRate > 0} />}
          stagger="hq-stagger-2"
        />
        <Stat
          title="Σε αναμονή"
          value={safePendingContacts}
          hint="Χρειάζονται follow-up"
          icon={Clock3}
          iconBg="bg-slate-500/20"
          iconColor="text-slate-300"
          sub={<span className="text-[var(--text-muted)]">Αναμονή / φίλτρα</span>}
          stagger="hq-stagger-3"
        />
      </div>

      <section className={lux.card}>
        <h2 className="hq-card-title mb-5">Πρόοδος καμπάνιας</h2>
        <div className="space-y-5">
          <ProgressRow label="Θετική ανταπόκριση" value={safePositiveRate} color="from-emerald-500 to-emerald-600" />
          <ProgressRow
            label="Εκκρεμή follow-ups"
            value={Math.min((safePendingContacts / Math.max(safeTotalContacts, 1)) * 100, 100)}
            color="from-amber-500 to-amber-600"
          />
          <ProgressRow
            label="Ημερήσια δραστηριότητα"
            value={Math.min((safeTotalCallsToday / Math.max(safeTotalContacts, 1)) * 100, 100)}
            color="from-[var(--accent-blue-bright)] to-[var(--accent-blue)]"
          />
        </div>
      </section>

      <section className={lux.card}>
        <h2 className="hq-card-title mb-4">Πρόσφατη δραστηριότητα</h2>
        {acts.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Δεν υπάρχει πρόσφατη δραστηριότητα.</p>
        ) : (
          <ul className="space-y-4">
            {acts.map((item) => (
              <li key={item.id} className="flex gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-gradient-to-br from-[var(--accent-gold)]/30 to-[var(--accent-blue)]/30 text-xs font-bold text-white">
                  {item.avatar}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[var(--text-primary)]">
                    {item.text}
                    {item.timeAgo ? <span className="text-[var(--text-muted)]"> — {item.timeAgo}</span> : null}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function BriefRow({
  icon: Icon,
  title,
  value,
  sub,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  value: string;
  sub: string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-[var(--accent-gold)]">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="text-xs font-semibold uppercase tracking-wider">{title}</span>
      </div>
      <p className="text-lg font-bold text-[var(--text-primary)]">{value}</p>
      <p className="mt-1 line-clamp-2 text-xs text-[var(--text-secondary)]">{sub}</p>
    </div>
  );
}

function TrendLine({ positive }: { positive?: boolean }) {
  if (!positive) {
    return <span className="text-[11px] text-[var(--text-muted)]">—</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--success)]">
      <TrendingUp className="h-3.5 w-3.5" />
      <span>Ενεργό</span>
    </span>
  );
}

function Stat({
  title,
  value,
  hint,
  icon: Icon,
  iconBg,
  iconColor,
  sub,
  stagger,
}: {
  title: string;
  value: string | number;
  hint: string;
  icon: ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  sub: ReactNode;
  stagger: string;
}) {
  return (
    <div
      className={[
        lux.cardFlat,
        "relative p-5 hq-fade-in-up",
        stagger,
        "bg-[var(--bg-card)]",
        "before:absolute before:inset-x-0 before:bottom-0 before:h-0.5 before:rounded-b-2xl before:bg-gradient-to-r before:from-[var(--accent-gold)]/40 before:to-transparent",
      ].join(" ")}
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--accent-gold)]">{title}</p>
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${iconBg}`}>
          <Icon className={["h-4 w-4", iconColor].join(" ")} />
        </div>
      </div>
      <p className="text-4xl font-bold tabular-nums text-[var(--text-primary)]" style={{ fontFeatureSettings: '"tnum"' }}>
        {value}
      </p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">{hint}</p>
      <div className="mt-2">{sub}</div>
    </div>
  );
}

function ProgressRow({ label, value, color }: { label: string; value: number; color: string }) {
  const safeValue = Number.isFinite(value) ? Math.max(0, Math.min(value, 100)) : 0;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-[var(--text-secondary)]">{label}</span>
        <span className="font-semibold text-[var(--text-primary)]">{safeValue.toFixed(1)}%</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-[var(--bg-elevated)] ring-1 ring-inset ring-[var(--border)]">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-500 ease-out shadow-[0_0_12px_rgba(201,168,76,0.15)]`}
          style={{ width: `${safeValue}%` }}
        />
      </div>
    </div>
  );
}
