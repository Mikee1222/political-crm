"use client";

import {
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { el } from "date-fns/locale";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MouseEvent,
  type RefObject,
  type SetStateAction,
} from "react";
import type { LucideIcon } from "lucide-react";
import {
  Calendar,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  LayoutGrid,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  RefreshCw,
  Search,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { lux, priorityPill } from "@/lib/luxury-styles";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { PortalDropdownPanel, usePortalDropdown } from "@/components/ui/portal-dropdown";
import { EmptyState } from "@/components/ui/empty-state";
import { useFormToast } from "@/contexts/form-toast-context";
import { useProfile } from "@/contexts/profile-context";
import { hasMinRole } from "@/lib/roles";

type ViewMode = "week" | "month" | "kanban";

type SchedulerRequest = {
  id: string;
  request_code: string | null;
  title: string;
  status: string | null;
  priority: string | null;
  category: string | null;
  scheduled_date: string | null;
  assigned_to: string | null;
  created_at: string | null;
  contacts: { first_name: string; last_name: string } | null;
};

type MobilePanel = "queue" | "calendar";

type CalFilter = {
  q: string;
  category: string;
  priority: string;
  status: string;
  assignedTo: string;
};

const EMPTY_CAL_FILTER: CalFilter = {
  q: "",
  category: "",
  priority: "",
  status: "",
  assignedTo: "",
};

type StaffUser = { id: string; full_name: string | null; email?: string | null; role?: string };

function appendCalFilterParams(params: URLSearchParams, calFilter: CalFilter) {
  if (calFilter.q.trim()) params.set("q", calFilter.q.trim());
  if (calFilter.category) params.set("category", calFilter.category);
  if (calFilter.priority) params.set("priority", calFilter.priority);
  if (calFilter.status) params.set("status", calFilter.status);
  if (calFilter.assignedTo) params.set("assigned_to", calFilter.assignedTo);
}

function SchedulerFilterBar({
  calFilter,
  setCalFilter,
  categories,
  staffUsers,
  isMobile,
  filtersOpen,
  onToggleFilters,
}: {
  calFilter: CalFilter;
  setCalFilter: Dispatch<SetStateAction<CalFilter>>;
  categories: string[];
  staffUsers: StaffUser[];
  isMobile: boolean;
  filtersOpen: boolean;
  onToggleFilters: () => void;
}) {
  const hasActive =
    Boolean(calFilter.q || calFilter.category || calFilter.priority || calFilter.status || calFilter.assignedTo);

  const fields = (
    <div className="flex flex-wrap gap-2">
      <div className="relative min-w-40 flex-1">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="text"
          placeholder="Τίτλος ή τηλέφωνο..."
          value={calFilter.q}
          onChange={(e) => setCalFilter((p) => ({ ...p, q: e.target.value }))}
          className="w-full rounded-lg border border-border bg-card py-2 pl-8 pr-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]/40"
        />
      </div>
      <select
        value={calFilter.category}
        onChange={(e) => setCalFilter((p) => ({ ...p, category: e.target.value }))}
        className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none"
        aria-label="Κατηγορία"
      >
        <option value="">Κατηγορία</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <select
        value={calFilter.priority}
        onChange={(e) => setCalFilter((p) => ({ ...p, priority: e.target.value }))}
        className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none"
        aria-label="Προτεραιότητα"
      >
        <option value="">Προτεραιότητα</option>
        <option value="Urgent">Επείγον</option>
        <option value="High">Υψηλή</option>
        <option value="Medium">Μεσαία</option>
        <option value="Low">Χαμηλή</option>
      </select>
      <select
        value={calFilter.status}
        onChange={(e) => setCalFilter((p) => ({ ...p, status: e.target.value }))}
        className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none"
        aria-label="Κατάσταση"
      >
        <option value="">Κατάσταση</option>
        <option value="Νέο">Νέο</option>
        <option value="Σε εξέλιξη">Σε εξέλιξη</option>
        <option value="Ολοκληρώθηκε">Ολοκληρώθηκε</option>
        <option value="Απορρίφθηκε">Απορρίφθηκε</option>
      </select>
      <select
        value={calFilter.assignedTo}
        onChange={(e) => setCalFilter((p) => ({ ...p, assignedTo: e.target.value }))}
        className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none"
        aria-label="Ανάθεση"
      >
        <option value="">Ανάθεση</option>
        {staffUsers.map((u) => (
          <option key={u.id} value={u.id}>
            {u.full_name?.trim() || u.email || `Χρήστης ${u.id.slice(0, 8)}…`}
          </option>
        ))}
      </select>
      {hasActive ? (
        <button
          type="button"
          onClick={() => setCalFilter(EMPTY_CAL_FILTER)}
          className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-[color-mix(in_srgb,var(--bg-elevated)_70%,var(--bg-card))]"
        >
          <X className="h-3 w-3" aria-hidden />
          Καθαρισμός
        </button>
      ) : null}
    </div>
  );

  return (
    <div className="mb-4">
      {isMobile ? (
        <>
          <button
            type="button"
            onClick={onToggleFilters}
            className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card py-2 text-sm font-semibold text-foreground"
          >
            Φίλτρα
            {hasActive ? (
              <span className="rounded-full bg-[var(--accent-gold)]/20 px-2 py-0.5 text-[10px] font-bold text-[var(--accent-gold)]">
                Ενεργά
              </span>
            ) : null}
          </button>
          {filtersOpen ? fields : null}
        </>
      ) : (
        fields
      )}
    </div>
  );
}

const KANBAN_COLUMNS: {
  status: string;
  color: string;
  Icon: LucideIcon;
  dotClass: string;
}[] = [
  { status: "Νέο", color: "border-blue-500", Icon: Circle, dotClass: "text-blue-500 fill-blue-500" },
  { status: "Σε εξέλιξη", color: "border-orange-500", Icon: Circle, dotClass: "text-orange-500 fill-orange-500" },
  { status: "Ολοκληρώθηκε", color: "border-green-500", Icon: Circle, dotClass: "text-green-500 fill-green-500" },
  { status: "Απορρίφθηκε", color: "border-red-500", Icon: Circle, dotClass: "text-red-500 fill-red-500" },
];

const WEEKDAY_HEADERS = ["ΔΕΥ", "ΤΡΙ", "ΤΕΤ", "ΠΕΜ", "ΠΑΡ", "ΣΑΒ", "ΚΥΡ"] as const;

function contactLabel(c: SchedulerRequest["contacts"]) {
  if (!c) return "—";
  return `${c.first_name} ${c.last_name}`.trim() || "—";
}

function formatScheduleToastDate(ymd: string) {
  const d = parseISO(ymd);
  return d.toLocaleDateString("el-GR", { day: "numeric", month: "numeric", year: "numeric" });
}

function weekDays(weekStartYmd: string) {
  const start = parseISO(weekStartYmd);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return format(d, "yyyy-MM-dd");
  });
}

function priorityLeftBorder(p: string | null | undefined) {
  switch (p) {
    case "Urgent":
      return "border-l-red-500";
    case "High":
      return "border-l-orange-500";
    case "Medium":
      return "border-l-yellow-500";
    case "Low":
      return "border-l-blue-400";
    default:
      return "border-l-[var(--accent-gold)]";
  }
}

function priorityDotClass(p: string | null | undefined) {
  switch (p) {
    case "Urgent":
      return "bg-red-500";
    case "High":
      return "bg-orange-500";
    case "Medium":
      return "bg-yellow-500";
    case "Low":
      return "bg-blue-400";
    default:
      return "bg-[var(--accent-gold)]";
  }
}

function mapApiRow(row: Record<string, unknown>): SchedulerRequest {
  const c = row.contacts;
  const contact = Array.isArray(c) ? (c[0] as SchedulerRequest["contacts"]) : (c as SchedulerRequest["contacts"]);
  return {
    id: String(row.id),
    request_code: (row.request_code as string | null) ?? null,
    title: String(row.title ?? ""),
    status: (row.status as string | null) ?? null,
    priority: (row.priority as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    scheduled_date: (row.scheduled_date as string | null) ?? null,
    assigned_to: (row.assigned_to as string | null) ?? null,
    created_at: (row.created_at as string | null) ?? null,
    contacts: contact ?? null,
  };
}

function ViewSwitcher({ viewMode, setViewMode }: { viewMode: ViewMode; setViewMode: (m: ViewMode) => void }) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setViewMode("week")}
        className={cn(
          "px-3 py-1.5 text-xs font-medium",
          viewMode === "week"
            ? "bg-[var(--accent-gold)] text-[var(--text-badge-on-gold)]"
            : "text-muted-foreground hover:bg-[color-mix(in_srgb,var(--bg-elevated)_55%,var(--bg-card))]",
        )}
      >
        <CalendarDays className="mr-1 inline h-3.5 w-3.5" />
        Εβδομάδα
      </button>
      <button
        type="button"
        onClick={() => setViewMode("month")}
        className={cn(
          "border-x border-border px-3 py-1.5 text-xs font-medium",
          viewMode === "month"
            ? "bg-[var(--accent-gold)] text-[var(--text-badge-on-gold)]"
            : "text-muted-foreground hover:bg-[color-mix(in_srgb,var(--bg-elevated)_55%,var(--bg-card))]",
        )}
      >
        <Calendar className="mr-1 inline h-3.5 w-3.5" />
        Μήνας
      </button>
      <button
        type="button"
        onClick={() => setViewMode("kanban")}
        className={cn(
          "px-3 py-1.5 text-xs font-medium",
          viewMode === "kanban"
            ? "bg-[var(--accent-gold)] text-[var(--text-badge-on-gold)]"
            : "text-muted-foreground hover:bg-[color-mix(in_srgb,var(--bg-elevated)_55%,var(--bg-card))]",
        )}
      >
        <LayoutGrid className="mr-1 inline h-3.5 w-3.5" />
        Kanban
      </button>
    </div>
  );
}

export default function RequestsSchedulerPage() {
  const { profile } = useProfile();
  const { showToast } = useFormToast();
  const canManage = hasMinRole(profile?.role, "manager");

  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [weekStart, setWeekStart] = useState(() =>
    format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"),
  );
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  const [queue, setQueue] = useState<SchedulerRequest[]>([]);
  const [scheduled, setScheduled] = useState<SchedulerRequest[]>([]);
  const [kanbanByStatus, setKanbanByStatus] = useState<Record<string, SchedulerRequest[]>>({});
  const [loading, setLoading] = useState(true);
  const [kanbanLoading, setKanbanLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("queue");
  const [scheduleOpenId, setScheduleOpenId] = useState<string | null>(null);
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const [queueOpen, setQueueOpen] = useState(true);
  const [confirmPopover, setConfirmPopover] = useState<{
    requestId: string;
    x: number;
    y: number;
    kanbanFromStatus?: string;
  } | null>(null);
  const confirmPopoverRef = useRef<HTMLDivElement | null>(null);
  const [aiSummaries, setAiSummaries] = useState<Record<string, string>>({});
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});
  const [calFilter, setCalFilter] = useState<CalFilter>(EMPTY_CAL_FILTER);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);

  const days = useMemo(() => weekDays(weekStart), [weekStart]);
  const monthStartYmd = format(startOfMonth(monthCursor), "yyyy-MM-dd");
  const monthEndYmd = format(endOfMonth(monthCursor), "yyyy-MM-dd");

  const scheduledByDay = useMemo(() => {
    const m = new Map<string, SchedulerRequest[]>();
    for (const d of days) m.set(d, []);
    for (const r of scheduled) {
      const key = r.scheduled_date ?? "";
      if (m.has(key)) m.get(key)!.push(r);
    }
    return m;
  }, [scheduled, days]);

  const scheduledByDateMonth = useMemo(() => {
    const m = new Map<string, SchedulerRequest[]>();
    for (const r of scheduled) {
      const key = r.scheduled_date ?? "";
      if (!key) continue;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    }
    return m;
  }, [scheduled]);

  const monthGridDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(monthCursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(monthCursor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [monthCursor]);

  const loadScheduler = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (viewMode === "month") {
        params.set("week_start", monthStartYmd);
        params.set("week_end", monthEndYmd);
      } else {
        params.set("week", weekStart);
      }
      appendCalFilterParams(params, calFilter);
      const res = await fetchWithTimeout(`/api/requests/scheduler?${params.toString()}`);
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        queue?: SchedulerRequest[];
        scheduled?: SchedulerRequest[];
        weekStart?: string;
      };
      if (!res.ok) {
        setError(j.error ?? "Σφάλμα φόρτωσης");
        setQueue([]);
        setScheduled([]);
        return;
      }
      setQueue(j.queue ?? []);
      setScheduled(j.scheduled ?? []);
      if (j.weekStart && viewMode === "week") setWeekStart(j.weekStart);
    } catch {
      setError("Σφάλμα δικτύου");
    } finally {
      setLoading(false);
    }
  }, [weekStart, monthStartYmd, monthEndYmd, viewMode, calFilter]);

  const loadKanban = useCallback(async () => {
    setKanbanLoading(true);
    setError(null);
    try {
      const base = new URLSearchParams();
      base.set("page_size", "100");
      appendCalFilterParams(base, calFilter);

      const entries = await Promise.all(
        KANBAN_COLUMNS.map(async (col) => {
          if (calFilter.status && calFilter.status !== col.status) {
            return [col.status, []] as const;
          }
          const p = new URLSearchParams(base);
          p.set("status", col.status);
          const res = await fetchWithTimeout(`/api/requests?${p.toString()}`);
          const j = (await res.json().catch(() => ({}))) as {
            data?: Record<string, unknown>[];
            requests?: Record<string, unknown>[];
            error?: string;
          };
          if (!res.ok) throw new Error(j.error ?? "Σφάλμα Kanban");
          const rows = j.data ?? j.requests ?? [];
          return [col.status, rows.map(mapApiRow)] as const;
        }),
      );
      setKanbanByStatus(Object.fromEntries(entries));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Σφάλμα δικτύου");
    } finally {
      setKanbanLoading(false);
    }
  }, [calFilter]);

  useEffect(() => {
    if (!canManage) return;
    void fetchWithTimeout("/api/request-categories").then(async (res) => {
      if (!res.ok) return;
      const j = (await res.json()) as { categories?: { name: string }[] | string[] };
      const raw = j.categories ?? [];
      setCategoryOptions(
        raw.map((c) => (typeof c === "string" ? c : c.name)).filter(Boolean),
      );
    });
    void fetchWithTimeout("/api/team/assignees").then(async (res) => {
      if (!res.ok) return;
      const j = (await res.json()) as { assignees?: StaffUser[] };
      setStaffUsers(
        (j.assignees ?? []).filter((a) => hasMinRole(a.role, "caller")),
      );
    });
  }, [canManage]);

  useEffect(() => {
    if (!canManage) return;
    if (viewMode === "kanban") {
      void loadKanban();
    } else {
      void loadScheduler();
    }
  }, [canManage, viewMode, loadKanban, loadScheduler]);

  useEffect(() => {
    if (viewMode === "kanban") setMobilePanel("calendar");
  }, [viewMode]);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const weekDayColumns = useMemo(
    () =>
      days.map((ymd) => {
        const d = parseISO(ymd);
        return {
          date: ymd,
          dayName: format(d, "EEE", { locale: el }).toUpperCase(),
          dayNum: format(d, "d"),
          requests: scheduledByDay.get(ymd) ?? [],
          today: isToday(d),
        };
      }),
    [days, scheduledByDay],
  );

  useEffect(() => {
    if (viewMode !== "week" || !isMobile) return;
    const t = window.setTimeout(() => {
      document.getElementById("today-col")?.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    }, 120);
    return () => window.clearTimeout(t);
  }, [weekStart, viewMode, mobilePanel, isMobile]);

  const shiftWeek = (delta: number) => {
    const d = parseISO(weekStart);
    setWeekStart(format(startOfWeek(addWeeks(d, delta), { weekStartsOn: 1 }), "yyyy-MM-dd"));
  };

  const shiftMonth = (delta: number) => {
    setMonthCursor((m) => addMonths(m, delta));
  };

  const goToWeekContaining = (ymd: string) => {
    const d = parseISO(ymd);
    setWeekStart(format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd"));
    setViewMode("week");
    setMobilePanel("calendar");
  };

  const scheduleRequest = async (requestId: string, scheduledDate: string) => {
    setSchedulingId(requestId);
    const prevQueue = queue;
    const prevScheduled = scheduled;
    const item = queue.find((r) => r.id === requestId);
    if (!item) {
      setSchedulingId(null);
      return;
    }
    const optimistic: SchedulerRequest = { ...item, scheduled_date: scheduledDate };
    setQueue((q) => q.filter((r) => r.id !== requestId));
    setScheduled((s) => [...s, optimistic]);
    setScheduleOpenId(null);

    try {
      const res = await fetchWithTimeout("/api/requests/schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: requestId, scheduled_date: scheduledDate }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; request?: SchedulerRequest };
      if (!res.ok) {
        setQueue(prevQueue);
        setScheduled(prevScheduled);
        showToast(j.error ?? "Σφάλμα προγραμματισμού", "error");
        return;
      }
      if (j.request) {
        setScheduled((s) => s.map((r) => (r.id === requestId ? { ...r, ...j.request } : r)));
      }
      showToast(`Αίτημα προγραμματίστηκε για ${formatScheduleToastDate(scheduledDate)}`, "success");
      if (mobilePanel === "queue") setMobilePanel("calendar");
    } catch {
      setQueue(prevQueue);
      setScheduled(prevScheduled);
      showToast("Σφάλμα δικτύου", "error");
    } finally {
      setSchedulingId(null);
    }
  };

  const handleAiSummary = async (request: SchedulerRequest) => {
    if (aiSummaries[request.id]) {
      setAiSummaries((prev) => {
        const n = { ...prev };
        delete n[request.id];
        return n;
      });
      return;
    }
    setAiLoading((prev) => ({ ...prev, [request.id]: true }));
    try {
      const res = await fetch("/api/requests-scheduler/ai-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: request.id }),
      });
      const text = await res.text();
      console.log("AI summary raw response:", text);
      const data = JSON.parse(text) as { summary?: string; error?: string };
      console.log("AI summary parsed:", data);
      const summary =
        data.summary ?? data.error ?? "Δεν ήταν δυνατή η δημιουργία σύνοψης.";
      setAiSummaries((prev) => ({ ...prev, [request.id]: summary }));
    } catch (err) {
      console.error("AI summary fetch error:", err);
      setAiSummaries((prev) => ({ ...prev, [request.id]: "Σφάλμα σύνδεσης." }));
    } finally {
      setAiLoading((prev) => ({ ...prev, [request.id]: false }));
    }
  };

  const handleReject = async (id: string) => {
    if (!confirm("Να απορριφθεί το αίτημα;")) return;
    const prevQueue = queue;
    setQueue((prev) => prev.filter((r) => r.id !== id));
    try {
      const res = await fetchWithTimeout(`/api/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Απορρίφθηκε" }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setQueue(prevQueue);
        showToast(j.error ?? "Σφάλμα", "error");
        return;
      }
      showToast("Το αίτημα απορρίφθηκε.", "success");
    } catch {
      setQueue(prevQueue);
      showToast("Σφάλμα δικτύου", "error");
    }
  };

  const patchStatus = async (id: string, status: string) => {
    const res = await fetchWithTimeout(`/api/requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(j.error ?? "Σφάλμα");
  };

  const completeRequest = async (id: string) => {
    const prev = scheduled;
    setScheduled((s) => s.map((r) => (r.id === id ? { ...r, status: "Ολοκληρώθηκε" } : r)));
    try {
      await patchStatus(id, "Ολοκληρώθηκε");
      showToast("Το αίτημα ολοκληρώθηκε.", "success");
    } catch (e) {
      setScheduled(prev);
      showToast(e instanceof Error ? e.message : "Σφάλμα", "error");
      throw e;
    }
  };

  const completeKanbanCard = async (id: string, fromStatus: string) => {
    const prev = kanbanByStatus;
    const card = kanbanByStatus[fromStatus]?.find((r) => r.id === id);
    if (!card) return;
    const updated = { ...card, status: "Ολοκληρώθηκε" };
    setKanbanByStatus((board) => {
      const next = { ...board };
      next[fromStatus] = (next[fromStatus] ?? []).filter((r) => r.id !== id);
      next["Ολοκληρώθηκε"] = [updated, ...(next["Ολοκληρώθηκε"] ?? [])];
      return next;
    });
    try {
      await patchStatus(id, "Ολοκληρώθηκε");
      showToast("Το αίτημα ολοκληρώθηκε.", "success");
    } catch (e) {
      setKanbanByStatus(prev);
      showToast(e instanceof Error ? e.message : "Σφάλμα", "error");
    }
  };

  const refresh = () => {
    if (viewMode === "kanban") void loadKanban();
    else void loadScheduler();
  };

  const handleTickClick = (e: MouseEvent<HTMLButtonElement>, requestId: string, kanbanFromStatus?: string) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setConfirmPopover((prev) =>
      prev?.requestId === requestId
        ? null
        : { requestId, x: rect.left, y: rect.bottom + 8, kanbanFromStatus },
    );
  };

  const handleCompleteFromPopover = async (requestId: string) => {
    const fromStatus = confirmPopover?.kanbanFromStatus;
    try {
      if (fromStatus) {
        await completeKanbanCard(requestId, fromStatus);
      } else {
        await completeRequest(requestId);
      }
    } catch {
      /* toast in complete* */
    }
    setConfirmPopover(null);
  };

  useEffect(() => {
    if (!confirmPopover || isMobile) return;
    const close = (ev: Event) => {
      const target = ev.target as Node;
      if (confirmPopoverRef.current?.contains(target)) return;
      setConfirmPopover(null);
    };
    const t = window.setTimeout(() => {
      window.addEventListener("click", close);
    }, 0);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("click", close);
    };
  }, [confirmPopover, isMobile]);

  if (!canManage) {
    return (
      <div className="space-y-6 px-6 py-6">
        <PageHeader title="Πρόγραμμα Αιτημάτων" subtitle="Διαθέσιμο σε managers." />
        <p className="text-sm text-muted-foreground">Δεν έχετε πρόσβαση σε αυτή τη σελίδα.</p>
      </div>
    );
  }

  const weekLabel = (() => {
    const start = parseISO(weekStart);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return `${format(start, "d MMM", { locale: el })} – ${format(end, "d MMM yyyy", { locale: el })}`;
  })();

  const showQueuePanel = viewMode !== "kanban";
  const isBusy = viewMode === "kanban" ? kanbanLoading : loading;

  return (
    <div className="space-y-6 px-4 py-4 sm:px-6 sm:py-6">
      <PageHeader
        title="Πρόγραμμα Αιτημάτων"
        subtitle="Ουρά, εβδομαδιαίο/μηνιαίο ημερολόγιο και Kanban ανά κατάσταση."
        actions={
          <button
            type="button"
            onClick={refresh}
            disabled={isBusy}
            className={lux.btnSecondary + " !rounded-full !py-2 !text-sm"}
            aria-label="Ανανέωση"
          >
            <RefreshCw className={`h-4 w-4 ${isBusy ? "animate-spin" : ""}`} />
            Ανανέωση
          </button>
        }
      />

      {error ? (
        <div className="rounded-xl border border-[var(--danger)]/40 bg-[color-mix(in_srgb,var(--danger)_12%,var(--bg-card))] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      {showQueuePanel ? (
        <div className="mb-4 flex gap-1 overflow-hidden rounded-xl border border-border bg-[color-mix(in_srgb,var(--bg-elevated)_55%,var(--bg-card))] p-1 lg:hidden">
          <button
            type="button"
            onClick={() => setMobilePanel("queue")}
            className={cn(
              "flex-1 rounded-lg py-2.5 text-sm font-semibold transition-colors",
              mobilePanel === "queue" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
            )}
          >
            Ουρά ({queue.length})
          </button>
          <button
            type="button"
            onClick={() => setMobilePanel("calendar")}
            className={cn(
              "flex-1 rounded-lg py-2.5 text-sm font-semibold transition-colors",
              mobilePanel === "calendar" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
            )}
          >
            Ημερολόγιο
          </button>
        </div>
      ) : null}

      <div
        className={cn(
          "flex min-h-[calc(100vh-220px)] flex-col gap-4 lg:flex-row lg:gap-6",
          viewMode === "kanban" && "lg:flex-col",
        )}
      >
        {showQueuePanel ? (
          <div
            className={cn(
              "flex shrink-0 overflow-hidden transition-all duration-300",
              mobilePanel === "calendar" ? "hidden lg:flex" : "flex",
              "max-lg:w-full max-lg:max-w-full",
              queueOpen ? "lg:w-80" : "lg:w-10",
            )}
          >
            {!queueOpen ? (
              <button
                type="button"
                onClick={() => setQueueOpen(true)}
                className="hidden h-full min-h-[calc(100vh-220px)] w-10 flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card text-muted-foreground shadow-[var(--card-shadow)] transition-colors hover:text-foreground lg:flex"
                aria-label="Άνοιγμα ουράς"
              >
                <PanelLeftOpen className="h-4 w-4" />
                <span className="text-[10px] uppercase tracking-widest [writing-mode:vertical-lr] rotate-180">
                  Ουρά
                </span>
              </button>
            ) : null}
            {queueOpen ? (
              <section
                className="flex min-h-[calc(100vh-220px)] w-full max-w-full flex-col rounded-2xl border border-border bg-card shadow-[var(--card-shadow)] lg:w-80"
                aria-label="Ουρά αιτημάτων"
              >
                <div className="border-b border-border px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--accent-gold)]">
                        Ουρά ({queue.length})
                      </h2>
                      <p className="mt-1 text-xs text-muted-foreground">Χωρίς προγραμματισμένη ημερομηνία</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setQueueOpen((p) => !p)}
                      className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground lg:flex"
                    >
                      {queueOpen ? (
                        <PanelLeftClose className="h-4 w-4" />
                      ) : (
                        <PanelLeftOpen className="h-4 w-4" />
                      )}
                      {queueOpen ? "Σύμπτυξη" : "Ουρά"}
                    </button>
                  </div>
                  <SchedulerFilterBar
                    calFilter={calFilter}
                    setCalFilter={setCalFilter}
                    categories={categoryOptions}
                    staffUsers={staffUsers}
                    isMobile={isMobile}
                    filtersOpen={filtersOpen}
                    onToggleFilters={() => setFiltersOpen((o) => !o)}
                  />
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  {loading && queue.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">Φόρτωση…</p>
                  ) : queue.length === 0 ? (
                    <EmptyState
                      title="Κενή ουρά"
                      subtitle="Όλα τα ενεργά αιτήματα έχουν προγραμματιστεί ή δεν υπάρχουν ανοιχτά."
                      className="!py-8"
                    />
                  ) : (
                    <ul className="space-y-3">
                      {queue.map((r) => (
                        <QueueCard
                          key={r.id}
                          request={r}
                          scheduleOpen={scheduleOpenId === r.id}
                          scheduling={schedulingId === r.id}
                          aiLoading={!!aiLoading[r.id]}
                          aiSummary={aiSummaries[r.id]}
                          onToggleSchedule={() =>
                            setScheduleOpenId((id) => (id === r.id ? null : r.id))
                          }
                          onSchedule={(date) => void scheduleRequest(r.id, date)}
                          onReject={() => void handleReject(r.id)}
                          onAiSummary={() => void handleAiSummary(r)}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}

        <section
          className={cn(
            "flex min-h-[calc(100vh-220px)] min-w-0 flex-1 flex-col rounded-2xl border border-border bg-card shadow-[var(--card-shadow)]",
            showQueuePanel && mobilePanel === "queue" ? "hidden lg:flex" : "flex",
          )}
          aria-label="Προβολή αιτημάτων"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--accent-gold)]">
                {viewMode === "kanban" ? "Kanban" : viewMode === "month" ? "Μηνιαίο ημερολόγιο" : "Εβδομαδιαίο ημερολόγιο"}
              </h2>
              {viewMode === "week" ? (
                <p className="mt-0.5 text-sm font-medium text-foreground">{weekLabel}</p>
              ) : viewMode === "month" ? (
                <p className="mt-0.5 text-sm font-medium capitalize text-foreground">
                  {format(monthCursor, "LLLL yyyy", { locale: el })}
                </p>
              ) : (
                <p className="mt-0.5 text-sm text-muted-foreground">Ανά κατάσταση αιτήματος</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {viewMode === "week" ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => shiftWeek(-1)}
                    className={cn(
                      lux.btnIcon,
                      "max-lg:flex max-lg:h-10 max-lg:w-10 max-lg:items-center max-lg:justify-center max-lg:rounded-xl max-lg:border max-lg:border-border max-lg:touch-manipulation",
                    )}
                    aria-label="Προηγούμενη εβδομάδα"
                  >
                    <ChevronLeft className="h-4 w-4 max-lg:h-5 max-lg:w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setWeekStart(format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"))
                    }
                    className={lux.btnSecondary + " !px-3 !py-1.5 !text-xs max-lg:!min-h-10"}
                  >
                    Σήμερα
                  </button>
                  <button
                    type="button"
                    onClick={() => shiftWeek(1)}
                    className={cn(
                      lux.btnIcon,
                      "max-lg:flex max-lg:h-10 max-lg:w-10 max-lg:items-center max-lg:justify-center max-lg:rounded-xl max-lg:border max-lg:border-border max-lg:touch-manipulation",
                    )}
                    aria-label="Επόμενη εβδομάδα"
                  >
                    <ChevronRight className="h-4 w-4 max-lg:h-5 max-lg:w-5" />
                  </button>
                </div>
              ) : null}
              {viewMode === "month" ? (
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => shiftMonth(-1)} className={lux.btnIcon} aria-label="Προηγούμενος μήνας">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setMonthCursor(startOfMonth(new Date()))}
                    className={lux.btnSecondary + " !px-3 !py-1.5 !text-xs"}
                  >
                    Σήμερα
                  </button>
                  <button type="button" onClick={() => shiftMonth(1)} className={lux.btnIcon} aria-label="Επόμενος μήνας">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              ) : null}
              <ViewSwitcher viewMode={viewMode} setViewMode={setViewMode} />
            </div>
          </div>

          <div className="border-b border-border px-4 py-3">
            <SchedulerFilterBar
              calFilter={calFilter}
              setCalFilter={setCalFilter}
              categories={categoryOptions}
              staffUsers={staffUsers}
              isMobile={isMobile}
              filtersOpen={filtersOpen}
              onToggleFilters={() => setFiltersOpen((o) => !o)}
            />
          </div>

          {viewMode === "kanban" ? (
            <>
              <div className="min-h-0 flex-1 overflow-x-auto p-3">
                <div className="flex min-h-[calc(100vh-280px)] gap-3">
                  {KANBAN_COLUMNS.map((col) => {
                    const items = kanbanByStatus[col.status] ?? [];
                    return (
                      <div
                        key={col.status}
                        className={cn(
                          "flex min-w-48 flex-1 flex-col rounded-xl border border-border bg-[color-mix(in_srgb,var(--bg-elevated)_30%,var(--bg-card))]",
                          "border-t-[3px]",
                          col.color.replace("border-", "border-t-"),
                        )}
                      >
                        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-foreground">
                            <col.Icon className={cn("h-3 w-3 shrink-0", col.dotClass)} aria-hidden />
                            {col.status}
                          </span>
                          <span className="rounded-full bg-[color-mix(in_srgb,var(--bg-elevated)_80%,var(--bg-card))] px-2 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
                            {items.length}
                          </span>
                        </div>
                        <ul className="flex max-h-[calc(100vh-280px)] flex-1 flex-col gap-2 overflow-y-auto p-2">
                          {kanbanLoading && items.length === 0 ? (
                            <li className="py-6 text-center text-xs text-muted-foreground">Φόρτωση…</li>
                          ) : items.length === 0 ? (
                            <li className="flex min-h-[8rem] items-center justify-center rounded-lg border border-dashed border-border px-2 text-center text-xs text-muted-foreground">
                              Κανένα αίτημα
                            </li>
                          ) : (
                            items.map((r) => (
                              <KanbanCard
                                key={r.id}
                                request={r}
                                onTickClick={(e) => handleTickClick(e, r.id, col.status)}
                              />
                            ))
                          )}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : viewMode === "month" ? (
            <div className="min-h-0 flex-1 overflow-auto p-3">
              <div className="mb-2 grid grid-cols-7 gap-1">
                {WEEKDAY_HEADERS.map((h) => (
                  <div key={h} className="py-1 text-center text-[10px] font-bold text-muted-foreground">
                    {h}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {monthGridDays.map((d) => {
                  const ymd = format(d, "yyyy-MM-dd");
                  const inMonth = isSameMonth(d, monthCursor);
                  const today = isToday(d);
                  const items = scheduledByDateMonth.get(ymd) ?? [];
                  const visible = items.slice(0, 3);
                  const extra = items.length - visible.length;
                  return (
                    <button
                      key={ymd}
                      type="button"
                      onClick={() => goToWeekContaining(ymd)}
                      className={cn(
                        "min-h-[5.5rem] rounded-lg border border-border p-1.5 text-left transition hover:border-[var(--accent-gold)]/50",
                        inMonth ? "bg-card" : "bg-[color-mix(in_srgb,var(--bg-elevated)_40%,var(--bg-card))]",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold tabular-nums",
                          !inMonth && "text-muted-foreground opacity-60",
                          inMonth && !today && "text-foreground",
                          today && "bg-[var(--accent-gold)] text-[var(--text-badge-on-gold)]",
                        )}
                      >
                        {format(d, "d")}
                      </span>
                      <ul className="mt-1 space-y-0.5" onClick={(e) => e.stopPropagation()}>
                        {visible.map((r) => (
                          <li key={r.id}>
                            <Link
                              href={`/requests/${r.id}`}
                              className="flex items-center gap-1 rounded px-0.5 py-0.5 text-[10px] hover:bg-[color-mix(in_srgb,var(--accent-gold)_10%,transparent)]"
                            >
                              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", priorityDotClass(r.priority))} />
                              <span className="truncate text-foreground">{r.title}</span>
                            </Link>
                          </li>
                        ))}
                        {extra > 0 ? (
                          <li className="text-[10px] font-medium text-[var(--accent-gold)]">+{extra} ακόμα</li>
                        ) : null}
                      </ul>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <>
              <div className="min-h-0 flex-1 overflow-x-auto overflow-y-visible p-3 lg:hidden">
                <div className="-mx-1 overflow-x-auto px-1">
                  <div className="flex min-w-max gap-2 pb-2">
                    {weekDayColumns.map((day) => (
                      <div
                        key={day.date}
                        id={day.today ? "today-col" : undefined}
                        className={cn(
                          "w-[140px] shrink-0 rounded-xl border-2 p-2",
                          day.today
                            ? "border-[var(--accent-gold)] bg-[color-mix(in_srgb,var(--accent-gold)_8%,var(--bg-card))]"
                            : "border-border bg-card",
                        )}
                      >
                        <div
                          className={cn(
                            "mb-2 border-b border-border pb-2 text-center",
                            day.today ? "text-[var(--accent-gold)]" : "text-muted-foreground",
                          )}
                        >
                          <div className="text-[10px] font-semibold uppercase tracking-widest">{day.dayName}</div>
                          <div
                            className={cn(
                              "mx-auto mt-1 flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold",
                              day.today && "bg-[var(--accent-gold)] text-[var(--text-badge-on-gold)]",
                            )}
                          >
                            {day.dayNum}
                          </div>
                        </div>
                        <div className="min-h-[120px] space-y-1.5">
                          {day.requests.length === 0 ? (
                            <p className="pt-4 text-center text-[10px] text-muted-foreground">Χωρίς αιτήματα</p>
                          ) : (
                            day.requests.map((r) => (
                              <MobileCalendarCard
                                key={r.id}
                                request={r}
                                onTickClick={(e) => handleTickClick(e, r.id)}
                              />
                            ))
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="hidden min-h-0 flex-1 overflow-x-auto overflow-y-visible p-3 lg:block">
                <div className="flex min-h-96 gap-2 overflow-visible">
                  {days.map((ymd) => {
                    const d = parseISO(ymd);
                    const items = scheduledByDay.get(ymd) ?? [];
                    const today = isToday(d);
                    return (
                      <div
                        key={ymd}
                        className={cn(
                          "flex min-h-96 min-w-0 flex-1 flex-col overflow-visible rounded-xl border border-border bg-[color-mix(in_srgb,var(--bg-elevated)_35%,var(--bg-card))]",
                          today && "ring-1 ring-[var(--accent-gold)]/50",
                        )}
                      >
                        <div
                          className={cn(
                            "border-b border-border px-2 py-2 text-center",
                            today && "bg-[color-mix(in_srgb,var(--accent-gold)_12%,transparent)]",
                          )}
                        >
                          <p className="text-xs font-bold uppercase tracking-wide text-foreground">
                            {format(d, "EEEE d/M", { locale: el })}
                          </p>
                        </div>
                        <ul
                          className={cn(
                            "flex flex-1 flex-col gap-2 overflow-x-visible overflow-y-auto p-2",
                            items.length > 0 ? "max-h-80" : "",
                          )}
                        >
                          {items.length === 0 ? (
                            <li className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border py-6 text-center text-[10px] text-muted-foreground">
                              Χωρίς αιτήματα
                            </li>
                          ) : (
                            items.map((r) => (
                              <CalendarCard
                                key={r.id}
                                request={r}
                                onTickClick={(e) => handleTickClick(e, r.id)}
                              />
                            ))
                          )}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {confirmPopover && typeof document !== "undefined"
        ? createPortal(
            isMobile ? (
              <>
                <div
                  className="fixed inset-0 z-[9998] bg-black/40"
                  aria-hidden
                  onClick={() => setConfirmPopover(null)}
                />
                <div
                  className="fixed bottom-0 left-0 right-0 z-[9999] rounded-t-2xl bg-card p-6 shadow-2xl"
                  role="dialog"
                  aria-label="Επιβεβαίωση ολοκλήρωσης"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted-foreground/30" />
                  <p className="mb-4 text-center text-base font-semibold text-foreground">Να ολοκληρωθεί το αίτημα;</p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setConfirmPopover(null)}
                      className="flex-1 rounded-xl border border-border py-3 text-sm font-medium text-foreground"
                    >
                      Άκυρο
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCompleteFromPopover(confirmPopover.requestId)}
                      className="flex-1 rounded-xl bg-[var(--success)] py-3 text-sm font-semibold text-white"
                    >
                      Ναι, ολοκλήρωση
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div
                ref={confirmPopoverRef}
                style={{
                  position: "fixed",
                  left: confirmPopover.x,
                  top: confirmPopover.y,
                  zIndex: 9999,
                }}
                className="w-52 rounded-xl border border-border bg-card p-4 shadow-2xl"
                role="dialog"
                aria-label="Επιβεβαίωση ολοκλήρωσης"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <p className="mb-3 text-sm font-medium text-foreground">Να ολοκληρωθεί το αίτημα;</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCompleteFromPopover(confirmPopover.requestId)}
                    className="flex-1 rounded-lg bg-[var(--success)] py-1.5 text-sm font-medium text-white transition-colors hover:brightness-110"
                  >
                    Ναι
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmPopover(null)}
                    className="flex-1 rounded-lg border border-border bg-[color-mix(in_srgb,var(--bg-elevated)_55%,var(--bg-card))] py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-[color-mix(in_srgb,var(--bg-elevated)_80%,var(--bg-card))]"
                  >
                    Άκυρο
                  </button>
                </div>
              </div>
            ),
            document.body,
          )
        : null}
    </div>
  );
}

function QueueCard({
  request: r,
  scheduleOpen,
  scheduling,
  aiLoading,
  aiSummary,
  onToggleSchedule,
  onSchedule,
  onReject,
  onAiSummary,
}: {
  request: SchedulerRequest;
  scheduleOpen: boolean;
  scheduling: boolean;
  aiLoading: boolean;
  aiSummary?: string;
  onToggleSchedule: () => void;
  onSchedule: (ymd: string) => void;
  onReject: () => void;
  onAiSummary: () => void;
}) {
  const minDate = format(new Date(), "yyyy-MM-dd");
  const pri = r.priority === "High" || r.priority === "Low" || r.priority === "Urgent" || r.priority === "Medium" ? r.priority : "Medium";
  const scheduleMenu = usePortalDropdown({
    open: scheduleOpen,
    setOpen: (next) => {
      if (next !== scheduleOpen) onToggleSchedule();
    },
  });

  return (
    <li
      className={cn(
        "relative rounded-xl border border-border border-l-4 bg-[color-mix(in_srgb,var(--bg-elevated)_40%,var(--bg-card))] p-4 shadow-sm",
        priorityLeftBorder(r.priority),
      )}
    >
      <Link href={`/requests/${r.id}`} className="block min-w-0">
        <p className="font-mono text-[10px] text-muted-foreground">{r.request_code ?? "—"}</p>
        <p className="mt-1 line-clamp-2 text-sm font-semibold text-foreground">{r.title}</p>
        <p className="mt-1.5 truncate text-xs text-muted-foreground">{contactLabel(r.contacts)}</p>
        <p className="mt-2 text-[10px] font-medium text-muted-foreground">{r.status ?? "Νέο"}</p>
        {r.category ? (
          <span className="mt-1.5 inline-block rounded-full border border-border bg-card px-2 py-0.5 text-[10px] text-muted-foreground">
            {r.category}
          </span>
        ) : null}
        <span className={cn("mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold", priorityPill[pri])}>
          {pri}
        </span>
      </Link>
      <div className="relative mt-3 flex flex-col gap-2">
        <button
          type="button"
          disabled={scheduling}
          ref={scheduleMenu.triggerRef as RefObject<HTMLButtonElement>}
          onClick={onToggleSchedule}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-2 py-2 text-xs font-semibold text-foreground transition hover:border-[var(--accent-gold)]/60 hover:bg-[color-mix(in_srgb,var(--accent-gold)_8%,var(--bg-card))] disabled:opacity-50"
        >
          <CalendarPlus className="h-4 w-4 shrink-0" aria-hidden />
          Προγραμματισμός
        </button>
        <button
          type="button"
          onClick={onReject}
          className="flex w-full touch-manipulation items-center justify-center gap-2 rounded-lg border border-red-500/30 px-3 py-2 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/10"
        >
          <XCircle className="h-4 w-4" />
          Δεν μπορεί να πραγματοποιηθεί
        </button>
        <button
          type="button"
          onClick={onAiSummary}
          disabled={aiLoading}
          className="flex w-full touch-manipulation items-center justify-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--accent-gold)_35%,var(--border))] px-3 py-2 text-xs font-medium text-[var(--accent-gold)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent-gold)_10%,transparent)] disabled:opacity-50"
        >
          {aiLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
          )}
          Σύνοψη AI
        </button>
        {aiSummary ? (
          <div className="mt-0 rounded-lg border border-[color-mix(in_srgb,var(--accent-gold)_22%,var(--border))] bg-[color-mix(in_srgb,var(--accent-gold)_6%,var(--bg-card))] p-3 text-xs leading-relaxed text-foreground">
            <div className="mb-1.5 flex items-center gap-1.5 font-medium text-[var(--accent-gold)]">
              <Sparkles className="h-3 w-3" aria-hidden />
              Σύνοψη Alexandra
            </div>
            {aiSummary}
          </div>
        ) : null}
        <PortalDropdownPanel
          open={scheduleOpen}
          pos={scheduleMenu.pos}
          panelRef={scheduleMenu.panelRef}
          className="rounded-lg border border-border bg-card p-2 shadow-lg"
        >
          <div onClick={(e) => e.stopPropagation()}>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Ημερομηνία
            </label>
            <input
              type="date"
              min={minDate}
              className={
                lux.dateInput +
                " !h-9 w-full !text-xs [color-scheme:dark] [data-theme='light']:[color-scheme:light]"
              }
              disabled={scheduling}
              onChange={(e) => {
                const v = e.target.value;
                if (v) onSchedule(v);
              }}
            />
          </div>
        </PortalDropdownPanel>
      </div>
    </li>
  );
}

function KanbanCard({
  request: r,
  onTickClick,
}: {
  request: SchedulerRequest;
  onTickClick: (e: MouseEvent<HTMLButtonElement>) => void;
}) {
  const isCompleted = r.status === "Ολοκληρώθηκε";
  const isRejected = r.status === "Απορρίφθηκε";
  const showTick = !isCompleted && !isRejected;
  const pri = r.priority === "High" || r.priority === "Low" || r.priority === "Urgent" || r.priority === "Medium" ? r.priority : "Medium";

  return (
    <li className="rounded-lg border border-border bg-card p-2.5 shadow-sm">
      <p className="font-mono text-[10px] text-muted-foreground">{r.request_code ?? "—"}</p>
      <Link href={`/requests/${r.id}`} className="mt-0.5 block line-clamp-2 text-sm font-semibold text-foreground">
        {r.title}
      </Link>
      <p className="mt-1 truncate text-xs text-muted-foreground">{contactLabel(r.contacts)}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold", priorityPill[pri])}>
          {pri}
        </span>
        {r.scheduled_date ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <Calendar className="h-3 w-3 shrink-0" aria-hidden />
            {formatScheduleToastDate(r.scheduled_date)}
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 border-t border-border/60 pt-2">
        {showTick ? (
          <button
            type="button"
            onClick={onTickClick}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-[color-mix(in_srgb,var(--success)_15%,transparent)]"
            aria-label="Ολοκλήρωση"
          >
            <CheckCircle2 className="h-5 w-5 text-[var(--success)]" />
          </button>
        ) : null}
        <Link href={`/requests/${r.id}`} className={lux.btnIcon + " !h-8 !w-8"} aria-label="Επεξεργασία">
          <Pencil className="h-4 w-4" />
        </Link>
      </div>
    </li>
  );
}

function MobileCalendarCard({
  request: r,
  onTickClick,
}: {
  request: SchedulerRequest;
  onTickClick: (e: MouseEvent<HTMLButtonElement>) => void;
}) {
  const router = useRouter();
  const isCompleted = r.status === "Ολοκληρώθηκε";
  const isRejected = r.status === "Απορρίφθηκε";
  const showTick = !isCompleted && !isRejected;

  return (
    <div
      className={cn(
        "cursor-pointer rounded-lg border border-border border-l-4 bg-background p-2 transition-transform active:scale-95",
        priorityLeftBorder(r.priority),
        isCompleted && "opacity-80",
      )}
      onClick={() => router.push(`/requests/${r.id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(`/requests/${r.id}`);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <p
        className={cn(
          "line-clamp-2 text-xs font-semibold leading-tight text-foreground",
          isCompleted && "line-through",
        )}
      >
        {r.title}
      </p>
      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{contactLabel(r.contacts)}</p>
      {showTick ? (
        <button
          type="button"
          onClick={onTickClick}
          className="mt-1.5 flex w-full touch-manipulation items-center justify-center gap-1 rounded-md bg-green-500/10 py-1 text-[10px] font-medium text-green-600 dark:text-green-400"
        >
          <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden />
          Ολοκλήρωση
        </button>
      ) : isCompleted ? (
        <p className="mt-1.5 text-center text-[10px] font-medium text-[var(--success)]">Ολοκληρώθηκε</p>
      ) : null}
    </div>
  );
}

function CalendarCard({
  request: r,
  onTickClick,
}: {
  request: SchedulerRequest;
  onTickClick: (e: MouseEvent<HTMLButtonElement>) => void;
}) {
  const isCompleted = r.status === "Ολοκληρώθηκε";
  const isRejected = r.status === "Απορρίφθηκε";
  const showTick = !isCompleted && !isRejected;

  return (
    <li
      className={cn(
        "relative rounded-lg border border-border p-2 text-left shadow-sm transition",
        isCompleted && "border-[var(--status-req-done-ring)] bg-[var(--status-req-done-bg)]",
        !isCompleted && "bg-card",
      )}
    >
      <div className="flex items-start gap-1">
        <Link href={`/requests/${r.id}`} className="min-w-0 flex-1">
          <p
            className={cn(
              "line-clamp-2 text-xs font-semibold leading-snug text-foreground",
              isCompleted && "line-through opacity-80",
            )}
          >
            {r.title}
          </p>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{contactLabel(r.contacts)}</p>
        </Link>
        {isCompleted ? (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--success)]" aria-hidden />
        ) : showTick ? (
          <button
            type="button"
            onClick={onTickClick}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition hover:bg-[color-mix(in_srgb,var(--success)_15%,transparent)]"
            aria-label="Ολοκλήρωση αιτήματος"
          >
            <CheckCircle2 className="h-5 w-5 text-[var(--success)]" />
          </button>
        ) : null}
      </div>
    </li>
  );
}
