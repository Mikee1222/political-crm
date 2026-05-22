"use client";

import {
  addWeeks,
  format,
  isToday,
  parseISO,
  startOfWeek,
} from "date-fns";
import { el } from "date-fns/locale";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { lux } from "@/lib/luxury-styles";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { useFormToast } from "@/contexts/form-toast-context";
import { useProfile } from "@/contexts/profile-context";
import { hasMinRole } from "@/lib/roles";

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

export default function RequestsSchedulerPage() {
  const { profile } = useProfile();
  const { showToast } = useFormToast();
  const canManage = hasMinRole(profile?.role, "manager");

  const [weekStart, setWeekStart] = useState(() =>
    format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"),
  );
  const [queue, setQueue] = useState<SchedulerRequest[]>([]);
  const [scheduled, setScheduled] = useState<SchedulerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("queue");
  const [scheduleOpenId, setScheduleOpenId] = useState<string | null>(null);
  const [schedulingId, setSchedulingId] = useState<string | null>(null);

  const days = useMemo(() => weekDays(weekStart), [weekStart]);

  const scheduledByDay = useMemo(() => {
    const m = new Map<string, SchedulerRequest[]>();
    for (const d of days) m.set(d, []);
    for (const r of scheduled) {
      const key = r.scheduled_date ?? "";
      if (m.has(key)) m.get(key)!.push(r);
    }
    return m;
  }, [scheduled, days]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithTimeout(`/api/requests/scheduler?week=${encodeURIComponent(weekStart)}`);
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
      if (j.weekStart) setWeekStart(j.weekStart);
    } catch {
      setError("Σφάλμα δικτύου");
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    if (!canManage) return;
    void load();
  }, [load, canManage]);

  const shiftWeek = (delta: number) => {
    const d = parseISO(weekStart);
    setWeekStart(format(startOfWeek(addWeeks(d, delta), { weekStartsOn: 1 }), "yyyy-MM-dd"));
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

  const completeRequest = async (id: string) => {
    const prev = scheduled;
    setScheduled((s) =>
      s.map((r) => (r.id === id ? { ...r, status: "Ολοκληρώθηκε" } : r)),
    );
    try {
      const res = await fetchWithTimeout(`/api/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Ολοκληρώθηκε" }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setScheduled(prev);
        throw new Error(j.error ?? "Σφάλμα");
      }
      showToast("Το αίτημα ολοκληρώθηκε.", "success");
    } catch (e) {
      setScheduled(prev);
      showToast(e instanceof Error ? e.message : "Σφάλμα", "error");
      throw e;
    }
  };

  if (!canManage) {
    return (
      <div className="space-y-6">
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Πρόγραμμα Αιτημάτων"
        subtitle="Ουρά αιτημάτων χωρίς ημερομηνία και εβδομαδιαίο ημερολόγιο προγραμματισμού."
        actions={
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className={lux.btnSecondary + " !rounded-full !py-2 !text-sm"}
            aria-label="Ανανέωση"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Ανανέωση
          </button>
        }
      />

      {error ? (
        <div className="rounded-xl border border-[var(--danger)]/40 bg-[color-mix(in_srgb,var(--danger)_12%,var(--bg-card))] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      <div className="flex gap-2 lg:hidden">
        {(["queue", "calendar"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setMobilePanel(tab)}
            className={[
              "flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold transition",
              mobilePanel === tab
                ? "border-[var(--accent-gold)] bg-[color-mix(in_srgb,var(--accent-gold)_14%,var(--bg-card))] text-foreground"
                : "border-border bg-card text-muted-foreground",
            ].join(" ")}
          >
            {tab === "queue" ? "Ουρά" : "Ημερολόγιο"}
          </button>
        ))}
      </div>

      <div className="flex min-h-[min(70vh,720px)] flex-col gap-4 lg:flex-row lg:gap-6">
        {/* Queue */}
        <section
          className={[
            "flex w-full flex-col rounded-2xl border border-border bg-card shadow-[var(--card-shadow)] lg:w-[min(100%,22rem)] lg:shrink-0",
            mobilePanel === "calendar" ? "hidden lg:flex" : "flex",
          ].join(" ")}
          aria-label="Ουρά αιτημάτων"
        >
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--accent-gold)]">
              Ουρά ({queue.length})
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">Χωρίς προγραμματισμένη ημερομηνία</p>
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
                    onToggleSchedule={() =>
                      setScheduleOpenId((id) => (id === r.id ? null : r.id))
                    }
                    onSchedule={(date) => void scheduleRequest(r.id, date)}
                  />
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Calendar */}
        <section
          className={[
            "flex min-h-0 min-w-0 flex-1 flex-col rounded-2xl border border-border bg-card shadow-[var(--card-shadow)]",
            mobilePanel === "queue" ? "hidden lg:flex" : "flex",
          ].join(" ")}
          aria-label="Εβδομαδιαίο ημερολόγιο"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--accent-gold)]">
                Ημερολόγιο
              </h2>
              <p className="mt-0.5 text-sm font-medium text-foreground">{weekLabel}</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => shiftWeek(-1)}
                className={lux.btnIcon}
                aria-label="Προηγούμενη εβδομάδα"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() =>
                  setWeekStart(format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"))
                }
                className={lux.btnSecondary + " !px-3 !py-1.5 !text-xs"}
              >
                Σήμερα
              </button>
              <button
                type="button"
                onClick={() => shiftWeek(1)}
                className={lux.btnIcon}
                aria-label="Επόμενη εβδομάδα"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto p-3">
            <div className="grid min-w-[56rem] grid-cols-7 gap-2">
              {days.map((ymd) => {
                const d = parseISO(ymd);
                const items = scheduledByDay.get(ymd) ?? [];
                const today = isToday(d);
                return (
                  <div
                    key={ymd}
                    className={[
                      "flex min-h-[12rem] flex-col rounded-xl border border-border bg-[color-mix(in_srgb,var(--bg-elevated)_35%,var(--bg-card))]",
                      today ? "ring-1 ring-[var(--accent-gold)]/50" : "",
                    ].join(" ")}
                  >
                    <div
                      className={[
                        "border-b border-border px-2 py-2 text-center",
                        today ? "bg-[color-mix(in_srgb,var(--accent-gold)_12%,transparent)]" : "",
                      ].join(" ")}
                    >
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {format(d, "EEE", { locale: el })}
                      </p>
                      <p className="text-sm font-bold tabular-nums text-foreground">
                        {format(d, "d/MM", { locale: el })}
                      </p>
                    </div>
                    <ul className="flex flex-1 flex-col gap-2 p-2">
                      {items.length === 0 ? (
                        <li className="py-4 text-center text-[10px] text-muted-foreground">—</li>
                      ) : (
                        items.map((r) => (
                          <CalendarCard
                            key={r.id}
                            request={r}
                            onComplete={() => completeRequest(r.id)}
                          />
                        ))
                      )}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function QueueCard({
  request: r,
  scheduleOpen,
  scheduling,
  onToggleSchedule,
  onSchedule,
}: {
  request: SchedulerRequest;
  scheduleOpen: boolean;
  scheduling: boolean;
  onToggleSchedule: () => void;
  onSchedule: (ymd: string) => void;
}) {
  const minDate = format(new Date(), "yyyy-MM-dd");

  return (
    <li className="relative rounded-xl border border-border bg-[color-mix(in_srgb,var(--bg-elevated)_40%,var(--bg-card))] p-3 shadow-sm">
      <Link href={`/requests/${r.id}`} className="block min-w-0">
        <p className="font-mono text-[10px] text-muted-foreground">{r.request_code ?? "—"}</p>
        <p className="mt-0.5 line-clamp-2 text-sm font-semibold text-foreground">{r.title}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{contactLabel(r.contacts)}</p>
        <p className="mt-1 text-[10px] text-muted-foreground">{r.status ?? "Νέο"}</p>
      </Link>
      <div className="relative mt-2">
        <button
          type="button"
          disabled={scheduling}
          onClick={onToggleSchedule}
          className="w-full rounded-lg border border-border bg-card px-2 py-1.5 text-xs font-semibold text-foreground transition hover:border-[var(--accent-gold)]/60 hover:bg-[color-mix(in_srgb,var(--accent-gold)_8%,var(--bg-card))] disabled:opacity-50"
        >
          📅 Προγραμματισμός
        </button>
        {scheduleOpen ? (
          <div
            className="absolute left-0 right-0 top-full z-30 mt-1 rounded-lg border border-border bg-card p-2 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Ημερομηνία
            </label>
            <input
              type="date"
              min={minDate}
              className={
                lux.dateInput +
                " !h-9 !text-xs [color-scheme:dark] [data-theme='light']:[color-scheme:light]"
              }
              disabled={scheduling}
              onChange={(e) => {
                const v = e.target.value;
                if (v) onSchedule(v);
              }}
            />
          </div>
        ) : null}
      </div>
    </li>
  );
}

function CalendarCard({
  request: r,
  onComplete,
}: {
  request: SchedulerRequest;
  onComplete: () => Promise<void>;
}) {
  const isCompleted = r.status === "Ολοκληρώθηκε";
  const isRejected = r.status === "Απορρίφθηκε";
  const showTick = !isCompleted && !isRejected;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [completing, setCompleting] = useState(false);

  const confirmComplete = async () => {
    setCompleting(true);
    try {
      await onComplete();
      setConfirmOpen(false);
    } catch {
      /* toast handled in parent */
    } finally {
      setCompleting(false);
    }
  };

  return (
    <li
      className={[
        "relative rounded-lg border border-border p-2 text-left shadow-sm transition",
        isCompleted
          ? "border-[var(--status-req-done-ring)] bg-[var(--status-req-done-bg)]"
          : "bg-card",
      ].join(" ")}
    >
      <div className="flex items-start gap-1">
        <Link href={`/requests/${r.id}`} className="min-w-0 flex-1">
          <p
            className={[
              "line-clamp-2 text-xs font-semibold leading-snug text-foreground",
              isCompleted ? "line-through opacity-80" : "",
            ].join(" ")}
          >
            {r.title}
          </p>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{contactLabel(r.contacts)}</p>
        </Link>
        {isCompleted ? (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--success)]" aria-hidden />
        ) : showTick ? (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setConfirmOpen((v) => !v)}
              className="flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-[color-mix(in_srgb,var(--success)_15%,transparent)]"
              aria-label="Ολοκλήρωση αιτήματος"
            >
              <CheckCircle2 className="h-5 w-5 text-[var(--success)]" />
            </button>
            {confirmOpen ? (
              <div className="absolute right-0 top-9 z-50 w-48 rounded-lg border border-border bg-card p-2 shadow-lg">
                <p className="text-[10px] text-foreground">Να επισημανθεί ως Ολοκληρώθηκε;</p>
                <div className="mt-2 flex gap-1">
                  <button
                    type="button"
                    className={lux.btnPrimary + " !py-1 !text-[10px] flex-1"}
                    disabled={completing}
                    onClick={() => void confirmComplete()}
                  >
                    Ναι
                  </button>
                  <button
                    type="button"
                    className={lux.btnSecondary + " !py-1 !text-[10px] flex-1"}
                    disabled={completing}
                    onClick={() => setConfirmOpen(false)}
                  >
                    Άκυρο
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}
