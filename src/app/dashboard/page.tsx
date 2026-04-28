"use client";

import {
  AlertTriangle,
  BarChart3,
  Calendar,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Euro,
  Inbox,
  Megaphone,
  HandHeart,
  ListTodo,
  PhoneCall,
  PhoneOff,
  Sparkles,
  Cake,
  UserPlus,
  TrendingUp,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { ComponentType } from "react";
import Link from "next/link";
import { lux } from "@/lib/luxury-styles";
import { fetchJsonWithTimeout, CLIENT_FETCH_TIMEOUT_MS } from "@/lib/safe-json-fetch";
import { useProfile } from "@/contexts/profile-context";
import { PageHeader } from "@/components/ui/page-header";
import { useCountUp } from "@/hooks/use-count-up";
import { MetricSparkline } from "@/components/ui/metric-sparkline";
import { PwaInstallSteps } from "@/components/pwa-install-guide";

type DashboardData = {
  totalContacts: number;
  totalCallsToday: number;
  positiveRate: number;
  pendingContacts: number;
  notCalled30Count: number;
  overdueRequestCount: number;
  contactsWithoutPhoneCount: number;
  supporterCount: number;
  totalSupportAmount: number;
  recentActivity: Array<{ id: string; type: string; text: string; created_at: string }>;
};

type Briefing = {
  namedays: { names: string[]; matchingContactsCount: number; contactNames: string[] };
  namedayContacts: Array<{ name: string; phone: string }>;
  tasksDueToday: Array<{ id: string; title: string; contact: string }>;
  openRequestsCount: number;
  contactsAddedThisWeek: number;
  campaigns: Array<{ id: string; name: string; started_at: string | null; callsTotal: number; positive: number }>;
  calendar: { connected: boolean; events: Array<{ title: string | null; start: string | null; end: string | null }> };
  stalledOpenRequestCount: number;
  callsYesterday: { total: number; positive: number; negative: number; noAnswer: number };
};

type Act = { id: string; text: string; timeAgo: string; avatar: string };

const EMPTY_DASH: DashboardData = {
  totalContacts: 0,
  totalCallsToday: 0,
  positiveRate: 0,
  pendingContacts: 0,
  notCalled30Count: 0,
  overdueRequestCount: 0,
  contactsWithoutPhoneCount: 0,
  supporterCount: 0,
  totalSupportAmount: 0,
  recentActivity: [],
};

const EMPTY_BRIEF: Briefing = {
  namedays: { names: [], matchingContactsCount: 0, contactNames: [] },
  namedayContacts: [],
  tasksDueToday: [],
  openRequestsCount: 0,
  contactsAddedThisWeek: 0,
  campaigns: [],
  calendar: { connected: false, events: [] },
  stalledOpenRequestCount: 0,
  callsYesterday: { total: 0, positive: 0, negative: 0, noAnswer: 0 },
};

function parseDashboard(raw: unknown): DashboardData {
  if (!raw || typeof raw !== "object") return EMPTY_DASH;
  const o = raw as Record<string, unknown>;
  if ("error" in o && o.error) return EMPTY_DASH;
  return {
    totalContacts: typeof o.totalContacts === "number" ? o.totalContacts : 0,
    totalCallsToday: typeof o.totalCallsToday === "number" ? o.totalCallsToday : 0,
    positiveRate: typeof o.positiveRate === "number" ? o.positiveRate : 0,
    pendingContacts: typeof o.pendingContacts === "number" ? o.pendingContacts : 0,
    notCalled30Count: typeof o.notCalled30Count === "number" ? o.notCalled30Count : 0,
    overdueRequestCount: typeof o.overdueRequestCount === "number" ? o.overdueRequestCount : 0,
    contactsWithoutPhoneCount:
      typeof o.contactsWithoutPhoneCount === "number" ? o.contactsWithoutPhoneCount : 0,
    supporterCount: typeof o.supporterCount === "number" ? o.supporterCount : 0,
    totalSupportAmount: typeof o.totalSupportAmount === "number" ? o.totalSupportAmount : 0,
    recentActivity: Array.isArray(o.recentActivity) ? (o.recentActivity as DashboardData["recentActivity"]) : [],
  };
}

function parseBriefing(raw: unknown): Briefing {
  if (!raw || typeof raw !== "object") return EMPTY_BRIEF;
  const o = raw as Record<string, unknown>;
  if ("error" in o && o.error) return EMPTY_BRIEF;
  const n = o.namedays;
  const namedays =
    n && typeof n === "object"
      ? {
          names: Array.isArray((n as { names?: unknown }).names) ? ((n as { names: string[] }).names) : [],
          matchingContactsCount:
            typeof (n as { matchingContactsCount?: unknown }).matchingContactsCount === "number"
              ? (n as { matchingContactsCount: number }).matchingContactsCount
              : 0,
          contactNames: Array.isArray((n as { contactNames?: unknown }).contactNames)
            ? ((n as { contactNames: string[] }).contactNames)
            : [],
        }
      : EMPTY_BRIEF.namedays;
  const cal = o.calendar;
  const calendar =
    cal && typeof cal === "object"
      ? {
          connected: (cal as { connected?: boolean }).connected === true,
          events: Array.isArray((cal as { events?: unknown }).events)
            ? (cal as { events: Briefing["calendar"]["events"] }).events
            : [],
        }
      : EMPTY_BRIEF.calendar;
  const cys = o.callsYesterday;
  const callsYesterday =
    cys && typeof cys === "object"
      ? {
          total: typeof (cys as { total?: number }).total === "number" ? (cys as { total: number }).total : 0,
          positive: typeof (cys as { positive?: number }).positive === "number" ? (cys as { positive: number }).positive : 0,
          negative: typeof (cys as { negative?: number }).negative === "number" ? (cys as { negative: number }).negative : 0,
          noAnswer: typeof (cys as { noAnswer?: number }).noAnswer === "number" ? (cys as { noAnswer: number }).noAnswer : 0,
        }
      : EMPTY_BRIEF.callsYesterday;
  return {
    namedays,
    namedayContacts: Array.isArray((o as { namedayContacts?: unknown }).namedayContacts)
      ? (o as { namedayContacts: Briefing["namedayContacts"] }).namedayContacts
      : [],
    tasksDueToday: Array.isArray(o.tasksDueToday) ? (o.tasksDueToday as Briefing["tasksDueToday"]) : [],
    openRequestsCount: typeof o.openRequestsCount === "number" ? o.openRequestsCount : 0,
    contactsAddedThisWeek: typeof o.contactsAddedThisWeek === "number" ? o.contactsAddedThisWeek : 0,
    campaigns: Array.isArray(o.campaigns) ? (o.campaigns as Briefing["campaigns"]) : [],
    calendar,
    stalledOpenRequestCount:
      typeof (o as { stalledOpenRequestCount?: number }).stalledOpenRequestCount === "number"
        ? (o as { stalledOpenRequestCount: number }).stalledOpenRequestCount
        : 0,
    callsYesterday,
  };
}

function parseActs(raw: unknown): Act[] {
  if (!raw || typeof raw !== "object") return [];
  const o = raw as { activities?: unknown };
  if (!Array.isArray(o.activities)) return [];
  return o.activities
    .map((a) => {
      if (!a || typeof a !== "object") return null;
      const r = a as Record<string, unknown>;
      if (typeof r.id !== "string" || typeof r.text !== "string") return null;
      return {
        id: r.id,
        text: r.text,
        timeAgo: typeof r.timeAgo === "string" ? r.timeAgo : "",
        avatar: typeof r.avatar === "string" ? r.avatar : "•",
      };
    })
    .filter((x): x is Act => x !== null);
}

function firstNameFromProfile(full: string | null | undefined) {
  if (!full?.trim()) return "ομάδα";
  return full.trim().split(/\s+/)[0] ?? "ομάδα";
}

function greetingForHour(d: Date) {
  const h = d.getHours();
  if (h < 12) return "Καλημέρα";
  if (h < 17) return "Καλησπέρα";
  return "Καλησπέρα";
}

export default function DashboardPage() {
  const { profile } = useProfile();
  const [now, setNow] = useState(() => new Date());
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<DashboardData>(EMPTY_DASH);
  const [briefing, setBriefing] = useState<Briefing>(EMPTY_BRIEF);
  const [acts, setActs] = useState<Act[]>([]);
  const [showInstallTutorial, setShowInstallTutorial] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = "crm-install-tutorial-dismissed";
    const dismissed = window.localStorage.getItem(key) === "1";
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setShowInstallTutorial(!dismissed && !standalone);
  }, []);

  const dismissInstallTutorial = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("crm-install-tutorial-dismissed", "1");
    }
    setShowInstallTutorial(false);
  };

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [d, b, a] = await Promise.all([
        fetchJsonWithTimeout<unknown>("/api/dashboard", {}, CLIENT_FETCH_TIMEOUT_MS),
        fetchJsonWithTimeout<unknown>("/api/briefing/today", {}, CLIENT_FETCH_TIMEOUT_MS),
        fetchJsonWithTimeout<unknown>("/api/activity/recent", {}, CLIENT_FETCH_TIMEOUT_MS),
      ]);
      if (cancelled) return;
      setData(parseDashboard(d));
      setBriefing(parseBriefing(b));
      setActs(parseActs(a));
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center">
        <p className="text-sm text-[var(--text-subtitle)]">Φόρτωση…</p>
      </div>
    );
  }

  const safeTotalContacts = typeof data.totalContacts === "number" ? data.totalContacts : 0;
  const safeTotalCallsToday = typeof data.totalCallsToday === "number" ? data.totalCallsToday : 0;
  const safePositiveRate = typeof data.positiveRate === "number" ? data.positiveRate : 0;
  const safePendingContacts = typeof data.pendingContacts === "number" ? data.pendingContacts : 0;
  const safeOverdueReq = typeof data.overdueRequestCount === "number" ? data.overdueRequestCount : 0;
  const safeNoPhone = typeof data.contactsWithoutPhoneCount === "number" ? data.contactsWithoutPhoneCount : 0;
  const safeSupporterCount = typeof data.supporterCount === "number" ? data.supporterCount : 0;
  const tasksDueCount = briefing.tasksDueToday.length;
  const safeTotalSupport = typeof data.totalSupportAmount === "number" ? data.totalSupportAmount : 0;

  return (
    <div className="space-y-8">
      {showInstallTutorial ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-3 shadow-[var(--card-shadow)]">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-[var(--text-primary)]">Εγκαταστήστε το CRM ως εφαρμογή</p>
            <button
              type="button"
              onClick={dismissInstallTutorial}
              className="rounded px-1 text-sm font-bold text-[var(--text-muted)]"
              aria-label="Κλείσιμο"
            >
              ×
            </button>
          </div>
          <PwaInstallSteps
            title="Εγκαταστήστε το CRM ως εφαρμογή"
            subtitle="Οδηγίες ανά συσκευή/φυλλομετρητή."
            compact
            className="!border-0 !bg-transparent !p-0 !shadow-none"
          />
        </div>
      ) : null}
      <PageHeader
        title="Dashboard"
        subtitle="Κέντρο εντολών — εικόνα της ημέρας, ειδοποιήσεις και γρήγορες ενέργειες."
      />
      <section
        className="hq-particles relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-[var(--card-shadow)] [data-theme='light']:bg-white sm:p-6"
        aria-label="Χαιρετισμός"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-lg font-bold text-[var(--text-primary)] sm:text-xl">
              {greetingForHour(now)},{" "}
              <span className="text-[var(--accent-gold)]">{firstNameFromProfile(profile?.full_name)}!</span>
            </p>
            <p className="mt-1 text-sm capitalize leading-[1.6] text-[var(--text-muted)]">
              {now.toLocaleDateString("el-GR", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
          <p className="hq-metric-tabular text-2xl font-bold tabular-nums text-[var(--text-primary)]">
            {now.toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </p>
        </div>
      </section>
      <section
        className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm [data-theme='light']:bg-white [data-theme='light']:shadow-[0_1px_12px_rgba(0,0,0,0.06)]"
        aria-label="Γρήγορες ενέργειες"
      >
        <h2 className="hq-section-label">Γρήγορες ενέργειες</h2>
        <p className="mt-3 text-sm text-[var(--text-muted)]">Συντομεύσεις στις συχνότερες εργασίες</p>
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <QuickAction
            index={0}
            href="/contacts?new=1"
            title="Νέα Επαφή"
            subtitle="Καταχώριση πολίτη στη βάση"
            icon={UserPlus}
            iconWrapClass="bg-sky-500/15 text-sky-500"
          />
          <QuickAction
            index={1}
            href="/requests"
            title="Νέο Αίτημα"
            subtitle="Καταγραφή αιτήματος πολίτη"
            icon={Inbox}
            iconWrapClass="bg-violet-500/15 text-violet-500"
          />
          <QuickAction
            index={2}
            href="/tasks"
            title="Νέα Εργασία"
            subtitle="Υπενθύμιση & follow-up"
            icon={ListTodo}
            iconWrapClass="bg-amber-500/15 text-amber-600"
          />
          <QuickAction
            index={3}
            href="/campaigns"
            title="Έναρξη Καμπάνιας"
            subtitle="Καμπάνιες κλήσεων & στόχοι"
            icon={Megaphone}
            iconWrapClass="bg-rose-500/15 text-rose-500"
          />
          <QuickAction
            index={4}
            href="/namedays"
            title="Εορτάζοντες Σήμερα"
            subtitle="Ονομαστικές & ευχές"
            icon={Cake}
            iconWrapClass="bg-pink-500/15 text-pink-500"
          />
          <QuickAction
            index={5}
            href="/schedule"
            title="Πρόγραμμα"
            subtitle="Ραντεβού & calendar"
            icon={Calendar}
            iconWrapClass="bg-emerald-500/15 text-emerald-600"
          />
        </div>
      </section>

      <section
        className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 [data-theme='light']:bg-white"
        aria-label="Ειδοποιήσεις"
      >
        <h2 className="text-base font-bold text-[var(--text-primary)]">Χρειάζονται προσοχή</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <AlertCard
            borderClass="border-red-500/35 bg-red-500/[0.07]"
            icon={AlertTriangle}
            iconClass="text-red-500"
            count={safeOverdueReq}
            label="Ληξιπρόθεσμα αιτήματα (SLA)"
            description="Αιτήματα σε Νέο/Σε εξέλιξη με παρελθούσα ημ/νια λήξης"
            href="/requests"
            linkText="Προβολή"
            accent="text-red-600 dark:text-red-300"
          />
          <AlertCard
            borderClass="border-amber-500/35 bg-amber-500/[0.08]"
            icon={PhoneOff}
            iconClass="text-amber-600"
            count={safeNoPhone}
            label="Χωρίς τηλέφωνο"
            description="Επαφές χωρίς κινητό (κενό ή null)"
            href="/contacts"
            linkText="Προβολή"
            accent="text-amber-700 dark:text-amber-200"
          />
          <AlertCard
            borderClass="border-sky-500/35 bg-sky-500/[0.08]"
            icon={ListTodo}
            iconClass="text-sky-500"
            count={tasksDueCount}
            label="Tasks προς σήμερα"
            description="Μη ολοκληρωμένες εργασίες με deadline σήμερα"
            href="/tasks"
            linkText="Προβολή"
            accent="text-sky-700 dark:text-sky-200"
          />
        </div>
      </section>

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
              <p
                className="mt-2 line-clamp-2 text-xs text-[var(--text-briefing)]"
                title={briefing.namedays.contactNames.join(", ")}
              >
                {briefing.namedays.contactNames.join(", ")}
              </p>
            )}
            {briefing.namedayContacts.length > 0 && (
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                Τηλέφωνα:{" "}
                {briefing.namedayContacts
                  .slice(0, 4)
                  .map((c) => `${c.name} ${c.phone}`)
                  .join(" · ")}
                {briefing.namedayContacts.length > 4 ? "…" : ""}
              </p>
            )}
          </div>
          <div className="border-b border-[var(--border)] p-5 md:border-b-0 md:border-r">
            <BriefRow
              icon={Calendar}
              title="Google Calendar (σήμερα)"
              value={briefing.calendar.connected ? `${briefing.calendar.events.length} events` : "Μη συνδεδεμένο"}
              sub={
                briefing.calendar.connected
                  ? briefing.calendar.events
                      .slice(0, 3)
                      .map((e) => e.title ?? "—")
                      .join(" · ") || "Καμία εγγραφή"
                  : "Συνδέστε το λογαριασμό στις ρυθμίσεις"
              }
            />
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
          <div className="border-b border-[var(--border)] p-5 md:border-b-0 md:border-r">
            <BriefRow
              icon={PhoneCall}
              title="Χθεσινές κλήσεις"
              value={String(briefing.callsYesterday.total)}
              sub={`+${briefing.callsYesterday.positive} θετικές · ${briefing.callsYesterday.negative} αρνητικές · ${briefing.callsYesterday.noAnswer} χωρίς απάντηση`}
            />
          </div>
          <div className="border-b border-[var(--border)] p-5 md:border-b-0 md:col-span-2">
            <BriefRow
              icon={Inbox}
              title="Αιτήματα σε εκκρεμότητα &gt; 7 ημ."
              value={String(briefing.stalledOpenRequestCount)}
              sub="Νέο/Σε εξέλιξη με ημερομηνία πριν από 1 εβδομάδα"
            />
          </div>
          {briefing.campaigns.length > 0 && (
            <div className="p-5 md:col-span-2 md:border-t md:border-[var(--border)]">
              <div className="mb-3 flex items-center gap-2 text-[var(--accent-gold)]">
                <BarChart3 className="h-4 w-4" />
                <span className="hq-section-label !m-0 !mb-0 !inline !border-0 !p-0 !pb-0">Ενεργές καμπάνιες</span>
              </div>
              <ul className="space-y-2 text-sm text-[var(--text-primary)]">
                {briefing.campaigns.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/40 px-3 py-2">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-xs text-[var(--text-briefing)]">
                      {c.callsTotal} κλήσεις · {c.positive} θετικές
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat
          title="Σύνολο επαφών"
          value={safeTotalContacts}
          numeric={safeTotalContacts}
          hint="Βάση δεδομένων"
          icon={CheckCircle2}
          iconBg="bg-[var(--accent-blue)]/20"
          iconColor="text-[var(--accent-blue-bright)]"
          sub={<MetricSparkline seed={safeTotalContacts} positive />}
          stagger="hq-stagger-0"
        />
        <Stat
          title="Κλήσεις σήμερα"
          value={safeTotalCallsToday}
          numeric={safeTotalCallsToday}
          hint="Ημερήσια δραστηριότητα"
          icon={PhoneCall}
          iconBg="bg-[var(--warning)]/20"
          iconColor="text-[var(--warning)]"
          sub={<MetricSparkline seed={safeTotalCallsToday + 13} positive={safeTotalCallsToday > 0} />}
          stagger="hq-stagger-1"
        />
        <Stat
          title="Θετικό ποσοστό"
          value={`${safePositiveRate.toFixed(1)}%`}
          numeric={safePositiveRate}
          decimals={1}
          format={(n) => `${n.toFixed(1)}%`}
          hint="Από όλες τις κλήσεις"
          icon={TrendingUp}
          iconBg="bg-[var(--success)]/20"
          iconColor="text-[var(--success)]"
          sub={<MetricSparkline seed={Math.round(safePositiveRate * 100)} positive={safePositiveRate > 0} />}
          stagger="hq-stagger-2"
        />
        <Stat
          title="Σε αναμονή"
          value={safePendingContacts}
          numeric={safePendingContacts}
          hint="Χρειάζονται follow-up"
          icon={Clock3}
          iconBg="bg-slate-500/20"
          iconColor="text-[#E2E8F0]"
          sub={<span className="text-xs font-medium text-[var(--text-subtitle)]">Αναμονή / φίλτρα</span>}
          stagger="hq-stagger-3"
        />
        <Stat
          title="Υποστηρικτές (εγγραφές)"
          value={safeSupporterCount}
          numeric={safeSupporterCount}
          hint="Καταγραφές υποστήριξης"
          icon={HandHeart}
          iconBg="bg-[#C9A84C]/15"
          iconColor="text-[var(--accent-gold)]"
          sub={
            <span className="text-xs font-medium text-[var(--text-subtitle)]">
              Συνδέσεις επαφών · υποστηρικτές
            </span>
          }
          stagger="hq-stagger-0"
        />
        <Stat
          title="Συνολικό ποσό υποστ."
          value={
            new Intl.NumberFormat("el-GR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(
              safeTotalSupport,
            )
          }
          numeric={safeTotalSupport}
          decimals={2}
          format={(n) =>
            new Intl.NumberFormat("el-GR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n)
          }
          hint="Άθροισμα ποσών (δωρεές κ.λπ.)"
          icon={Euro}
          iconBg="bg-emerald-500/15"
          iconColor="text-emerald-300"
          sub={
            <span className="text-xs font-medium text-[var(--text-subtitle)]">Βάση supporters</span>
          }
          stagger="hq-stagger-1"
        />
      </div>

      <section className={lux.card}>
        <h2 className="hq-card-title mb-4">Πρόσφατη δραστηριότητα</h2>
        {acts.length === 0 ? (
          <p className="text-sm text-[var(--text-subtitle)]">Δεν υπάρχει πρόσφατη δραστηριότητα.</p>
        ) : (
          <ul className="space-y-0">
            {acts.map((item, i) => {
              const palette = ["#C9A84C", "#10B981", "#0EA5E9", "#A855F7", "#F43F5E"];
              const dot = palette[i % palette.length];
              return (
                <li
                  key={item.id}
                  className="hq-stagger-item border-b border-[var(--border)]/50 py-4 last:border-0 [animation:hq-stagger-fade_0.45s_ease_both]"
                  style={{ ["--stagger" as string]: String(i), ["--activity-dot" as string]: dot }}
                >
                  <div className="flex gap-3 pl-1">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-gradient-to-br from-[var(--accent-gold)]/30 to-[var(--accent-blue)]/30 text-xs font-bold text-white">
                      {item.avatar}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-[1.6] text-[var(--text-primary)]">
                        {item.text}
                        {item.timeAgo ? <span className="text-[var(--text-subtitle)]"> — {item.timeAgo}</span> : null}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function QuickAction({
  href,
  title,
  subtitle,
  icon: Icon,
  iconWrapClass,
  index = 0,
}: {
  href: string;
  title: string;
  subtitle: string;
  icon: ComponentType<{ className?: string }>;
  iconWrapClass: string;
  index?: number;
}) {
  return (
    <Link
      href={href}
      style={{ ["--stagger" as string]: String(index) }}
      className="hq-stagger-item group flex cursor-pointer gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 transition duration-200 will-change-transform [data-theme='light']:bg-white hover:scale-[1.03] hover:border-[var(--accent-gold)]/70 hover:shadow-md"
    >
      <div
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${iconWrapClass}`}
        aria-hidden
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="font-bold text-[var(--text-primary)]">{title}</p>
        <p className="mt-0.5 line-clamp-2 text-sm text-[var(--text-muted)]">{subtitle}</p>
      </div>
    </Link>
  );
}

function AlertCard({
  borderClass,
  icon: Icon,
  iconClass,
  count,
  label,
  description,
  href,
  linkText,
  accent,
}: {
  borderClass: string;
  icon: ComponentType<{ className?: string }>;
  iconClass: string;
  count: number;
  label: string;
  description: string;
  href: string;
  linkText: string;
  accent: string;
}) {
  return (
    <div
      className={[
        "flex flex-col gap-3 rounded-2xl border p-4 transition [data-theme='light']:bg-white/90",
        borderClass,
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <div
          className={[
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/50 [data-theme='light']:bg-white",
            iconClass,
          ].join(" ")}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-2xl font-bold tabular-nums leading-none ${accent}`}>{count}</p>
          <p className="mt-1.5 text-sm font-semibold text-[var(--text-primary)]">{label}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{description}</p>
        </div>
      </div>
      <Link
        href={href}
        className="self-start text-sm font-semibold text-[var(--accent-gold)] underline-offset-2 hover:underline"
      >
        {linkText}
      </Link>
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
      <p className="text-lg font-bold text-[var(--text-briefing)]">{value}</p>
      <p className="mt-1 line-clamp-2 text-xs text-[var(--text-briefing)]">{sub}</p>
    </div>
  );
}

function Stat({
  title,
  value,
  numeric,
  format,
  decimals = 0,
  hint,
  icon: Icon,
  iconBg,
  iconColor,
  sub,
  stagger,
}: {
  title: string;
  value: string | number;
  /** When set, value animates from 0 over 800ms */
  numeric?: number;
  format?: (n: number) => string;
  /** Decimal places for animated value */
  decimals?: number;
  hint: string;
  icon: ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  sub: ReactNode;
  stagger: string;
}) {
  const anim = useCountUp(typeof numeric === "number" ? numeric : 0, 800, decimals);
  const display =
    typeof numeric === "number" ? (format ? format(anim) : String(Math.round(anim))) : value;
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
      <p className="hq-metric-tabular text-4xl font-bold text-[var(--text-metric-value)] [font-feature-settings:'tnum'1]">
        {display}
      </p>
      <p className="mt-1 text-xs text-[var(--text-subtitle)]">{hint}</p>
      <div className="mt-2 flex min-h-8 items-center justify-between gap-2">{sub}</div>
    </div>
  );
}

