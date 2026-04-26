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
import { CAL_EVENT_TYPE_KEYS, CALENDAR_EVENT_TYPES, calendarTypeBlockClass, type CalendarEventType } from "@/lib/calendar-event-types";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { lux } from "@/lib/luxury-styles";

type CalEvent = {
  id: string;
  title?: string | null;
  start?: string | null;
  end?: string | null;
  location?: string | null;
  description?: string | null;
  type: CalendarEventType;
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

const emptyForm = () => ({
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
  const [loading, setLoading] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newEv, setNewEv] = useState(emptyForm);
  const [detail, setDetail] = useState<CalEvent | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

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

  const load = useCallback(async () => {
    setLoading(true);
    const q = new URLSearchParams({ timeMin, timeMax });
    const res = await fetchWithTimeout(`/api/schedule/events?${q}`);
    const data = await res.json();
    setEvents((data.events ?? []) as CalEvent[]);
    setConnected(Boolean(data.connected));
    setLoading(false);
  }, [timeMin, timeMax]);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEv.title.trim() || !newEv.start || !newEv.end) return;
    setSaving(true);
    await fetchWithTimeout("/api/schedule/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newEv.title,
        start: toIsoFromLocalInput(newEv.start),
        end: toIsoFromLocalInput(newEv.end),
        location: newEv.location,
        description: newEv.description,
        eventType: newEv.eventType,
      }),
    });
    setSaving(false);
    setShowNew(false);
    setNewEv(emptyForm());
    await load();
  };

  const onSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail?.id || isAllDayStr(detail.start) || !editForm.title.trim() || !editForm.start || !editForm.end) return;
    setSaving(true);
    await fetchWithTimeout(`/api/schedule/events/${detail.id}`, {
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
    setSaving(false);
    setEditing(false);
    setDetail(null);
    await load();
  };

  const onDelete = async (id: string) => {
    if (!confirm("Διαγραφή γεγονότος;")) return;
    await fetchWithTimeout(`/api/schedule/events/${id}`, { method: "DELETE" });
    setDetail(null);
    setEditing(false);
    await load();
  };

  const goToday = useCallback(() => {
    setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
  }, []);

  const openNewForEmpty = (day: Date) => {
    if (!connected) return;
    const a = new Date(day);
    a.setHours(9, 0, 0, 0);
    const b = new Date(day);
    b.setHours(10, 0, 0, 0);
    setNewEv({ ...emptyForm(), start: toDatetimeLocalValue(a.toISOString()), end: toDatetimeLocalValue(b.toISOString()) });
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

  return (
    <div className="min-h-full -m-6 flex flex-col bg-[var(--bg-primary)] p-4 text-[var(--text-primary)] md:-m-8 md:p-6">
      <div className="mx-auto w-full max-w-[1680px] flex-1">
        {/* Top bar */}
        <div
          className="mb-4 space-y-4 rounded-2xl border border-[var(--border)] bg-gradient-to-b from-[var(--bg-card)]/95 to-[#060d18]/95 p-4 shadow-[0_4px_40px_rgba(0,0,0,0.5)] ring-1 ring-inset ring-white/5 backdrop-blur-md"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--accent-gold)]/30 bg-gradient-to-br from-[#0d1829] to-[#050a12]">
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
            <a href="/api/auth/google" className={lux.btnSecondary + " !h-9 !px-3 !text-xs sm:!text-sm"}>
              Σύνδεση Google
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
                const a = new Date();
                a.setSeconds(0, 0);
                a.setHours(9, 0, 0, 0);
                const b = new Date();
                b.setSeconds(0, 0);
                b.setHours(10, 0, 0, 0);
                setNewEv({
                  ...emptyForm(),
                  start: toDatetimeLocalValue(a.toISOString()),
                  end: toDatetimeLocalValue(b.toISOString()),
                });
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
          <p className="mb-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-100/90">
            Συνδεθείτε στο Google Ημερολόγιο για πλήρη λειτουργία. Μπορείτε ακόμα να περιηγηθείτε στο πρόγραμμα.
          </p>
        )}

        {/* Full-width calendar */}
        <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="min-w-[880px]">
            {/* Day headers */}
            <div
              className="grid"
              style={{ gridTemplateColumns: `56px repeat(7, minmax(0,1fr))` }}
            >
              <div className="min-h-[3rem] border-b border-r border-[var(--border)] bg-[var(--bg-elevated)]/50" />
              {displayDays.map((d) => {
                const today = isToday(d);
                return (
                  <div
                    key={d.toISOString()}
                    className={[
                      "border-b p-2 text-center",
                      today
                        ? "bg-[var(--accent-gold)]/8 ring-1 ring-inset ring-[var(--accent-gold)]/25"
                        : "bg-[var(--bg-elevated)]/30",
                    ].join(" ")}
                  >
                    <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                      {format(d, "EEE", { locale: el })}
                    </p>
                    <p
                      className={
                        "text-sm font-semibold " + (today ? "text-[var(--accent-gold)]" : "text-[var(--text-primary)]")
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
              <div className="border-r border-[var(--border)] bg-[var(--bg-primary)]/60">
                {weekHasAllDay && <div className="box-border border-b border-[var(--border)]/50" style={{ height: ALLDAY_STRIP_H }} aria-hidden />}
                {hours.map((h) => (
                  <div
                    key={h}
                    className="box-border border-b border-[var(--border)]/50 pr-1 text-right"
                    style={{ height: PX_H, paddingTop: 0 }}
                  >
                    <span className="block -translate-y-2 pl-0 text-[10px] tabular-nums text-[var(--text-muted)]">
                      {String(h).padStart(2, "0")}:00
                    </span>
                  </div>
                ))}
              </div>

              {displayDays.map((d) => {
                const today = isToday(d);
                const des = dayEvents(d);
                const { timed, allDay } = layoutDayTimed(d, des);
                const stripH = (weekHasAllDay || allDay.length > 0) ? ALLDAY_STRIP_H : 0;

                return (
                  <div
                    key={d.toISOString()}
                    className={[
                      "group/cell flex flex-col border-l border-[var(--border)]",
                      today ? "bg-[var(--accent-gold)]/[0.07]" : "bg-[var(--bg-primary)]/20",
                    ].join(" ")}
                  >
                    {stripH > 0 && (
                      <div
                        className="shrink-0 border-b border-[var(--border)]/80 bg-[var(--bg-elevated)]/50 px-1.5"
                        style={{ minHeight: stripH }}
                      >
                        {allDay.length > 0
                          ? allDay.map((ev) => (
                              <button
                                key={ev.id}
                                type="button"
                                onClick={() => openDetail(ev)}
                                className={
                                  "mb-0.5 w-full rounded-md px-1.5 py-0.5 text-left text-[10px] " +
                                  calendarTypeBlockClass(ev.type)
                                }
                              >
                                <span className="line-clamp-1 font-medium">{ev.title ?? "—"}</span>
                                <span className="block text-[9px] opacity-80">Όλη η μέρα</span>
                              </button>
                            ))
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
                          className="pointer-events-none box-border border-b border-dashed border-[var(--border)]/35"
                          style={{ height: PX_H }}
                        />
                      ))}

                      {timed.map(({ ev, top, height, col, nCols }) => {
                        const w = 100 / nCols;
                        return (
                          <button
                            key={ev.id}
                            type="button"
                            onClick={() => openDetail(ev)}
                            className={
                              "absolute flex flex-col overflow-hidden rounded-md px-1.5 py-0.5 text-left shadow-sm transition duration-150 hover:brightness-110 " +
                              calendarTypeBlockClass(ev.type)
                            }
                            style={{
                              top,
                              height,
                              left: `calc(${(col * 100) / nCols}% + 2px)`,
                              width: `calc(${w}% - 4px)`,
                              zIndex: 2 + col,
                            }}
                          >
                            <span className="line-clamp-1 text-[11px] font-semibold leading-tight">
                              {ev.title ?? "—"}
                            </span>
                            {ev.start && !isAllDayStr(ev.start) && (
                              <span className="text-[9px] opacity-90">
                                {format(new Date(ev.start), "HH:mm", { locale: el })} —{" "}
                                {ev.end ? format(new Date(ev.end), "HH:mm", { locale: el }) : "—"}
                              </span>
                            )}
                            {ev.location ? (
                              <span className="line-clamp-1 flex min-h-0 items-center gap-0.5 text-[9px] opacity-75">
                                <MapPin className="h-2.5 w-2.5 shrink-0 opacity-60" />
                                {ev.location}
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

        {detail && (
          <div
            className={lux.modalOverlay}
            onClick={() => {
              setDetail(null);
              setEditing(false);
            }}
            role="presentation"
          >
            <div
              className="mx-4 w-full max-w-md overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
            >
              {!editing && detail && (
                <div>
                  <div
                    className="mb-3 inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-medium text-[var(--text-muted)] ring-1 ring-inset ring-[var(--border)]"
                  >
                    {CALENDAR_EVENT_TYPES[detail.type].label}
                  </div>
                  <h2 className="text-lg font-semibold text-[var(--text-primary)]">{detail.title}</h2>
                  {detail.start && !isAllDayStr(detail.start) && (
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                      {format(new Date(detail.start), "PPPp", { locale: el })} —{" "}
                      {detail.end ? format(new Date(detail.end), "Pp", { locale: el }) : ""}
                    </p>
                  )}
                  {detail.start && isAllDayStr(detail.start) && (
                    <p className="mt-1 text-sm text-amber-200/90">Όλη η μέρα (ημερολόγιο Google)</p>
                  )}
                  {detail.location && (
                    <p className="mt-2 flex items-start gap-1.5 text-sm text-[var(--text-primary)]">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                      {detail.location}
                    </p>
                  )}
                  {detail.description && (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--text-secondary)]">{detail.description}</p>
                  )}
                </div>
              )}
              {editing && detail && !isAllDayStr(detail.start) && (
                <form onSubmit={onSaveEdit} className="space-y-3">
                  <h2 className="text-lg font-semibold text-[var(--text-primary)]">Επεξεργασία</h2>
                  <div>
                    <label className={lux.label}>Τίτλος</label>
                    <input
                      className={lux.input}
                      value={editForm.title}
                      onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className={lux.label}>Έναρξη / Λήξη</label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input
                        className={lux.input}
                        type="datetime-local"
                        value={editForm.start}
                        onChange={(e) => setEditForm({ ...editForm, start: e.target.value })}
                        required
                      />
                      <input
                        className={lux.input}
                        type="datetime-local"
                        value={editForm.end}
                        onChange={(e) => setEditForm({ ...editForm, end: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className={lux.label}>Τύπος</label>
                    <select
                      className={lux.select}
                      value={editForm.eventType}
                      onChange={(e) => setEditForm({ ...editForm, eventType: e.target.value as CalendarEventType })}
                    >
                      {CAL_EVENT_TYPE_KEYS.map((k) => (
                        <option key={k} value={k}>
                          {CALENDAR_EVENT_TYPES[k].label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={lux.label}>Τοποθεσία</label>
                    <input
                      className={lux.input}
                      value={editForm.location}
                      onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={lux.label}>Περιγραφή</label>
                    <textarea
                      className={lux.textarea + " !min-h-[80px]"}
                      value={editForm.description}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
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
                    <button type="submit" disabled={saving} className={lux.btnPrimary}>
                      {saving ? "—" : "Αποθήκευση"}
                    </button>
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
            </div>
          </div>
        )}

        {/* Νέο event modal */}
        {showNew && (
          <div className={lux.modalOverlay} onClick={() => setShowNew(false)} role="presentation">
            <form
              onClick={(e) => e.stopPropagation()}
              onSubmit={onCreate}
              className="mx-4 w-full max-w-md overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-2xl"
            >
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Νέο event</h2>
              <p className="mb-4 text-xs text-[var(--text-muted)]">Ημερολόγιο: Google Calendar</p>
              <div className="space-y-3">
                <div>
                  <label className={lux.label}>Τίτλος</label>
                  <input
                    className={lux.input}
                    value={newEv.title}
                    onChange={(e) => setNewEv({ ...newEv, title: e.target.value })}
                    required
                    placeholder="Τίτλος"
                  />
                </div>
                <div>
                  <label className={lux.label}>Ημ/νία & ώρες</label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      className={lux.input}
                      type="datetime-local"
                      value={newEv.start}
                      onChange={(e) => setNewEv({ ...newEv, start: e.target.value })}
                      required
                    />
                    <input
                      className={lux.input}
                      type="datetime-local"
                      value={newEv.end}
                      onChange={(e) => setNewEv({ ...newEv, end: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className={lux.label}>Τύπος</label>
                  <select
                    className={lux.select}
                    value={newEv.eventType}
                    onChange={(e) => setNewEv({ ...newEv, eventType: e.target.value as CalendarEventType })}
                  >
                    {CAL_EVENT_TYPE_KEYS.map((k) => (
                      <option key={k} value={k}>
                        {CALENDAR_EVENT_TYPES[k].label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={lux.label}>Τοποθεσία</label>
                  <input
                    className={lux.input}
                    value={newEv.location}
                    onChange={(e) => setNewEv({ ...newEv, location: e.target.value })}
                    placeholder="Τοποθεσία"
                  />
                </div>
                <div>
                  <label className={lux.label}>Περιγραφή</label>
                  <textarea
                    className={lux.textarea + " !min-h-[80px]"}
                    value={newEv.description}
                    onChange={(e) => setNewEv({ ...newEv, description: e.target.value })}
                    placeholder="Λεπτομέρειες…"
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-2 border-t border-[var(--border)] pt-4">
                <button type="button" className={lux.btnSecondary} onClick={() => setShowNew(false)}>
                  Άκυρο
                </button>
                <button type="submit" disabled={saving} className={lux.btnGold + " w-full sm:w-auto"}>
                  {saving ? "—" : "Αποθήκευση"}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
