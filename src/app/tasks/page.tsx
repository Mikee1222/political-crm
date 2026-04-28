"use client";

import clsx from "clsx";
import { el } from "date-fns/locale";
import {
  Calendar,
  CheckCircle2,
  Circle,
  FileText,
  LayoutGrid,
  List,
  ListTodo,
  Loader2,
  MapPin,
  Phone,
  Plus,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { lux, priorityPill } from "@/lib/luxury-styles";
import { CenteredModal } from "@/components/ui/centered-modal";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { HqSelect } from "@/components/ui/hq-select";
import { useFormToast } from "@/contexts/form-toast-context";
import { ymdToNextMonth, ymdToPrevMonth } from "@/lib/task-filters";
import type { TaskTabFilter } from "@/lib/task-filters";
import { PageHeader } from "@/components/ui/page-header";

type TaskT = {
  id: string;
  contact_id: string;
  assigned_to_user_id?: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
  priority: string | null;
  category: string | null;
  contacts: { id: string; first_name: string; last_name: string; phone?: string } | null;
  assignee?: { id: string; full_name: string | null } | null;
};

type AssigneeOpt = { id: string; full_name: string | null };

function assigneeInitials(name: string | null | undefined) {
  if (!name?.trim()) return "?";
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length >= 2) return `${(p[0]![0] ?? "?")}${(p[p.length - 1]![0] ?? "?")}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const TABS: { id: TaskTabFilter; label: string }[] = [
  { id: "all", label: "Όλες" },
  { id: "today", label: "Σήμερα" },
  { id: "week", label: "Αυτή την εβδομάδα" },
  { id: "overdue", label: "Ληγμένες" },
];

const CATEGORIES: { value: string; label: string }[] = [
  { value: "call", label: "Κλήση" },
  { value: "field", label: "Πεδίο" },
  { value: "meeting", label: "Συνάντηση" },
  { value: "doc", label: "Έγγραφα" },
  { value: "other", label: "Άλλο" },
];

function catIcon(v: string | null | undefined) {
  const k = v || "other";
  const c = { call: Phone, field: MapPin, meeting: UserRound, doc: FileText, other: ListTodo }[k] ?? ListTodo;
  return c;
}

function prLabel(p: string | null | undefined) {
  if (p === "High") return "Υψηλή";
  if (p === "Low") return "Χαμηλή";
  return "Μεσαία";
}

function athensTodayYmd() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Athens" });
}

export default function TasksPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [view, setView] = useState<"list" | "kanban">("list");
  const [tab, setTab] = useState<TaskTabFilter>("all");
  const [pending, setPending] = useState<TaskT[]>([]);
  const [completed, setCompleted] = useState<TaskT[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [heat, setHeat] = useState<{ year: number; m: number }>(() => {
    const d = new Date();
    return { year: d.getFullYear(), m: d.getMonth() + 1 };
  });
  const [heatCounts, setHeatCounts] = useState<Record<string, number>>({});
  const [heatMax, setHeatMax] = useState(0);
  const [assignees, setAssignees] = useState<AssigneeOpt[]>([]);

  useEffect(() => {
    void fetchWithTimeout("/api/team/assignees")
      .then((r) => r.json())
      .then((d: { assignees?: AssigneeOpt[] }) => setAssignees(d.assignees ?? []))
      .catch(() => setAssignees([]));
  }, []);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const q = new URLSearchParams({ filter: tab, date: athensTodayYmd() });
      const res = await fetchWithTimeout(`/api/tasks?${q.toString()}`);
      const d = (await res.json().catch(() => ({}))) as { error?: string; pending?: TaskT[]; completed?: TaskT[]; anchor?: string };
      if (!res.ok) {
        setErr(d.error ?? "Σφάλμα");
        return;
      }
      setPending(d.pending ?? []);
      setCompleted(d.completed ?? []);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    setModal(true);
    const p = new URLSearchParams(searchParams.toString());
    p.delete("new");
    const q = p.toString();
    startTransition(() => router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false }));
  }, [searchParams, router, pathname]);

  const loadHeat = useCallback(async () => {
    const { year, m } = heat;
    const res = await fetchWithTimeout(`/api/tasks/heatmap?year=${year}&month=${m}`);
    const d = (await res.json().catch(() => ({}))) as { counts?: Record<string, number>; max?: number };
    if (res.ok && d.counts) {
      setHeatCounts(d.counts);
      setHeatMax(typeof d.max === "number" ? d.max : 0);
    } else {
      setHeatCounts({});
      setHeatMax(0);
    }
  }, [heat]);

  useEffect(() => {
    void loadHeat();
  }, [loadHeat]);

  const anchorYmd = athensTodayYmd();
  const colNew = useMemo(
    () =>
      pending.filter((t) => {
        const d = t.due_date?.slice(0, 10);
        return !d || d > anchorYmd;
      }),
    [pending, anchorYmd],
  );
  const colProg = useMemo(
    () =>
      pending.filter((t) => {
        const d = t.due_date?.slice(0, 10);
        return Boolean(d && d <= anchorYmd);
      }),
    [pending, anchorYmd],
  );

  return (
    <div className="space-y-6 max-md:space-y-4">
      <PageHeader
        title="Εργασίες"
        subtitle="Κέντρο ενεργειών, λήξεις και follow-up — εναλλαγή μεταξύ λίστας και πίνακα Kanban."
        actions={
          <div className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] p-0.5">
            <button
              type="button"
              onClick={() => setView("list")}
              className={[
                "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-bold transition",
                view === "list"
                  ? "bg-[#003476] text-white shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
              ].join(" ")}
            >
              <List className="h-4 w-4" />
              Λίστα
            </button>
            <button
              type="button"
              onClick={() => setView("kanban")}
              className={[
                "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-bold transition",
                view === "kanban"
                  ? "bg-[#003476] text-white shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
              ].join(" ")}
            >
              <LayoutGrid className="h-4 w-4" />
              Kanban
            </button>
          </div>
        }
      />
      <CalendarStrip
        year={heat.year}
        month1={heat.m}
        max={Math.max(heatMax, 1)}
        counts={heatCounts}
        onPrev={() => {
          const p = ymdToPrevMonth(heat.year, heat.m);
          setHeat({ year: p.y, m: p.m });
        }}
        onNext={() => {
          const p = ymdToNextMonth(heat.year, heat.m);
          setHeat({ year: p.y, m: p.m });
        }}
      />
      <section
        className="data-hq-card relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-[0_4px_24px_rgba(0,0,0,0.12)] sm:p-5 [data-theme='light']:shadow-[0_2px_16px_rgba(0,0,0,0.08)]"
      >
        <div
          className="pointer-events-none absolute right-0 top-0 h-32 w-40 bg-[var(--accent-gold)]/[0.07] blur-3xl [data-theme='light']:bg-[#C9A84C]/10"
          aria-hidden
        />
        <div className="relative z-[1] flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="hq-section-label !m-0 !mb-0 !mt-0 border-0 !p-0">Ημερολόγιο φόρτου</h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">Ζέσταμα εργασιών ανα μήνα — κλικ σε ημέρα.</p>
          </div>
          <div className="mx-auto w-full min-w-0 sm:mx-0 sm:max-w-none sm:self-end sm:justify-end md:flex-1">
            <button
              type="button"
              className="no-mobile-scale h-12 w-full max-w-md rounded-full border-2 border-[#8B6914] bg-gradient-to-b from-[#E8C96B] to-[#8B6914] px-6 text-sm font-bold text-[#0A1628] shadow-[0_0_0_1px_rgba(0,0,0,0.15)] transition duration-200 hover:brightness-110 md:ml-auto md:mr-0"
              onClick={() => {
                setErr(null);
                setModal(true);
              }}
            >
              <span className="inline-flex items-center justify-center gap-2">
                <Plus className="h-4 w-4" />
                <span>Νέα Εργασία</span>
              </span>
            </button>
          </div>
        </div>
        <div
          className="relative z-[1] -mx-1 flex gap-0.5 overflow-x-auto scroll-smooth pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              id={`tt-${t.id}`}
              onClick={() => setTab(t.id)}
              className={clsx(
                "min-h-11 min-w-0 flex-1 rounded-xl px-3 py-2 text-center text-xs font-bold transition duration-200 sm:min-w-[7rem] sm:px-4 sm:text-sm",
                tab === t.id
                  ? "border border-[#C9A84C]/45 bg-[#C9A84C]/15 text-[var(--text-primary)] shadow-[inset_0_0_0_1px_rgba(201,168,76,0.2)] [data-theme='light']:text-[#1a1a0a]"
                  : "border border-transparent text-[var(--text-muted)] active:bg-[var(--bg-elevated)]/80",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>
      {err && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200" role="alert">
          {err}
        </p>
      )}

      <div className="md:hidden">
        {loading ? <Loader2 className="h-5 w-5 animate-spin text-[#C9A84C]" /> : null}
      </div>

      {view === "list" ? (
        <div className="max-md:space-y-6 grid gap-4 md:grid-cols-2 md:items-start md:gap-6 max-md:grid-cols-1 max-md:grid-cols-1">
          <div className="min-w-0 max-md:order-1 max-md:space-y-3 order-1">
            <h2 className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#C9A84C] sm:text-xs">Σε αναμονή</h2>
            {pending.length === 0 && !loading && (
              <p className="text-sm text-[var(--text-muted)]">Καμία ενεργή εργασία για το φίλτρο.</p>
            )}
            {pending.map((t) => (
              <TaskCard
                key={t.id}
                t={t}
                assignees={assignees}
                anchor={anchorYmd}
                isCompleted={false}
                expanded={expanded === t.id}
                onToggleExpand={() => setExpanded((e) => (e === t.id ? null : t.id))}
                onDone={() => void markDone(t.id, setErr, () => {
                  void load();
                  void loadHeat();
                })}
                onDelete={() => void removeTask(t.id, setErr, () => {
                  void load();
                  void loadHeat();
                })}
                onSaved={async () => {
                  setExpanded(null);
                  await load();
                  await loadHeat();
                }}
              />
            ))}
          </div>
          <div className="min-w-0 max-md:order-2 max-md:space-y-3 order-2">
            <h2 className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#94A3B8] sm:text-xs">Ολοκληρωμένες</h2>
            {completed.length === 0 && !loading && (
              <p className="text-sm text-[var(--text-muted)]">Καμία ολοκληρωμένη για το φίλτρο.</p>
            )}
            {completed.map((t) => (
              <TaskCard
                key={t.id}
                t={t}
                assignees={assignees}
                anchor={anchorYmd}
                isCompleted
                expanded={expanded === t.id}
                onToggleExpand={() => setExpanded((e) => (e === t.id ? null : t.id))}
                onDone={() => void markUndone(t.id, setErr, () => {
                  void load();
                  void loadHeat();
                })}
                onDelete={() => void removeTask(t.id, setErr, () => {
                  void load();
                  void loadHeat();
                })}
                onSaved={async () => {
                  setExpanded(null);
                  await load();
                  await loadHeat();
                }}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="grid min-h-[240px] grid-cols-1 gap-3 md:grid-cols-3">
          <div className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)]/40 p-3">
            <h3 className="mb-2 text-center text-xs font-bold uppercase tracking-wider text-[#C9A84C]">Νέο</h3>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
              {colNew.map((t) => (
                <TaskCard
                  key={t.id}
                  t={t}
                  assignees={assignees}
                  anchor={anchorYmd}
                  isCompleted={false}
                  expanded={expanded === t.id}
                  onToggleExpand={() => setExpanded((e) => (e === t.id ? null : t.id))}
                  onDone={() => void markDone(t.id, setErr, () => {
                    void load();
                    void loadHeat();
                  })}
                  onDelete={() => void removeTask(t.id, setErr, () => {
                    void load();
                    void loadHeat();
                  })}
                  onSaved={async () => {
                    setExpanded(null);
                    await load();
                    await loadHeat();
                  }}
                />
              ))}
            </div>
          </div>
          <div className="flex flex-col rounded-2xl border border-amber-500/25 bg-amber-500/5 p-3">
            <h3 className="mb-2 text-center text-xs font-bold uppercase tracking-wider text-amber-200">Σε εξέλιξη</h3>
            <p className="mb-2 text-center text-[10px] text-[var(--text-muted)]">Λήγει σήμερα / ληξιπρόθεσμα</p>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
              {colProg.map((t) => (
                <TaskCard
                  key={t.id}
                  t={t}
                  assignees={assignees}
                  anchor={anchorYmd}
                  isCompleted={false}
                  expanded={expanded === t.id}
                  onToggleExpand={() => setExpanded((e) => (e === t.id ? null : t.id))}
                  onDone={() => void markDone(t.id, setErr, () => {
                    void load();
                    void loadHeat();
                  })}
                  onDelete={() => void removeTask(t.id, setErr, () => {
                    void load();
                    void loadHeat();
                  })}
                  onSaved={async () => {
                    setExpanded(null);
                    await load();
                    await loadHeat();
                  }}
                />
              ))}
            </div>
          </div>
          <div className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)]/40 p-3">
            <h3 className="mb-2 text-center text-xs font-bold uppercase tracking-wider text-emerald-300">Ολοκληρώθηκε</h3>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
              {completed.map((t) => (
                <TaskCard
                  key={t.id}
                  t={t}
                  assignees={assignees}
                  anchor={anchorYmd}
                  isCompleted
                  expanded={expanded === t.id}
                  onToggleExpand={() => setExpanded((e) => (e === t.id ? null : t.id))}
                  onDone={() => void markUndone(t.id, setErr, () => {
                    void load();
                    void loadHeat();
                  })}
                  onDelete={() => void removeTask(t.id, setErr, () => {
                    void load();
                    void loadHeat();
                  })}
                  onSaved={async () => {
                    setExpanded(null);
                    await load();
                    await loadHeat();
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {modal && (
        <NewTaskModal
          assignees={assignees}
          onClose={() => setModal(false)}
          onCreated={async () => {
            await load();
            await loadHeat();
          }}
        />
      )}
    </div>
  );
}

async function markDone(id: string, setE: (s: string | null) => void, onOk: () => void) {
  setE(null);
  const r = await fetchWithTimeout(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ completed: true }) });
  const d = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) setE(d.error ?? "Σφάλμα");
  else onOk();
}
async function markUndone(id: string, setE: (s: string | null) => void, onOk: () => void) {
  setE(null);
  const r = await fetchWithTimeout(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ completed: false }) });
  const d = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) setE(d.error ?? "Σφάλμα");
  else onOk();
}
async function removeTask(id: string, setE: (s: string | null) => void, onOk: () => void) {
  setE(null);
  if (!confirm("Διαγραφή εργασίας;")) return;
  const r = await fetchWithTimeout(`/api/tasks/${id}`, { method: "DELETE" });
  if (!r.ok) {
    const d = (await r.json().catch(() => ({}))) as { error?: string };
    setE(d.error ?? "Σφάλμα");
  } else onOk();
}

function TaskCard({
  t: task,
  assignees,
  anchor,
  isCompleted,
  expanded,
  onToggleExpand,
  onDone,
  onDelete,
  onSaved,
}: {
  t: TaskT;
  assignees: AssigneeOpt[];
  anchor: string;
  isCompleted: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onDone: () => void;
  onDelete: () => void;
  onSaved: () => Promise<void>;
}) {
  const C = catIcon(task.category);
  const due = task.due_date?.slice(0, 10) ?? null;
  const overdue = !isCompleted && due && due < anchor;
  const dueToday = !isCompleted && due === anchor;
  const skip = useRef(false);
  const touch0 = useRef<{ x: number; moved: boolean } | null>(null);

  const [edit, setEdit] = useState({
    title: task.title,
    description: task.description ?? "",
    due_date: task.due_date ?? "",
    priority: (task.priority ?? "Medium") as "High" | "Medium" | "Low",
    contact_id: task.contact_id,
    category: task.category || "other",
    assigned_to_user_id: task.assigned_to_user_id ?? "",
  });
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Partial<TaskT["contacts"] & { id: string; phone: string }>[]>([]);
  const [saving, setSaving] = useState(false);
  const [dErr, setDErr] = useState<string | null>(null);

  useEffect(() => {
    if (!expanded) return;
    setEdit({
      title: task.title,
      description: task.description ?? "",
      due_date: task.due_date ?? "",
      priority: (task.priority as "High" | "Medium" | "Low") ?? "Medium",
      contact_id: task.contact_id,
      category: task.category || "other",
      assigned_to_user_id: task.assigned_to_user_id ?? "",
    });
  }, [expanded, task]);

  useEffect(() => {
    if (!q.trim() || q.length < 1) {
      setHits([]);
      return;
    }
    const tm = setTimeout(() => {
      void fetchWithTimeout(`/api/contacts?search=${encodeURIComponent(q)}&limit=200`)
        .then((r) => r.json())
        .then((d: { contacts?: { id: string; first_name: string; last_name: string; phone: string }[] }) =>
          setHits((d.contacts ?? []).slice(0, 12)),
        );
    }, 200);
    return () => clearTimeout(tm);
  }, [q]);

  return (
    <div
      className={clsx(
        "relative flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-sm [data-theme='light']:shadow-[0_1px_8px_rgba(0,0,0,0.06)]",
        isCompleted && "bg-[var(--bg-elevated)]/80",
        !isCompleted && overdue && "border-l-4 !border-l-red-500/85 animate-pulse",
        !isCompleted && dueToday && !overdue && "border-l-4 !border-l-[#C9A84C]",
      )}
    >
      <div
        className="flex w-full min-w-0 items-start gap-2 p-3"
        onTouchStart={(e) => {
          touch0.current = { x: e.touches[0].clientX, moved: false };
        }}
        onTouchMove={(e) => {
          const t = touch0.current;
          if (t && Math.abs(e.touches[0].clientX - t.x) > 10) t.moved = true;
        }}
        onTouchEnd={(e) => {
          if (typeof window === "undefined" || !window.matchMedia("(max-width: 767px)").matches) return;
          const t0 = touch0.current;
          touch0.current = null;
          if (!t0) return;
          const d = e.changedTouches[0].clientX - t0.x;
          if (t0.moved && d < -50) {
            onDone();
            skip.current = true;
            return;
          }
          if (t0.moved && d > 50) {
            onDelete();
            skip.current = true;
          }
        }}
      >
        <div className="pt-0.5">
          {isCompleted ? (
            <button
              type="button"
              className="text-emerald-400/90"
              onClick={() => onDone()}
              title="Ξανα-αναίρεση (επιστροφή σε αναμονή)"
            >
              <CheckCircle2 className="h-6 w-6" />
            </button>
          ) : (
            <button
              type="button"
              className="text-[var(--text-muted)] hover:text-[#C9A84C]"
              onClick={(e) => {
                e.stopPropagation();
                onDone();
              }}
              title="Ολοκλήρωση"
            >
              <Circle className="h-6 w-6" />
            </button>
          )}
        </div>
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => {
            if (skip.current) {
              skip.current = false;
              return;
            }
            onToggleExpand();
          }}
        >
          <div className="flex min-w-0 items-start justify-between gap-1">
            <p
              className={[
                "line-clamp-2 font-bold break-words text-[var(--text-primary)]",
                isCompleted && "text-[var(--text-muted)] line-through decoration-emerald-500/60",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {task.title}
            </p>
            <div className="shrink-0 self-start rounded-md border border-[#C9A84C]/30 bg-[var(--bg-elevated)]/90 p-1.5 text-[#C9A84C]">
              <C className="h-3.5 w-3.5" />
            </div>
          </div>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)] max-md:max-w-full">
            {task.due_date
              ? format(parseISO(task.due_date.slice(0, 10) + "T12:00:00"), "d MMM yyyy", { locale: el })
              : "Χωρίς ορισμό"}{" "}
            {overdue && <span className="ml-0.5 font-bold text-red-300">· ΛΗΞΗ</span>}
          </p>
          {task.contacts && (
            <p className="mt-0.5">
              <Link
                className="text-sm font-medium text-sky-300/90 hover:underline"
                href={`/contacts/${task.contact_id}`}
                onClick={(e) => e.stopPropagation()}
              >
                {task.contacts.first_name} {task.contacts.last_name}
              </Link>
            </p>
          )}
          {task.assignee?.full_name ? (
            <p className="mt-1 flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#003476]/35 text-[9px] font-bold text-[#C9A84C]"
                title={task.assignee.full_name}
              >
                {assigneeInitials(task.assignee.full_name)}
              </span>
              <span className="truncate">{task.assignee.full_name}</span>
            </p>
          ) : null}
        </button>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {(() => {
            const pk =
              task.priority === "High" || task.priority === "Low" || task.priority === "Medium"
                ? task.priority
                : "Medium";
            return (
              <span
                className={clsx(
                  "inline-flex min-h-6 min-w-0 max-w-full items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
                  priorityPill[pk],
                )}
              >
                {prLabel(task.priority)}
              </span>
            );
          })()}
        </div>
      </div>

      {expanded && (
        <div
          className="border-t border-[var(--border)]/80 p-3 sm:px-4"
          onClick={(e) => e.stopPropagation()}
        >
          {dErr && <p className="mb-2 text-sm text-red-200">{dErr}</p>}
          <label className="block text-[10px] font-medium uppercase text-[var(--text-muted)]">Περιγραφή</label>
          <textarea
            className={clsx(lux.textarea, "mt-1 w-full !text-base")}
            rows={3}
            value={edit.description}
            onChange={(e) => setEdit((x) => ({ ...x, description: e.target.value }))}
            placeholder="Σημειώσεις…"
          />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className={clsx(lux.label)}>Λήξη</label>
              <input
                className={clsx(lux.input, lux.dateInput, "!min-h-11 w-full !text-base")}
                type="date"
                value={edit.due_date ? edit.due_date.slice(0, 10) : ""}
                onChange={(e) => setEdit((x) => ({ ...x, due_date: e.target.value }))}
              />
            </div>
            <div>
              <label className={clsx(lux.label)}>Προτεραιότητα</label>
              <HqSelect
                className="!min-h-11 w-full !text-base"
                value={edit.priority}
                onChange={(e) => setEdit((x) => ({ ...x, priority: e.target.value as typeof edit.priority }))}
              >
                <option value="High">Υψηλή</option>
                <option value="Medium">Μεσαία</option>
                <option value="Low">Χαμηλή</option>
              </HqSelect>
            </div>
            <div>
              <label className={clsx(lux.label)}>Κατηγορία</label>
              <HqSelect className="!min-h-11 w-full !text-base" value={edit.category} onChange={(e) => setEdit((x) => ({ ...x, category: e.target.value }))}>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </HqSelect>
            </div>
            <div>
              <label className={clsx(lux.label)}>Ώρα επαφής (αναζήτηση)</label>
              <div className="relative">
                <input
                  className={clsx(lux.input, "w-full !pl-8 !text-base !min-h-11")}
                  placeholder="Όνομα, τηλ…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                {hits.length > 0 && (
                  <ul
                    className="absolute z-20 mt-1 max-h-44 w-full overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-sm shadow-2xl"
                    role="listbox"
                  >
                    {hits.map((h) => h && h.id && (
                      <li key={h.id}>
                        <button
                          type="button"
                          className="block w-full px-3 py-2 text-left text-xs hover:bg-[var(--bg-elevated)]"
                          onClick={() => {
                            setEdit((e) => ({ ...e, contact_id: h.id! }));
                            setQ("");
                            setHits([]);
                          }}
                        >
                          {h.first_name} {h.last_name} · {h.phone ?? "—"}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <p className="mt-1 text-[10px] text-[var(--text-muted)]">Ενεργό ID: {edit.contact_id.slice(0, 8)}…</p>
            </div>
            <div className="sm:col-span-2">
              <label className={clsx(lux.label)}>Ανάθεση σε υπάλληλο</label>
              <HqSelect
                className="!min-h-11 w-full !text-base"
                value={edit.assigned_to_user_id}
                onChange={(e) => setEdit((x) => ({ ...x, assigned_to_user_id: e.target.value }))}
              >
                <option value="">— Κανένας —</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.full_name?.trim() || `Χρήστης ${a.id.slice(0, 8)}…`}
                  </option>
                ))}
              </HqSelect>
            </div>
            <div className="sm:col-span-2">
              <label className={clsx(lux.label)}>Τίτλος</label>
              <input
                className={clsx(lux.input, "w-full !min-h-11 !text-base")}
                value={edit.title}
                onChange={(e) => setEdit((x) => ({ ...x, title: e.target.value }))}
              />
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className={clsx(lux.btnDanger, "inline-flex w-full !min-h-11 !justify-center !gap-2 sm:w-auto")}
              onClick={() => {
                onDelete();
              }}
            >
              <Trash2 className="h-4 w-4" />
              Διαγραφή
            </button>
            <button
              type="button"
              className={clsx(lux.btnPrimary, "w-full !min-h-11 sm:w-auto sm:!min-w-40")}
              disabled={saving}
              onClick={async () => {
                setDErr(null);
                setSaving(true);
                try {
                  const r = await fetchWithTimeout(`/api/tasks/${task.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      title: edit.title,
                      description: edit.description || null,
                      due_date: edit.due_date ? edit.due_date.slice(0, 10) : null,
                      priority: edit.priority,
                      category: edit.category,
                      contact_id: edit.contact_id,
                      assigned_to_user_id: edit.assigned_to_user_id || null,
                    }),
                  });
                  const d = (await r.json().catch(() => ({}))) as { error?: string };
                  if (!r.ok) {
                    setDErr(d.error ?? "Σφάλμα");
                    return;
                  }
                  await onSaved();
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? "…" : "Αποθήκευση"}
            </button>
          </div>
        </div>
      )}

      <p className="px-2 pb-1.5 text-center text-[8px] text-[var(--text-muted)] sm:hidden" aria-hidden>
        Σάρωση: αριστερά ολοκλ. · δεξιά διαγραφή
      </p>
    </div>
  );
}

function NewTaskModal({
  assignees,
  onClose,
  onCreated,
}: {
  assignees: AssigneeOpt[];
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [e, setE] = useState<string | null>(null);
  const [titleErr, setTitleErr] = useState<string | null>(null);
  const [contactErr, setContactErr] = useState<string | null>(null);
  const { showToast } = useFormToast();
  const [f, setF] = useState({
    title: "",
    description: "",
    due_date: "",
    priority: "Medium" as "High" | "Medium" | "Low",
    category: "other",
    contact_id: "" as string,
    assigned_to_user_id: "" as string,
  });
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: string; first_name: string; last_name: string; phone: string }[]>([]);
  const [cLabel, setCLabel] = useState("");

  useEffect(() => {
    if (q.length < 1) {
      setHits([]);
      return;
    }
    const tm = setTimeout(() => {
      void fetchWithTimeout(`/api/contacts?search=${encodeURIComponent(q)}&limit=200`)
        .then((r) => r.json())
        .then((d: { contacts?: typeof hits }) => setHits((d.contacts ?? []).slice(0, 12)));
    }, 200);
    return () => clearTimeout(tm);
  }, [q]);

  const save = async (ev: FormEvent) => {
    ev.preventDefault();
    setE(null);
    setTitleErr(null);
    setContactErr(null);
    let invalid = false;
    if (!f.title.trim()) {
      setTitleErr("Υποχρεωτικός τίτλος");
      invalid = true;
    }
    if (!f.contact_id) {
      setContactErr("Επιλέξτε επαφή από τη λίστα.");
      invalid = true;
    }
    if (invalid) {
      setE("Υποχρεωτική επαφή και τίτλος");
      showToast("Συμπληρώστε τίτλο και επαφή.", "error");
      return;
    }
    setSaving(true);
    try {
      const r = await fetchWithTimeout("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: f.contact_id,
          title: f.title.trim(),
          description: f.description || null,
          due_date: f.due_date || null,
          priority: f.priority,
          category: f.category || null,
          assigned_to_user_id: f.assigned_to_user_id || null,
        }),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        const msg = d.error ?? "Σφάλμα";
        setE(msg);
        showToast(msg, "error");
        return;
      }
      showToast("Η εργασία δημιουργήθηκε επιτυχώς.", "success");
      await Promise.resolve(onCreated());
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Σφάλμα δικτύου";
      setE(msg);
      showToast(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <CenteredModal
      open
      onClose={onClose}
      title="Νέα Εργασία"
      sheetOnMobile
      className="w-full max-w-[640px]"
      ariaLabel="Νέα εργασία"
      footer={
        <>
          <button type="button" className={clsx(lux.btnSecondary, "!w-full !min-h-12")} onClick={onClose} disabled={saving}>
            Άκυρο
          </button>
          <FormSubmitButton type="submit" form="task-create-form" loading={saving} variant="gold" className="w-full !min-h-12 !justify-center !py-2">
            Αποθήκευση
          </FormSubmitButton>
        </>
      }
    >
      <form id="task-create-form" onSubmit={save} className="space-y-4">
          {e && <p className="text-sm text-red-200">{e}</p>}
          <div>
            <label className={lux.label}>
              Τίτλος<span className="ml-0.5 text-red-500" aria-hidden>*</span>
            </label>
            <input
              className={clsx(lux.input, "w-full !min-h-11 !text-base", titleErr && lux.inputError)}
              required
              value={f.title}
              placeholder="Σύντομος τίτλος εργασίας…"
              aria-invalid={titleErr ? true : undefined}
              onChange={(ev) => {
                setF((x) => ({ ...x, title: ev.target.value }));
                if (titleErr) setTitleErr(null);
              }}
              onBlur={() => {
                if (!f.title.trim()) setTitleErr("Υποχρεωτικός τίτλος");
              }}
            />
            {titleErr && (
              <p className={lux.fieldError} role="alert">
                {titleErr}
              </p>
            )}
          </div>
          <div>
            <label className={lux.label}>Περιγραφή</label>
            <textarea
              className={clsx(lux.textarea, "!min-h-24 w-full !text-base")}
              value={f.description}
              onChange={(ev) => setF((x) => ({ ...x, description: ev.target.value }))}
              placeholder="Σημειώσεις (προαιρετικό)…"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={lux.label}>Ημερομηνία λήξης</label>
              <input
                className={clsx(lux.input, lux.dateInput, "w-full !min-h-11 !text-base")}
                type="date"
                value={f.due_date}
                onChange={(ev) => setF((x) => ({ ...x, due_date: ev.target.value }))}
              />
            </div>
            <div>
              <label className={lux.label}>Προτεραιότητα</label>
              <HqSelect className="w-full !min-h-11 !text-base" value={f.priority} onChange={(ev) => setF((x) => ({ ...x, priority: ev.target.value as "High" | "Medium" | "Low" }))}>
                <option value="High">Υψηλή</option>
                <option value="Medium">Μεσαία</option>
                <option value="Low">Χαμηλή</option>
              </HqSelect>
            </div>
            <div>
              <label className={lux.label}>Κατηγορία</label>
              <HqSelect className="w-full !min-h-11 !text-base" value={f.category} onChange={(ev) => setF((x) => ({ ...x, category: ev.target.value }))}>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </HqSelect>
            </div>
            <div className="sm:col-span-2">
              <label className={lux.label}>Ανάθεση σε υπάλληλο</label>
              <HqSelect
                className="w-full !min-h-11 !text-base"
                value={f.assigned_to_user_id}
                onChange={(ev) => setF((x) => ({ ...x, assigned_to_user_id: ev.target.value }))}
              >
                <option value="">— Κανένας —</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.full_name?.trim() || `Χρήστης ${a.id.slice(0, 8)}…`}
                  </option>
                ))}
              </HqSelect>
            </div>
            <div className="sm:col-span-2">
              <label className={lux.label}>
                Σύνδεση με επαφή<span className="ml-0.5 text-red-500" aria-hidden>*</span> (αναζητήστε)
              </label>
              <div className="relative">
                <input
                  className={clsx(lux.input, "w-full !min-h-11 !pl-9 !text-base", contactErr && lux.inputError)}
                  value={cLabel}
                  aria-invalid={contactErr ? true : undefined}
                  onChange={(ev) => {
                    setCLabel(ev.target.value);
                    setQ(ev.target.value);
                    if (f.contact_id) {
                      setF((x) => ({ ...x, contact_id: "" }));
                    }
                    if (contactErr) setContactErr(null);
                  }}
                  onBlur={() => {
                    if (!f.contact_id) setContactErr("Επιλέξτε επαφή από τη λίστα.");
                  }}
                  placeholder="Όνομα, τηλέφωνο…"
                />
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                {hits.length > 0 && (
                  <ul className="absolute z-[10020] mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-0 shadow-2xl">
                    {hits.map((h) => (
                      <li key={h.id}>
                        <button
                          type="button"
                          className="w-full px-3 py-2.5 text-left text-sm hover:bg-[var(--bg-card)]"
                          onClick={() => {
                            setF((x) => ({ ...x, contact_id: h.id }));
                            setCLabel([h.first_name, h.last_name, h.phone].filter(Boolean).join(" · "));
                            setHits([]);
                            setQ("");
                            setContactErr(null);
                          }}
                        >
                          {h.first_name} {h.last_name} · {h.phone}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {contactErr && (
                <p className={lux.fieldError} role="alert">
                  {contactErr}
                </p>
              )}
            </div>
          </div>
      </form>
    </CenteredModal>
  );
}

function CalendarStrip({
  year,
  month1,
  counts,
  max: maxV,
  onPrev,
  onNext,
}: {
  year: number;
  month1: number;
  max: number;
  counts: Record<string, number>;
  onPrev: () => void;
  onNext: () => void;
}) {
  const d0 = new Date(year, month1 - 1, 1);
  const name = d0.toLocaleDateString("el-GR", { month: "long", year: "numeric" });
  const daysInMonth = new Date(year, month1, 0).getDate();
  const firstDow = d0.getDay();
  const startPad = firstDow === 0 ? 6 : firstDow - 1;
  const nCells = 42;
  const cells = useMemo(() => {
    const out: { d: string | null; inMonth: boolean; n: number }[] = [];
    let day = 1;
    for (let i = 0; i < nCells; i += 1) {
      if (i < startPad) {
        out.push({ d: null, inMonth: false, n: 0 });
        continue;
      }
      if (day > daysInMonth) {
        out.push({ d: null, inMonth: false, n: 0 });
        continue;
      }
      const m = String(month1).padStart(2, "0");
      const d = String(day).padStart(2, "0");
      const ymd = `${year}-${m}-${d}`;
      const c = counts[ymd] ?? 0;
      out.push({ d: ymd, inMonth: true, n: c });
      day += 1;
    }
    return out;
  }, [year, month1, daysInMonth, startPad, counts]);

  const wk = ["Δε", "Τρ", "Τε", "Πε", "Πα", "Σα", "Κυ"];
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-3 shadow-[0_4px_20px_rgba(0,0,0,0.1)] [data-theme='light']:shadow-[0_2px_12px_rgba(0,0,0,0.07)] sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button type="button" className="rounded-lg border border-[var(--border)] p-1.5 text-sm text-[#C9A84C] hover:bg-white/5" onClick={onPrev} aria-label="Προηγούμενο μήνα">
          <span className="px-0.5">‹</span>
        </button>
        <div className="flex min-w-0 items-center justify-center gap-1.5 text-sm font-bold text-[var(--text-primary)] sm:text-base">
          <Calendar className="h-3.5 w-3.5 text-[#C9A84C] sm:h-4 sm:w-4" />
          <span className="truncate text-center">Ημερολόγιο · {name}</span>
        </div>
        <button type="button" className="rounded-lg border border-[var(--border)] p-1.5 text-sm text-[#C9A84C] hover:bg-white/5" onClick={onNext} aria-label="Επόμενο μήνα">
          <span className="px-0.5">›</span>
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[9px] text-[var(--text-muted)] sm:gap-1 sm:text-[10px] sm:font-bold">
        {wk.map((w) => (
          <div key={w} className="px-0 py-1">
            {w}
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-0.5 sm:gap-1.5">
        {cells.map((c, i) => {
          if (c.d == null || !c.inMonth) {
            return <div key={`e-${i}`} className="aspect-square min-w-0" />;
          }
          const p = maxV > 0 ? 0.35 + (0.6 * c.n) / maxV : 0;
          const has = c.n > 0;
          return (
            <div
              key={c.d}
              className={clsx(
                "flex min-w-0 aspect-square items-center justify-center rounded border text-xs font-bold tabular-nums sm:text-sm",
                has
                  ? "border-[#C9A84C]/50 text-[var(--text-primary)] [data-theme='light']:text-[#1a1405]"
                  : "border-[var(--border)]/60 text-[var(--text-muted)]",
              )}
              style={has ? { backgroundColor: `rgba(201,168,76,${p.toFixed(2)})` } : undefined}
              title={c.n ? `${c.d}: ${c.n} εργασίες` : c.d}
            >
              {c.d ? parseInt(c.d.slice(8, 10), 10) : ""}
            </div>
          );
        })}
      </div>
    </div>
  );
}
