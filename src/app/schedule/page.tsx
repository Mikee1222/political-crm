"use client";

import {
  addWeeks,
  eachDayOfInterval,
  endOfDay,
  endOfWeek,
  format,
  isSameDay,
  isToday,
  isWithinInterval,
  set,
  startOfDay,
  startOfWeek,
  subWeeks,
} from "date-fns";
import { el } from "date-fns/locale";
import { Calendar, ChevronLeft, ChevronRight, MapPin, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CAL_EVENT_TYPE_KEYS,
  CALENDAR_EVENT_TYPES,
  getScheduleEventSurface,
  type CalendarEventType,
} from "@/lib/calendar-event-types";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { lux } from "@/lib/luxury-styles";
import { stripHtml } from "@/lib/strip-html";
import { CenteredModal } from "@/components/ui/centered-modal";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { HqSelect } from "@/components/ui/hq-select";
import { useFormToast } from "@/contexts/form-toast-context";

type CalEvent = {
  id: string;
  /** Google calendar id (multi-calendar fetch) */
  calendarId?: string;
  title?: string | null;
  start?: string | null;
  end?: string | null;
  location?: string | null;
  description?: string | null;
  type: CalendarEventType;
  /** From DB `event_categories` (schedule API) */
  color?: string | null;
  typeLabel?: string | null;
};

const H_START = 8;
const H_END = 22;
const PX_H = 44;
const GRID_H = (H_END - H_START) * PX_H;
const ALLDAY_STRIP_H = 40;

function isAllDayStr(s: string | null | undefined) {
  if (!s) return true;
  return s.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function toDatetimeLocalValue(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIsoFromLocalInput(local: string) {
  if (!local) return "";
  return new Date(local).toISOString();
}

type TimedLaid = {
  ev: CalEvent;
  top: number;
  height: number;
  col: number;
  nCols: number;
};

function layoutDayTimed(
  d: Date,
  events: CalEvent[],
): { timed: TimedLaid[]; allDay: CalEvent[] } {
  const allDay: CalEvent[] = [];
  const toGeom: { ev: CalEvent; startMs: number; endMs: number; top: number; height: number }[] = [];
  const day0 = startOfDay(d);
  const winStart = set(day0, { hours: H_START, minutes: 0, seconds: 0, milliseconds: 0 });
  const winEnd = set(day0, { hours: H_END, minutes: 0, seconds: 0, milliseconds: 0 });

  events.forEach((ev) => {
    if (!ev.start) return;
    if (isAllDayStr(ev.start) || (ev.end && isAllDayStr(ev.end) && isAllDayStr(ev.start))) {
      if (isSameDay(new Date(ev.start + (isAllDayStr(ev.start) ? "T12:00:00" : "")), d)) {
        allDay.push(ev);
      }
      return;
    }
    if (!isSameDay(new Date(ev.start), d)) return;
    const s = new Date(ev.start!);
    const e = new Date((ev.end ?? ev.start) as string);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return;
    let t0 = Math.max(s.getTime(), winStart.getTime());
    const t1 = Math.min(e.getTime(), winEnd.getTime());
    if (t1 <= t0) {
      if (e.getTime() > winStart.getTime() && s.getTime() < winEnd.getTime()) {
        t0 = winStart.getTime();
      } else {
        return;
      }
    }
    const m0 = (t0 - winStart.getTime()) / 60_000;
    const m1 = (t1 - winStart.getTime()) / 60_000;
    const top = (m0 / 60) * PX_H;
    const height = Math.max(((m1 - m0) / 60) * PX_H, 20);
    toGeom.push({ ev, startMs: t0, endMs: t1, top, height });
  });

  toGeom.sort((a, b) => a.startMs - b.startMs);
  const colEnd: number[] = [];
  const out: TimedLaid[] = [];
  for (const g of toGeom) {
    let c = 0;
    while (c < colEnd.length && (colEnd[c] ?? 0) > g.startMs) c++;
    if (c === colEnd.length) colEnd.push(0);
    colEnd[c] = g.endMs;
    out.push({ ev: g.ev, top: g.top, height: g.height, col: c, nCols: 0 });
  }
  const m = out.length ? Math.max(...out.map((o) => o.col)) + 1 : 1;
  for (const o of out) o.nCols = m;
  return { timed: out, allDay };
}

function toIsoFromDateAndTime(dateStr: string, timeStr: string) {
  if (!dateStr || !timeStr) return "";
  const combined = timeStr.length >= 5 ? `${dateStr}T${timeStr.length === 5 ? `${timeStr}:00` : timeStr}` : "";
  if (!combined) return "";
  const d = new Date(combined);
  if (isNaN(d.getTime())) return "";
  return d.toISOString();
}

const newEventDefaults = () => ({
  title: "",
  date: format(new Date(), "yyyy-MM-dd"),
  startTime: "09:00",
  endTime: "10:00",
  location: "",
  description: "",
  eventType: "meeting" as CalendarEventType,
});

const emptyEditForm = () => ({
  title: "",
  start: "",
  end: "",
  location: "",
  description: "",
  eventType: "meeting" as CalendarEventType,
});

export default function SchedulePage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [weekLoadError, setWeekLoadError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newEv, setNewEv] = useState(newEventDefaults);
  const [createError, setCreateError] = useState<string | null>(null);
  const [detail, setDetail] = useState<CalEvent | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(emptyEditForm);
  const [saving, setSaving] = useState(false);
  const { showToast } = useFormToast();

  const weekEnd = useMemo(() => endOfWeek(weekStart, { weekStartsOn: 1 }), [weekStart]);
  const displayDays = useMemo(
    () => eachDayOfInterval({ start: weekStart, end: weekEnd }),
    [weekStart, weekEnd],
  );
  const timeMin = weekStart.toISOString();
  const timeMax = weekEnd.toISOString();

  const weekHasAllDay = useMemo(() => {
    for (const ev of events) {
      if (ev.start && isAllDayStr(ev.start)) {
        const t = new Date(`${ev.start}T12:00:00`);
        if (isWithinInterval(t, { start: startOfDay(weekStart), end: endOfDay(weekEnd) })) {
          return true;
        }
      }
    }
    return false;
  }, [events, weekStart, weekEnd]);

  const hasEventsInDisplayedWeek = useMemo(() => {
    const ws = startOfDay(weekStart);
    const we = endOfDay(weekEnd);
    for (const ev of events) {
      if (!ev.start) continue;
      const s = new Date(isAllDayStr(ev.start) ? `${ev.start}T12:00:00` : ev.start);
      if (isNaN(s.getTime())) continue;
      if (s >= ws && s <= we) return true;
      if (ev.end) {
        const e = new Date(isAllDayStr(ev.end) ? `${ev.end}T23:59:59` : ev.end);
        if (!isNaN(e.getTime()) && s <= we && e >= ws) return true;
      }
    }
    return false;
  }, [events, weekStart, weekEnd]);

  const load = useCallback(async () => {
    setLoading(true);
    const q = new URLSearchParams({ timeMin, timeMax });
    const res = await fetchWithTimeout(`/api/schedule/events?${q}`);
    const data = (await res.json()) as {
      events?: CalEvent[];
      connected?: boolean;
      error?: string;
    };
    setEvents((data.events ?? []) as CalEvent[]);
    setWeekLoadError(res.status === 502 || data.error === "calendar_error");
    if (res.status === 401) {
      setConnected(null);
    } else if (data.error === "not_connected" || data.connected === false) {
      setConnected(false);
    } else {
      setConnected(true);
    }
    setLoading(false);
  }, [timeMin, timeMax]);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEv.title.trim() || !newEv.date) {
      showToast("Συμπληρώστε τίτλο και ημερομηνία.", "error");
      return;
    }
    setCreateError(null);
    const startIso = toIsoFromDateAndTime(newEv.date, newEv.startTime);
    const endIso = toIsoFromDateAndTime(newEv.date, newEv.endTime);
    if (!startIso || !endIso) {
      const msg = "Μη έγκυρη ημ/νία ή ώρα.";
      setCreateError(msg);
      showToast(msg, "error");
      return;
    }
    if (new Date(endIso) <= new Date(startIso)) {
      const msg = "Η λήξη πρέπει να είναι μετά την έναρξη.";
      setCreateError(msg);
      showToast(msg, "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetchWithTimeout("/api/schedule/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newEv.title.trim(),
          start: startIso,
          end: endIso,
          location: newEv.location.trim() || undefined,
          description: newEv.description.trim() || undefined,
          eventType: newEv.eventType,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        const msg = body.error ?? `Σφάλμα ${res.status}`;
        setCreateError(msg);
        showToast(msg, "error");
        return;
      }
      showToast("Το γεγονός δημιουργήθηκε επιτυχώς.", "success");
      setShowNew(false);
      setNewEv(newEventDefaults());
      await load();
    } catch {
      const msg = "Αποτυχία δικτύου. Δοκιμάστε ξανά.";
      setCreateError(msg);
      showToast(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  const onSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail?.id || isAllDayStr(detail.start) || !editForm.title.trim() || !editForm.start || !editForm.end) return;
    setSaving(true);
    try {
      const res = await fetchWithTimeout(`/api/schedule/events/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editForm.title,
          start: toIsoFromLocalInput(editForm.start),
          end: toIsoFromLocalInput(editForm.end),
          location: editForm.location,
          description: editForm.description,
          eventType: editForm.eventType,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        showToast(body.error ?? `Σφάλμα ${res.status}`, "error");
        return;
      }
      showToast("Οι αλλαγές αποθηκεύτηκαν.", "success");
      setEditing(false);
      setDetail(null);
      await load();
    } catch {
      showToast("Σφάλμα δικτύου.", "error");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm("Διαγραφή γεγονότος;")) return;
    try {
      const res = await fetchWithTimeout(`/api/schedule/events/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        showToast(j.error ?? "Αποτυχία διαγραφής", "error");
        return;
      }
      showToast("Το γεγονός διαγράφηκε.", "success");
    } catch {
      showToast("Σφάλμα δικτύου.", "error");
      return;
    }
    setDetail(null);
    setEditing(false);
    await load();
  };

  const goToday = useCallback(() => {
    setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
  }, []);

  const openNewForEmpty = (day: Date) => {
    if (!connected) return;
    setCreateError(null);
    setNewEv({ ...newEventDefaults(), date: format(day, "yyyy-MM-dd") });
    setShowNew(true);
  };

  const dayEvents = (d: Date) => events.filter((ev) => (ev.start ? isSameDay(new Date(isAllDayStr(ev.start) ? ev.start + "T12:00:00" : ev.start), d) : false));

  const openDetail = (ev: CalEvent) => {
    setDetail(ev);
    setEditing(false);
    if (ev.start && isAllDayStr(ev.start)) {
      setEditForm({
        title: ev.title ?? "",
        start: "",
        end: "",
        location: ev.location ?? "",
        description: ev.description ?? "",
        eventType: ev.type,
      });
      return;
    }
    setEditForm({
      title: ev.title ?? "",
      start: ev.start ? toDatetimeLocalValue(ev.start) : "",
      end: ev.end ? toDatetimeLocalValue(ev.end) : "",
      location: ev.location ?? "",
      description: ev.description ?? "",
      eventType: ev.type,
    });
  };

  const startEdit = () => {
    if (detail) {
      setEditing(true);
    }
  };

  const hours = useMemo(
    () => Array.from({ length: H_END - H_START }, (_, i) => H_START + i),
    [],
  );

  const detailSurface = detail ? getScheduleEventSurface(detail.type, detail.title, detail.color) : null;

  return (
    <div className="flex min-h-0 w-full max-w-full flex-1 flex-col bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <div className="mx-auto w-full max-w-[1680px] flex-1">
        {/* Top bar */}
        <div
          className="mb-4 space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-[0_4px_24px_rgba(0,0,0,0.12)] [data-theme='light']:shadow-[0_2px_12px_rgba(0,0,0,0.08)]"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--accent-gold)]/35 bg-[var(--bg-elevated)]">
                <Calendar className="h-5 w-5 text-[var(--accent-gold)]" />
              </div>
              <div>
                <h1 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">Πρόγραμμα</h1>
                <p className="text-xs text-[var(--text-muted)]">Εβδομαδιαία προβολή · Google Calendar</p>
              </div>
            </div>
            <div className="flex items-center justify-center gap-0.5 sm:justify-end">
              <button
                type="button"
                onClick={() => setWeekStart((w) => subWeeks(w, 1))}
                className={lux.btnIcon + " !h-9 !w-9 shrink-0"}
                aria-label="Προηγούμενη εβδομάδα"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <p className="min-w-0 max-w-[220px] truncate text-center text-xs font-medium text-[var(--text-primary)] sm:max-w-sm sm:px-2 sm:text-sm">
                {format(weekStart, "d MMM", { locale: el })}—{format(weekEnd, "d MMM yyyy", { locale: el })}
              </p>
              <button
                type="button"
                onClick={() => setWeekStart((w) => addWeeks(w, 1))}
                className={lux.btnIcon + " !h-9 !w-9 shrink-0"}
                aria-label="Επόμενη εβδομάδα"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 border-t border-[var(--border)]/60 pt-4 sm:justify-end">
            <a
              href="/api/auth/google"
              className={lux.btnSecondary + " !h-9 !px-3 !text-xs sm:!text-sm"}
            >
              Σύνδεση Google Calendar
            </a>
            <button
              type="button"
              onClick={() => void load()}
              className={lux.btnIcon + " !h-9 !w-9 border-[var(--border)]"}
              disabled={loading}
              title="Συγχρονισμός"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              onClick={goToday}
              className="inline-flex h-9 items-center rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-xs font-medium text-[var(--text-primary)] transition hover:border-[var(--accent-gold)]/40"
            >
              Σήμερα
            </button>
            <button
              type="button"
              disabled={!connected}
              onClick={() => {
                setCreateError(null);
                setNewEv(newEventDefaults());
                setShowNew(true);
              }}
              className={lux.btnGold + " !h-9 !px-4 !text-xs sm:!text-sm" + (connected ? "" : " !opacity-40")}
            >
              <Plus className="h-4 w-4" />
              Νέο Event
            </button>
          </div>
        </div>

        {connected === false && (
          <div
            className="mb-4 flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
            role="status"
          >
            <p className="text-sm text-amber-100/95">
              Δεν υπάρχει σύνδεση με το Google Calendar — δεν φορτώνονται εκδηλώσεις. Συνδεθείτε για συγχρονισμό
              εβδομάδας.
            </p>
            <a
              href="/api/auth/google"
              className={lux.btnPrimary + " shrink-0 !py-2.5 text-center text-sm sm:min-w-[200px]"}
            >
              Σύνδεση Google Calendar
            </a>
          </div>
        )}

        {connected === true && !loading && !weekLoadError && !hasEventsInDisplayedWeek && (
          <p
            className="mb-3 text-center text-sm text-[var(--text-secondary)]"
            role="status"
          >
            Δεν υπάρχουν γεγονότα αυτή την εβδομάδα
          </p>
        )}

        {/* Full-width calendar — luxury week grid */}
        <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-[0_4px_20px_rgba(0,0,0,0.1)] [data-theme='light']:shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
          <div className="min-w-[880px]">
            {/* Day headers */}
            <div
              className="grid"
              style={{ gridTemplateColumns: `56px repeat(7, minmax(0,1fr))` }}
            >
              <div className="min-h-[3.25rem] border-b border-r border-[var(--border)]/60 bg-[var(--bg-elevated)]/40" />
              {displayDays.map((d) => {
                const today = isToday(d);
                return (
                  <div
                    key={d.toISOString()}
                    className={[
                      "border-b border-l border-[var(--border)]/50 p-2.5 text-center",
                      today ? "bg-[#C9A84C]/10 ring-1 ring-inset ring-[#C9A84C]/25" : "bg-[var(--bg-elevated)]/25",
                    ].join(" ")}
                  >
                    <p
                      className={
                        "text-[10px] font-semibold uppercase tracking-wider " +
                        (today ? "text-[#B8860B]" : "text-[var(--text-muted)]")
                      }
                    >
                      {format(d, "EEE", { locale: el })}
                    </p>
                    <p
                      className={
                        "text-sm font-bold " + (today ? "text-[#C9A84C]" : "text-[var(--text-primary)]")
                      }
                    >
                      {format(d, "d MMM", { locale: el })}
                    </p>
                  </div>
                );
              })}
            </div>

            <div
              className="grid"
              style={{ gridTemplateColumns: `56px repeat(7, minmax(0,1fr))` }}
            >
              <div className="border-r border-[var(--border)]/60 bg-[var(--bg-primary)]/30">
                {weekHasAllDay && <div className="box-border border-b border-[var(--border)]/50" style={{ height: ALLDAY_STRIP_H }} aria-hidden />}
                {hours.map((h) => (
                  <div
                    key={h}
                    className="box-border border-b border-[var(--border)]/40 pr-2 text-right"
                    style={{ height: PX_H, paddingTop: 0 }}
                  >
                    <span className="block -translate-y-2 pl-0 text-[10px] tabular-nums text-[var(--text-muted)]/90">
                      {String(h).padStart(2, "0")}:00
                    </span>
                  </div>
                ))}
              </div>

              {displayDays.map((d) => {
                const today = isToday(d);
                const des = dayEvents(d);
                const { timed, allDay } = layoutDayTimed(d, des);
                const stripH = weekHasAllDay || allDay.length > 0 ? ALLDAY_STRIP_H : 0;

                return (
                  <div
                    key={d.toISOString()}
                    className={[
                      "group/cell flex min-h-0 flex-col border-l border-[var(--border)]/50",
                      today ? "bg-[#C9A84C]/6" : "bg-[var(--bg-primary)]/10",
                    ].join(" ")}
                  >
                    {stripH > 0 && (
                      <div
                        className="shrink-0 border-b border-[var(--border)]/50 bg-[var(--bg-elevated)]/35 px-1.5"
                        style={{ minHeight: stripH }}
                      >
                        {allDay.length > 0
                          ? allDay.map((ev) => {
                              const { color } = getScheduleEventSurface(ev.type, ev.title, ev.color);
                              const title = stripHtml(ev.title ?? null) || "—";
                              return (
                                <button
                                  key={ev.id + (ev.calendarId ?? "")}
                                  type="button"
                                  onClick={() => openDetail(ev)}
                                  className="min-h-10 w-full overflow-hidden rounded-lg border border-white/15 px-1.5 py-0.5 text-left text-white shadow-md transition-transform duration-200 hover:scale-[1.02] hover:shadow-lg"
                                  style={{ backgroundColor: color }}
                                >
                                  <span className="line-clamp-1 text-[10px] font-medium leading-tight [text-shadow:0_1px_0_rgba(0,0,0,0.2)] drop-shadow-sm">
                                    {title}
                                    {title.includes("Ραντεβού (Portal)") ? (
                                      <span className="ml-1 inline-block rounded bg-white/20 px-1 text-[8px] font-bold">Ραντεβού</span>
                                    ) : null}
                                  </span>
                                  <span className="mt-0.5 block text-[9px] font-bold text-white/95 [text-shadow:0_1px_0_rgba(0,0,0,0.15)]">
                                    Όλη η μέρα
                                  </span>
                                </button>
                              );
                            })
                          : null}
                      </div>
                    )}

                    <div
                      className="relative w-full min-w-0"
                      style={{
                        minHeight: GRID_H,
                        height: GRID_H,
                      }}
                    >
                      {hours.map((h) => (
                        <div
                          key={h}
                          className="pointer-events-none box-border border-b border-dashed border-[var(--border)]/30"
                          style={{ height: PX_H }}
                        />
                      ))}

                      {timed.map(({ ev, top, height, col, nCols }) => {
                        const w = 100 / nCols;
                        const { color } = getScheduleEventSurface(ev.type, ev.title, ev.color);
                        const title = stripHtml(ev.title ?? null) || "—";
                        const loc = ev.location ? stripHtml(ev.location) : "";
                        return (
                          <button
                            key={ev.id + (ev.calendarId ?? "") + col}
                            type="button"
                            onClick={() => openDetail(ev)}
                            className="absolute flex min-h-10 min-w-0 flex-col gap-0.5 overflow-hidden rounded-lg border border-white/20 px-1.5 py-0.5 text-left text-white shadow-md transition duration-200 hover:scale-[1.02] hover:shadow-lg"
                            style={{
                              top,
                              height: Math.max(height, 40),
                              left: `calc(${(col * 100) / nCols}% + 2px)`,
                              width: `calc(${w}% - 4px)`,
                              zIndex: 2 + col,
                              backgroundColor: color,
                            }}
                          >
                            {ev.start && !isAllDayStr(ev.start) && (
                              <span className="shrink-0 text-[9px] font-bold leading-tight text-white/95 [text-shadow:0_1px_0_rgba(0,0,0,0.2)]">
                                {format(new Date(ev.start), "HH:mm", { locale: el })} —{" "}
                                {ev.end ? format(new Date(ev.end), "HH:mm", { locale: el }) : "—"}
                              </span>
                            )}
                            <span className="line-clamp-2 min-h-0 text-[12px] font-medium leading-tight [text-shadow:0_1px_0_rgba(0,0,0,0.15)]">
                              {title}
                              {title.includes("Ραντεβού (Portal)") ? (
                                <span className="ml-1 inline-block rounded bg-white/20 px-1 text-[9px] font-bold">Ραντεβού</span>
                              ) : null}
                            </span>
                            {loc ? (
                              <span
                                className="line-clamp-1 flex min-h-0 min-w-0 items-center gap-0.5 text-[9px] text-white/90"
                                title={loc}
                              >
                                <MapPin className="h-2.5 w-2.5 shrink-0" aria-hidden />
                                <span className="min-w-0 truncate">{loc}</span>
                              </span>
                            ) : null}
                          </button>
                        );
                      })}

                      <button
                        type="button"
                        onClick={() => openNewForEmpty(d)}
                        disabled={!connected}
                        className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-[var(--accent-gold)]/25 bg-[var(--bg-card)]/80 px-2.5 py-0.5 text-sm font-light text-[var(--accent-gold)] opacity-0 shadow-lg backdrop-blur-sm transition-all duration-200 group-hover/cell:opacity-80 hover:opacity-100 disabled:pointer-events-none"
                        title="Νέο event"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {loading && <p className="mt-3 text-center text-xs text-[var(--text-muted)]">Φόρτωση…</p>}

        <CenteredModal
          open={Boolean(detail && detailSurface)}
          onClose={() => {
            setDetail(null);
            setEditing(false);
          }}
          className="max-w-md p-6"
          ariaLabel={editing ? "Επεξεργασία συμβάντος" : "Συμβάν ημερολογίου"}
        >
          {detail && detailSurface ? (
            <>
              {!editing && detail && (
                <div>
                  <div
                    className="mb-3 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold text-white ring-1 ring-inset ring-white/30"
                    style={{ backgroundColor: detailSurface.color }}
                  >
                    {detail.typeLabel?.trim() || CALENDAR_EVENT_TYPES[detailSurface.resolved].label}
                  </div>
                  <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                    {stripHtml(detail.title ?? null) || "—"}
                  </h2>
                  {detail.start && !isAllDayStr(detail.start) && (
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                      {format(new Date(detail.start), "PPPp", { locale: el })} —{" "}
                      {detail.end ? format(new Date(detail.end), "Pp", { locale: el }) : ""}
                    </p>
                  )}
                  {detail.start && isAllDayStr(detail.start) && (
                    <p className="mt-1 text-sm text-amber-200/90">Όλη η μέρα (ημερολόγιο Google)</p>
                  )}
                  {stripHtml(detail.location ?? null) ? (
                    <p className="mt-2 flex min-w-0 items-start gap-1.5 text-sm text-[var(--text-primary)]">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                      <span className="min-w-0 break-words">{stripHtml(detail.location)}</span>
                    </p>
                  ) : null}
                  {stripHtml(detail.description ?? null) ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--text-secondary)]">
                      {stripHtml(detail.description ?? null)}
                    </p>
                  ) : null}
                </div>
              )}
              {editing && detail && !isAllDayStr(detail.start) && (
                <form onSubmit={onSaveEdit} className="grid max-w-[640px] gap-4">
                  <h2 className="text-lg font-semibold text-[var(--text-primary)]">Επεξεργασία</h2>
                  <div>
                    <label className={lux.label}>
                      Τίτλος<span className="ml-0.5 text-red-500" aria-hidden>*</span>
                    </label>
                    <input
                      className={lux.input}
                      value={editForm.title}
                      onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                      placeholder="Τίτλος γεγονότος"
                      required
                    />
                  </div>
                  <div>
                    <label className={lux.label}>
                      Έναρξη / Λήξη<span className="ml-0.5 text-red-500" aria-hidden>*</span>
                    </label>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <input
                        className={[lux.input, "[color-scheme:dark]"].join(" ")}
                        type="datetime-local"
                        value={editForm.start}
                        onChange={(e) => setEditForm({ ...editForm, start: e.target.value })}
                        required
                      />
                      <input
                        className={[lux.input, "[color-scheme:dark]"].join(" ")}
                        type="datetime-local"
                        value={editForm.end}
                        onChange={(e) => setEditForm({ ...editForm, end: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className={lux.label}>Τύπος</label>
                    <HqSelect
                      value={editForm.eventType}
                      onChange={(e) => setEditForm({ ...editForm, eventType: e.target.value as CalendarEventType })}
                    >
                      {CAL_EVENT_TYPE_KEYS.map((k) => (
                        <option key={k} value={k}>
                          {CALENDAR_EVENT_TYPES[k].label}
                        </option>
                      ))}
                    </HqSelect>
                  </div>
                  <div>
                    <label className={lux.label}>Τοποθεσία</label>
                    <input
                      className={lux.input}
                      value={editForm.location}
                      onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                      placeholder="Προαιρετικό"
                    />
                  </div>
                  <div>
                    <label className={lux.label}>Περιγραφή</label>
                    <textarea
                      className={lux.textarea + " !min-h-[80px]"}
                      value={editForm.description}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                      placeholder="Προαιρετικό"
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap justify-end gap-2 border-t border-[var(--border)] pt-4">
                    <button
                      type="button"
                      className={lux.btnSecondary}
                      onClick={() => {
                        setEditing(false);
                      }}
                    >
                      Άκυρο
                    </button>
                    <FormSubmitButton type="submit" loading={saving} variant="gold">
                      Αποθήκευση
                    </FormSubmitButton>
                  </div>
                </form>
              )}
              {!editing && (
                <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-[var(--border)] pt-4">
                  <button type="button" className={lux.btnSecondary} onClick={() => setDetail(null)}>
                    Κλείσιμο
                  </button>
                  {detail && !isAllDayStr(detail.start) && (
                    <button
                      type="button"
                      className={lux.btnIcon + " gap-1 !h-auto !w-auto !px-3 !py-2 !text-sm"}
                      onClick={startEdit}
                    >
                      <Pencil className="h-4 w-4" />
                      Επεξεργασία
                    </button>
                  )}
                  {detail && (
                    <button
                      type="button"
                      className={lux.btnDanger + " !gap-1.5 !py-2 !text-sm"}
                      onClick={() => void onDelete(detail.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Διαγραφή
                    </button>
                  )}
                </div>
              )}
            </>
          ) : null}
        </CenteredModal>

        <CenteredModal
          open={showNew}
          onClose={() => {
            setShowNew(false);
            setCreateError(null);
          }}
          className="max-w-md p-6"
          ariaLabel="Νέο γεγονός"
        >
            <form onSubmit={onCreate} aria-labelledby="schedule-new-title">
              <h2 id="schedule-new-title" className="text-lg font-semibold text-[var(--text-primary)]">
                Νέο Event
              </h2>
              <p className="mb-4 text-xs text-[var(--text-muted)]">Προστίθεται στο Google Calendar (πρωτεύον)</p>
              {createError && (
                <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200" role="alert">
                  {createError}
                </p>
              )}
              <div className="grid max-w-[640px] gap-4">
                <div>
                  <label className={lux.label}>
                    Τίτλος<span className="ml-0.5 text-red-500" aria-hidden>*</span>
                  </label>
                  <input
                    className={lux.input}
                    value={newEv.title}
                    onChange={(e) => setNewEv({ ...newEv, title: e.target.value })}
                    required
                    autoFocus
                    placeholder="Τίτλος"
                  />
                </div>
                <div>
                  <label className={lux.label}>
                    Ημερ.<span className="ml-0.5 text-red-500" aria-hidden>*</span>
                  </label>
                  <input
                    className={[lux.input, lux.dateInput].join(" ")}
                    type="date"
                    value={newEv.date}
                    onChange={(e) => setNewEv({ ...newEv, date: e.target.value })}
                    required
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={lux.label}>
                      Έναρξη<span className="ml-0.5 text-red-500" aria-hidden>*</span>
                    </label>
                    <input
                      className={[lux.input, "[color-scheme:dark]"].join(" ")}
                      type="time"
                      value={newEv.startTime}
                      onChange={(e) => setNewEv({ ...newEv, startTime: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className={lux.label}>
                      Λήξη<span className="ml-0.5 text-red-500" aria-hidden>*</span>
                    </label>
                    <input
                      className={[lux.input, "[color-scheme:dark]"].join(" ")}
                      type="time"
                      value={newEv.endTime}
                      onChange={(e) => setNewEv({ ...newEv, endTime: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className={lux.label}>Τύπος</label>
                  <HqSelect value={newEv.eventType} onChange={(e) => setNewEv({ ...newEv, eventType: e.target.value as CalendarEventType })}>
                    {CAL_EVENT_TYPE_KEYS.map((k) => (
                      <option key={k} value={k}>
                        {CALENDAR_EVENT_TYPES[k].label}
                      </option>
                    ))}
                  </HqSelect>
                </div>
                <div>
                  <label className={lux.label}>Τοποθεσία</label>
                  <input
                    className={lux.input}
                    value={newEv.location}
                    onChange={(e) => setNewEv({ ...newEv, location: e.target.value })}
                    placeholder="Προαιρετικό"
                  />
                </div>
                <div>
                  <label className={lux.label}>Περιγραφή</label>
                  <textarea
                    className={lux.textarea + " !min-h-[88px]"}
                    value={newEv.description}
                    onChange={(e) => setNewEv({ ...newEv, description: e.target.value })}
                    placeholder="Προαιρετικό"
                  />
                </div>
              </div>
              <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-[var(--border)] pt-4">
                <button
                  type="button"
                  className={lux.btnSecondary}
                  onClick={() => {
                    setShowNew(false);
                    setCreateError(null);
                  }}
                >
                  Άκυρο
                </button>
                <FormSubmitButton type="submit" loading={saving} variant="gold">
                  Αποθήκευση
                </FormSubmitButton>
              </div>
            </form>
        </CenteredModal>
      </div>
    </div>
  );
}
