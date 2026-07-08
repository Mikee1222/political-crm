"use client";

import {
  AlertTriangle,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  CheckSquare,
  ChevronRight,
  Clock3,
  Euro,
  Inbox,
  Megaphone,
  HandHeart,
  ListTodo,
  Phone,
  PhoneCall,
  PhoneOff,
  ArrowRight,
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
import { getAgeFromBirthday } from "@/lib/contact-birthday";
import { formatNowAthens, formatTimeAthens } from "@/lib/date-format";
import { useOptionalAlexandraPageContext } from "@/contexts/alexandra-page-context";
import {
  DashboardWidgetsGrid,
  EMPTY_WIDGETS,
} from "@/components/dashboard/dashboard-widgets";
import type { DashboardWidgetsData } from "@/lib/dashboard-widgets-data";
import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-page-skeleton";
import { getClientTtlCache, setClientTtlCache } from "@/lib/ttl-cache";

const DASH_CLIENT_TTL_MS = 60_000;

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
  namedayContacts: Array<{ id: string; name: string; phone: string }>;
  tasksDueToday: Array<{ id: string; title: string; contact: string }>;
  pendingTasksCount: number;
  openRequestsCount: number;
  contactsAddedThisWeek: number;
  campaigns: Array<{ id: string; name: string; started_at: string | null; callsTotal: number; positive: number }>;
  calendar: { connected: boolean; events: Array<{ title: string | null; start: string | null; end: string | null }> };
  stalledOpenRequestCount: number;
  overdueRequestCount: number;
  overdueTop5: Array<{
    id: string;
    request_code: string | null;
    title: string | null;
    created_at: string;
    status: string | null;
  }>;
  birthdayContacts: Array<{
    id: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    birthday: string | null;
  }>;
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
  pendingTasksCount: 0,
  openRequestsCount: 0,
  contactsAddedThisWeek: 0,
  campaigns: [],
  calendar: { connected: false, events: [] },
  stalledOpenRequestCount: 0,
  overdueRequestCount: 0,
  overdueTop5: [],
  birthdayContacts: [],
  callsYesterday: { total: 0, positive: 0, negative: 0, noAnswer: 0 },
};

const BRIEF_CARD = "rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-[var(--card-shadow)]";
const BRIEF_SECTION = "text-xs font-semibold uppercase tracking-widest text-[var(--accent-gold)] mb-3";

function daysSinceCreated(iso: string): number {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24)));
}

function formatCalendarTime(start: string | null): string {
  if (!start) return "—";
  return formatTimeAthens(start, { hour: "2-digit", minute: "2-digit" });
}

const CAL_EVENT_COLORS = [
  "var(--accent-gold)",
  "var(--accent-blue)",
  "var(--success)",
  "var(--warning)",
  "var(--danger)",
];

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
    pendingTasksCount:
      typeof (o as { pendingTasksCount?: number }).pendingTasksCount === "number"
        ? (o as { pendingTasksCount: number }).pendingTasksCount
        : 0,
    openRequestsCount: typeof o.openRequestsCount === "number" ? o.openRequestsCount : 0,
    contactsAddedThisWeek: typeof o.contactsAddedThisWeek === "number" ? o.contactsAddedThisWeek : 0,
    campaigns: Array.isArray(o.campaigns) ? (o.campaigns as Briefing["campaigns"]) : [],
    calendar,
    stalledOpenRequestCount:
      typeof (o as { stalledOpenRequestCount?: number }).stalledOpenRequestCount === "number"
        ? (o as { stalledOpenRequestCount: number }).stalledOpenRequestCount
        : 0,
    overdueRequestCount:
      typeof (o as { overdueRequestCount?: number }).overdueRequestCount === "number"
        ? (o as { overdueRequestCount: number }).overdueRequestCount
        : 0,
    overdueTop5: Array.isArray((o as { overdueTop5?: unknown }).overdueTop5)
      ? ((o as { overdueTop5: Briefing["overdueTop5"] }).overdueTop5)
      : [],
    birthdayContacts: Array.isArray((o as { birthdayContacts?: unknown }).birthdayContacts)
      ? ((o as { birthdayContacts: Briefing["birthdayContacts"] }).birthdayContacts)
      : [],
    callsYesterday,
  };
}

function parseWidgets(raw: unknown): DashboardWidgetsData {
  if (!raw || typeof raw !== "object") return EMPTY_WIDGETS;
  const o = raw as Record<string, unknown>;
  if ("error" in o && o.error) return EMPTY_WIDGETS;
  return {
    namedays: Array.isArray(o.namedays) ? (o.namedays as DashboardWidgetsData["namedays"]) : [],
    recentInserts: Array.isArray(o.recentInserts)
      ? (o.recentInserts as DashboardWidgetsData["recentInserts"])
      : [],
    recentUpdates: Array.isArray(o.recentUpdates)
      ? (o.recentUpdates as DashboardWidgetsData["recentUpdates"])
      : [],
    recentContactViews: Array.isArray(o.recentContactViews)
      ? (o.recentContactViews as DashboardWidgetsData["recentContactViews"])
      : [],
    recentRequestViews: Array.isArray(o.recentRequestViews)
      ? (o.recentRequestViews as DashboardWidgetsData["recentRequestViews"])
      : [],
    recentRequests: Array.isArray(o.recentRequests)
      ? (o.recentRequests as DashboardWidgetsData["recentRequests"])
      : [],
    groups: Array.isArray(o.groups) ? (o.groups as DashboardWidgetsData["groups"]) : [],
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
  const alexPage = useOptionalAlexandraPageContext();
  const [now, setNow] = useState(() => new Date());
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<DashboardData>(EMPTY_DASH);
  const [briefing, setBriefing] = useState<Briefing>(EMPTY_BRIEF);
  const [acts, setActs] = useState<Act[]>([]);
  const [widgets, setWidgets] = useState<DashboardWidgetsData>(EMPTY_WIDGETS);
  const [showInstallTutorial, setShowInstallTutorial] = useState(false);

  const setPageContext = alexPage?.setPageContext;
  useEffect(() => {
    if (!setPageContext) return;
    setPageContext({ type: "dashboard" });
    return () => setPageContext(null);
  }, [setPageContext]);

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
      const t0 =
        typeof performance !== "undefined" ? performance.now() : Date.now();

      type DashBundle = {
        d: unknown;
        b: unknown;
        a: unknown;
        w: unknown;
      };

      const cached = getClientTtlCache<DashBundle>("dashboard:bundle");
      if (cached) {
        if (cancelled) return;
        setData(parseDashboard(cached.d));
        setBriefing(parseBriefing(cached.b));
        setActs(parseActs(cached.a));
        setWidgets(parseWidgets(cached.w));
        setReady(true);
        console.log(
          `[dashboard] client cache HIT first paint ${Math.round(
            (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0,
          )}ms`,
        );
        return;
      }

      // Critical path: metrics first for meaningful first paint, then secondary panels.
      const d = await fetchJsonWithTimeout<unknown>("/api/dashboard", {}, CLIENT_FETCH_TIMEOUT_MS);
      if (cancelled) return;
      setData(parseDashboard(d));
      setReady(true);
      console.log(
        `[dashboard] metrics first paint ${Math.round(
          (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0,
        )}ms`,
      );

      const [b, a, w] = await Promise.all([
        fetchJsonWithTimeout<unknown>("/api/briefing/today", {}, CLIENT_FETCH_TIMEOUT_MS),
        fetchJsonWithTimeout<unknown>("/api/activity/recent", {}, CLIENT_FETCH_TIMEOUT_MS),
        fetchJsonWithTimeout<unknown>("/api/dashboard/widgets", {}, CLIENT_FETCH_TIMEOUT_MS),
      ]);
      if (cancelled) return;
      setBriefing(parseBriefing(b));
      setActs(parseActs(a));
      setWidgets(parseWidgets(w));
      setClientTtlCache("dashboard:bundle", { d, b, a, w }, DASH_CLIENT_TTL_MS);
      console.log(
        `[dashboard] full load ${Math.round(
          (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0,
        )}ms`,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return <DashboardPageSkeleton />;
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
        className="border-l-[3px] border-l-[var(--accent-gold)]"
      />
      <section
        className="hq-particles relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-[var(--card-shadow)] sm:p-6"
        aria-label="Χαιρετισμός"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-lg font-bold text-[var(--text-primary)] sm:text-xl">
              <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent-gold)]" aria-hidden />
              {greetingForHour(now)},{" "}
              <span className="text-[var(--accent-gold)]">{firstNameFromProfile(profile?.full_name)}!</span>
            </p>
            <p className="mt-1 text-sm capitalize leading-[1.6] text-muted-foreground">
              {formatNowAthens({
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
          <p className="hq-metric-tabular font-mono text-3xl font-bold tabular-nums text-foreground">
            {formatNowAthens({ hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </p>
        </div>
      </section>
      <section
        className="rounded-2xl border border-border bg-card p-5 shadow-[var(--card-shadow)]"
        aria-label="Γρήγορες ενέργειες"
      >
        <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--accent-gold)]">ΓΡΗΓΟΡΕΣ ΕΝΕΡΓΕΙΕΣ</h2>
        <p className="mt-3 text-sm text-[var(--text-muted)]">Συντομεύσεις στις συχνότερες εργασίες</p>
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <QuickAction
            index={0}
            href="/contacts?new=1"
            title="Νέα Επαφή"
            subtitle="Καταχώριση πολίτη στη βάση"
            icon={UserPlus}
            iconWrapClass="from-sky-500/40 to-cyan-500/20 text-sky-200"
          />
          <QuickAction
            index={1}
            href="/requests"
            title="Νέο Αίτημα"
            subtitle="Καταγραφή αιτήματος πολίτη"
            icon={Inbox}
            iconWrapClass="from-violet-500/40 to-fuchsia-500/20 text-violet-200"
          />
          <QuickAction
            index={2}
            href="/tasks"
            title="Νέα Εργασία"
            subtitle="Υπενθύμιση & follow-up"
            icon={ListTodo}
            iconWrapClass="from-amber-500/45 to-orange-500/25 text-amber-100"
          />
          <QuickAction
            index={3}
            href="/campaigns"
            title="Έναρξη Καμπάνιας"
            subtitle="Καμπάνιες κλήσεων & στόχοι"
            icon={Megaphone}
            iconWrapClass="from-rose-500/40 to-pink-500/25 text-rose-200"
          />
          <QuickAction
            index={4}
            href="/namedays"
            title="Εορτάζοντες Σήμερα"
            subtitle="Ονομαστικές & ευχές"
            icon={Cake}
            iconWrapClass="from-pink-500/40 to-rose-500/25 text-pink-200"
          />
          <QuickAction
            index={5}
            href="/schedule"
            title="Πρόγραμμα"
            subtitle="Ραντεβού & calendar"
            icon={Calendar}
            iconWrapClass="from-emerald-500/45 to-teal-500/25 text-emerald-100"
          />
        </div>
      </section>

      <DashboardWidgetsGrid data={widgets} />

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
            description="Αιτήματα σε κατάσταση «Ανοικτό» με παρελθούσα ημ/νια λήξης"
            href="/requests"
            linkText="Προβολή"
            accent="text-[var(--text-danger)]"
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
            accent="text-[var(--status-noanswer-text)]"
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
            accent="text-[var(--accent-blue-bright)]"
          />
        </div>
      </section>

      <section
        className={[
          lux.cardFlat,
          "relative !overflow-hidden border-l-[3px] !border-l-[var(--accent-gold)] space-y-4 !p-5",
        ].join(" ")}
      >
        <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-[var(--accent-gold)]">Ημερήσια ενημέρωση</h2>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className={BRIEF_CARD}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-widest text-[var(--text-muted)]">
                Ανοιχτά Αιτήματα
              </span>
              <Inbox className="h-4 w-4 text-[var(--accent-gold)]" aria-hidden />
            </div>
            <div className="text-3xl font-bold text-[var(--text-primary)]">{briefing.openRequestsCount}</div>
            <div className="mt-1 text-xs text-[var(--text-muted)]">Ανοικτό</div>
            {briefing.stalledOpenRequestCount > 0 ? (
              <div className="mt-2 flex items-center gap-1 text-xs font-medium text-[var(--danger)]">
                <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                {briefing.stalledOpenRequestCount} εκκρεμούν &gt;7 ημ.
              </div>
            ) : null}
          </div>

          <div className={BRIEF_CARD}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-widest text-[var(--text-muted)]">Tasks Σήμερα</span>
              <CheckSquare className="h-4 w-4 text-[var(--accent-gold)]" aria-hidden />
            </div>
            <div className="text-3xl font-bold text-[var(--text-primary)]">{briefing.pendingTasksCount}</div>
            <div className="mt-1 text-xs text-[var(--text-muted)]">
              εκκρεμή
              {briefing.tasksDueToday.length > 0
                ? ` · ${briefing.tasksDueToday.length} με deadline σήμερα`
                : ""}
            </div>
          </div>

          <div className={BRIEF_CARD}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-widest text-[var(--text-muted)]">Νέες Επαφές</span>
              <UserPlus className="h-4 w-4 text-[var(--accent-gold)]" aria-hidden />
            </div>
            <div className="text-3xl font-bold text-[var(--text-primary)]">{briefing.contactsAddedThisWeek}</div>
            <div className="mt-1 text-xs text-[var(--text-muted)]">από τη Δευτέρα</div>
          </div>

          <div className={BRIEF_CARD}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-widest text-[var(--text-muted)]">Χθεσινές Κλήσεις</span>
              <Phone className="h-4 w-4 text-[var(--accent-gold)]" aria-hidden />
            </div>
            <div className="text-3xl font-bold text-[var(--text-primary)]">{briefing.callsYesterday.total}</div>
            <div className="mt-1 flex flex-wrap gap-2">
              <span className="text-xs text-[var(--success)]">+{briefing.callsYesterday.positive} θετικές</span>
              <span className="text-xs text-[var(--danger)]">{briefing.callsYesterday.negative} αρν.</span>
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-t border-[var(--border)] pt-4 lg:grid-cols-2">
          <div className={BRIEF_CARD}>
            <h3 className={BRIEF_SECTION}>
              Σήμερα · {briefing.calendar.connected ? briefing.calendar.events.length : 0} γεγονότα
            </h3>
            {!briefing.calendar.connected ? (
              <p className="text-sm text-[var(--text-muted)]">Μη συνδεδεμένο ημερολόγιο — ρυθμίσεις Google.</p>
            ) : briefing.calendar.events.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-[var(--text-muted)]">
                <CalendarCheck className="h-8 w-8 text-[var(--accent-gold)]" aria-hidden />
                Καθαρό ημερολόγιο
              </div>
            ) : (
              <ul className="space-y-2">
                {[...briefing.calendar.events]
                  .sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""))
                  .slice(0, 12)
                  .map((e, i) => (
                    <li
                      key={`${e.start ?? ""}-${e.title ?? ""}-${i}`}
                      className="flex items-start gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-[color-mix(in_srgb,var(--bg-elevated)_50%,transparent)]"
                    >
                      <span
                        className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: CAL_EVENT_COLORS[i % CAL_EVENT_COLORS.length] }}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium tabular-nums text-[var(--text-muted)]">
                          {formatCalendarTime(e.start)}
                        </p>
                        <p className="truncate text-sm font-medium text-[var(--text-primary)]">{e.title ?? "—"}</p>
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </div>

          <div className={BRIEF_CARD}>
            <h3 className={BRIEF_SECTION}>Εκκρεμή Αιτήματα &gt;7 ημέρες</h3>
            {briefing.overdueTop5.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">Κανένα αίτημα σε εκκρεμότητα &gt;7 ημερών.</p>
            ) : (
              <ul className="space-y-2">
                {briefing.overdueTop5.map((r) => {
                  const days = daysSinceCreated(r.created_at);
                  return (
                    <li key={r.id}>
                      <Link
                        href={`/requests/${r.id}`}
                        className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-[color-mix(in_srgb,var(--bg-elevated)_50%,transparent)]"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                            {r.request_code ? `${r.request_code} · ` : ""}
                            {r.title ?? "—"}
                          </p>
                          <p className="text-[11px] text-[var(--text-muted)]">{r.status ?? "—"}</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] px-2 py-0.5 text-xs font-medium text-[var(--danger)]">
                          {days} ημ.
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            <Link
              href="/requests?overdue=true"
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-gold)] hover:underline"
            >
              Προβολή όλων
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        </div>

        <div className="grid gap-4 border-t border-[var(--border)] pt-4 lg:grid-cols-2">
          <div className={BRIEF_CARD}>
            <h3 className={BRIEF_SECTION}>Ενεργές Καμπάνιες</h3>
            {briefing.campaigns.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">Καμία ενεργή καμπάνια</p>
            ) : (
              <ul className="space-y-2">
                {briefing.campaigns.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-elevated)_40%,transparent)] px-3 py-2.5"
                  >
                    <p className="font-medium text-[var(--text-primary)]">{c.name}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-[var(--text-muted)]">{c.callsTotal} κλήσεις</span>
                      <span className="rounded-full bg-[color-mix(in_srgb,var(--success)_12%,transparent)] px-2 py-0.5 font-medium text-[var(--success)]">
                        {c.positive} θετικές
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={BRIEF_CARD}>
            <h3 className={BRIEF_SECTION}>Ονομαστικές εορτές &amp; γενέθλια</h3>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Ονομαστικές εορτές
              {briefing.namedays.names.length > 0 ? ` · ${briefing.namedays.names.slice(0, 3).join(", ")}` : ""}
            </p>
            {briefing.namedayContacts.length === 0 ? (
              <p className="mb-4 text-sm text-[var(--text-muted)]">Καμία επαφή με ονομαστική σήμερα.</p>
            ) : (
              <ul className="mb-4 space-y-1">
                {briefing.namedayContacts.slice(0, 10).map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/contacts/${c.id}`}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[var(--text-primary)] transition-colors hover:bg-[color-mix(in_srgb,var(--bg-elevated)_50%,transparent)]"
                    >
                      <Sparkles className="h-3.5 w-3.5 shrink-0 text-[var(--accent-gold)]" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            <div className="border-t border-[var(--border)] pt-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Γενέθλια σήμερα
              </p>
              {briefing.birthdayContacts.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">Κανένα γενέθλιο σήμερα.</p>
              ) : (
                <ul className="space-y-1">
                  {briefing.birthdayContacts.map((c) => {
                    const age = getAgeFromBirthday(c.birthday);
                    const name = `${c.first_name} ${c.last_name}`.trim();
                    return (
                      <li key={c.id}>
                        <Link
                          href={`/contacts/${c.id}`}
                          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-[color-mix(in_srgb,var(--bg-elevated)_50%,transparent)]"
                        >
                          <Cake className="h-3.5 w-3.5 shrink-0 text-[var(--accent-gold)]" aria-hidden />
                          <span className="min-w-0 flex-1 truncate text-[var(--text-primary)]">{name}</span>
                          {age != null ? (
                            <span className="shrink-0 text-xs text-[var(--text-muted)]">{age} ετών</span>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
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
          title="Εκκρεμεί επαφών"
          value={safePendingContacts}
          numeric={safePendingContacts}
          hint="Χρειάζονται follow-up"
          icon={Clock3}
          iconBg="bg-[color-mix(in_srgb,var(--text-muted)_25%,transparent)]"
          iconColor="text-[var(--text-secondary)]"
          sub={<span className="text-xs font-medium text-[var(--text-subtitle)]">Αναμονή / φίλτρα</span>}
          stagger="hq-stagger-3"
        />
        <Stat
          title="Υποστηρικτές (εγγραφές)"
          value={safeSupporterCount}
          numeric={safeSupporterCount}
          hint="Καταγραφές υποστήριξης"
          icon={HandHeart}
          iconBg="bg-[var(--accent-gold)]/15"
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
          iconColor="text-[var(--success)]"
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
              const palette = [
                "var(--accent-gold)",
                "var(--success)",
                "var(--accent-blue-bright)",
                "color-mix(in srgb, var(--accent-gold) 55%, var(--accent-blue))",
                "var(--danger)",
              ];
              const dot = palette[i % palette.length];
              return (
                <li
                  key={item.id}
                  className="hq-stagger-item border-b border-[var(--border)]/50 py-4 last:border-0 [animation:hq-stagger-fade_0.45s_ease_both]"
                  style={{ ["--stagger" as string]: String(i), ["--activity-dot" as string]: dot }}
                >
                  <div className="flex gap-3 pl-1">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-gradient-to-br from-[var(--accent-gold)]/30 to-[var(--accent-blue)]/30 text-xs font-bold text-foreground">
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
      className="hq-stagger-item group flex cursor-pointer items-center gap-3 rounded-[12px] border border-border bg-[color-mix(in_srgb,var(--bg-elevated)_50%,var(--bg-card))] p-4 transition duration-200 will-change-transform hover:scale-[1.02] hover:border-[var(--accent-gold)]/70 hover:bg-[color-mix(in_srgb,var(--accent-gold)_8%,var(--bg-card))]"
    >
      <div
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${iconWrapClass}`}
        aria-hidden
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-[var(--accent-gold)]" aria-hidden />
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
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card",
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

