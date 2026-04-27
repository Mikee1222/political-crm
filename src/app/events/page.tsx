"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { Calendar as CalendarIcon, MapPin, Plus, Sparkles, Users, CalendarCheck } from "lucide-react";
import { useProfile } from "@/contexts/profile-context";
import { hasMinRole } from "@/lib/roles";
import { lux } from "@/lib/luxury-styles";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { PageHeader } from "@/components/ui/page-header";
import { CenteredModal } from "@/components/ui/centered-modal";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { HqSelect } from "@/components/ui/hq-select";
import { useFormToast } from "@/contexts/form-toast-context";

type Ev = {
  id: string;
  title: string;
  description: string | null;
  date: string;
  location: string | null;
  type: string;
  status: string;
  start_time: string | null;
  end_time: string | null;
  max_attendees: number | null;
  attendee_count?: number;
};

function typeBadgeClass(t: string) {
  const s = t.toLowerCase();
  if (s.includes("συνάν")) return "border-sky-500/40 bg-sky-500/10 text-sky-200";
  if (s.includes("προεκλ")) return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  if (s.includes("άλλο")) return "border-slate-500/40 bg-slate-500/10 text-slate-200";
  return "border-[#C9A84C]/45 bg-[#C9A84C]/10 text-[#E8C96B]";
}

function dateParts(dateStr: string) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) {
    return { day: "—", month: "" };
  }
  return {
    day: d.getDate().toString().padStart(2, "0"),
    month: d.toLocaleString("el-GR", { month: "short" }),
  };
}

function EventsEmpty() {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-[var(--border)] bg-gradient-to-b from-[var(--bg-elevated)]/60 to-[var(--bg-primary)]/80 px-6 py-20 text-center"
      role="status"
    >
      <div className="relative">
        <svg
          className="h-36 w-36 text-[#C9A84C]/25"
          viewBox="0 0 200 200"
          fill="none"
          aria-hidden
        >
          <circle cx="100" cy="100" r="90" stroke="currentColor" strokeWidth="1.2" />
          <path
            d="M100 32v24M100 144v24M32 100h24M144 100h24"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            opacity="0.5"
          />
          <rect
            x="64"
            y="72"
            width="72"
            height="56"
            rx="8"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="url(#g)"
            opacity="0.9"
          />
          <defs>
            <linearGradient id="g" x1="64" y1="72" x2="136" y2="128" gradientUnits="userSpaceOnUse">
              <stop stopColor="#C9A84C" stopOpacity="0.35" />
              <stop offset="1" stopColor="#1e5fa8" stopOpacity="0.2" />
            </linearGradient>
          </defs>
        </svg>
        <CalendarCheck className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 text-[#C9A84C]/70" />
      </div>
      <div>
        <p className="text-lg font-semibold text-[var(--text-primary)]">Καμία εκδήλωση ακόμα</p>
        <p className="mt-1 max-w-sm text-sm text-[var(--text-secondary)]">
          Δημιουργήστε την πρώτη εκδήλωση — θα εμφανιστεί εδώ με κάρτα, ημερομηνία και συμμετέχοντες.
        </p>
      </div>
    </div>
  );
}

function EventsBody() {
  const { profile } = useProfile();
  const can = hasMinRole(profile?.role, "manager");
  const [list, setList] = useState<Ev[]>([]);
  const [openCreate, setOpenCreate] = useState(false);
  const [detail, setDetail] = useState<Ev | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [f, setF] = useState({ title: "", date: "", location: "", type: "Εκδήλωση" });
  const [createSaving, setCreateSaving] = useState(false);
  const { showToast } = useFormToast();

  const load = useCallback(async () => {
    const r = await fetchWithTimeout("/api/events");
    const j = (await r.json()) as { events?: Ev[] };
    setList(j.events ?? []);
  }, []);

  useEffect(() => {
    if (can) void load();
  }, [can, load]);

  const openDetail = useCallback(async (e: Ev) => {
    setDetail(e);
    setDetailLoading(true);
    const r = await fetchWithTimeout(`/api/events/${e.id}`);
    setDetailLoading(false);
    if (r.ok) {
      const j = (await r.json()) as { event?: Ev };
      if (j.event) {
        setDetail({ ...e, ...j.event, attendee_count: e.attendee_count });
        return;
      }
    }
  }, []);

  const sorted = useMemo(() => {
    return [...list].sort((a, b) => {
      const ta = new Date(a.date).getTime();
      const tb = new Date(b.date).getTime();
      if (Number.isNaN(ta) || Number.isNaN(tb)) {
        return 0;
      }
      return ta - tb;
    });
  }, [list]);

  if (!can) {
    return <p className="p-4 text-sm">Δεν έχετε πρόσβαση.</p>;
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl space-y-6">
      <PageHeader
        title="Εκδηλώσεις"
        subtitle="Προεκλογικές εμφανίσεις, συναντήσεις και events — grid με κάρτες"
        actions={
          <button
            type="button"
            className={lux.btnPrimary + " inline-flex items-center gap-2 !px-5 !py-2.5 text-sm font-bold shadow-[0_4px_20px_rgba(201,168,76,0.25)]"}
            onClick={() => setOpenCreate(true)}
          >
            <Plus className="h-4 w-4" />
            Νέα εκδήλωση
          </button>
        }
      />

      {sorted.length === 0 && !openCreate && <EventsEmpty />}

      {sorted.length > 0 && (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.map((e) => {
            const { day, month } = dateParts(e.date);
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => void openDetail(e)}
                className="group w-full min-w-0 text-left"
              >
                <article
                  className="flex h-full min-h-[280px] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-gradient-to-b from-[var(--bg-card)] to-[var(--bg-elevated)]/30 shadow-md transition duration-200 hover:-translate-y-0.5 hover:border-[#C9A84C]/45 hover:shadow-[0_12px_40px_rgba(0,0,0,0.35)]"
                >
                  <div className="relative h-36 w-full overflow-hidden border-b border-[var(--border)]/60 bg-gradient-to-br from-[#0A1628] via-[#132a4a] to-[#1e5fa8]/40">
                    <div
                      className="absolute inset-0 opacity-[0.15]"
                      style={{
                        backgroundImage: "radial-gradient(circle at 20% 30%, #C9A84C 0, transparent 45%)",
                      }}
                    />
                    <div className="absolute left-4 top-3 flex h-16 w-14 flex-col items-center justify-center rounded-xl border border-white/10 bg-[#0a0f1a]/85 px-1 shadow-lg backdrop-blur-sm">
                      <span className="text-[10px] font-bold uppercase leading-none tracking-wide text-[#C9A84C]">
                        {month}
                      </span>
                      <span className="mt-1.5 text-2xl font-extrabold tabular-nums leading-none text-white">{day}</span>
                    </div>
                    <Sparkles className="absolute right-3 top-3 h-6 w-6 text-[#C9A84C]/40" aria-hidden />
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col p-4">
                    <h3 className="line-clamp-2 min-h-[2.75rem] text-base font-bold leading-snug text-[var(--text-primary)] group-hover:text-[#E8C96B]">
                      {e.title}
                    </h3>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-[#1e5fa8]/90" />
                      <span className="line-clamp-1">{e.location || "—"}</span>
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span
                        className={
                          "inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold " +
                          typeBadgeClass(e.type)
                        }
                      >
                        {e.type}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
                        <Users className="h-3.5 w-3.5 text-[#C9A84C]/80" />
                        {e.attendee_count ?? 0}
                        <span className="hidden sm:inline">συμμετέχοντες</span>
                      </span>
                    </div>
                  </div>
                </article>
              </button>
            );
          })}
        </div>
      )}

      <CenteredModal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        title="Νέα εκδήλωση"
        ariaLabel="Νέα εκδήλωση"
        className="!max-w-md"
        footer={
          <>
            <button type="button" className={lux.btnSecondary} onClick={() => setOpenCreate(false)} disabled={createSaving}>
              Άκυρο
            </button>
            <FormSubmitButton
              type="button"
              variant="gold"
              loading={createSaving}
              onClick={async () => {
                if (!f.title.trim() || !f.date) {
                  showToast("Συμπληρώστε τίτλο και ημερομηνία.", "error");
                  return;
                }
                setCreateSaving(true);
                try {
                  const res = await fetchWithTimeout("/api/events", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(f),
                  });
                  const j = (await res.json().catch(() => ({}))) as { error?: string };
                  if (!res.ok) {
                    showToast(j.error ?? "Σφάλμα", "error");
                    return;
                  }
                  showToast("Η εκδήλωση δημιουργήθηκε.", "success");
                  setOpenCreate(false);
                  setF({ title: "", date: "", location: "", type: "Εκδήλωση" });
                  void load();
                } catch {
                  showToast("Σφάλμα δικτύου.", "error");
                } finally {
                  setCreateSaving(false);
                }
              }}
            >
              Αποθήκευση
            </FormSubmitButton>
          </>
        }
      >
        <div className="grid gap-4">
          <div>
            <label className={lux.label}>Τίτλος</label>
            <input
              className={lux.input}
              placeholder="Τίτλος"
              value={f.title}
              onChange={(e) => setF((x) => ({ ...x, title: e.target.value }))}
            />
          </div>
          <div>
            <label className={lux.label}>Ημερομηνία</label>
            <input
              className={[lux.input, lux.dateInput].join(" ")}
              type="date"
              value={f.date}
              onChange={(e) => setF((x) => ({ ...x, date: e.target.value }))}
            />
          </div>
          <div>
            <label className={lux.label}>Τοποθεσία</label>
            <input
              className={lux.input}
              placeholder="Τοποθεσία"
              value={f.location}
              onChange={(e) => setF((x) => ({ ...x, location: e.target.value }))}
            />
          </div>
          <div>
            <label className={lux.label}>Τύπος</label>
            <HqSelect value={f.type} onChange={(e) => setF((x) => ({ ...x, type: e.target.value }))}>
              {["Εκδήλωση", "Συνάντηση", "Προεκλογικό", "Άλλο"].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </HqSelect>
          </div>
        </div>
      </CenteredModal>

      <CenteredModal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? detail.title : "Εκδήλωση"}
        ariaLabel="Εκδήλωση"
        className="!max-w-lg !p-0"
        footer={
          <button type="button" className={lux.btnSecondary} onClick={() => setDetail(null)}>
            Άκυρο
          </button>
        }
      >
        {detail ? (
          <>
            <div className="relative h-40 w-full overflow-hidden border-b border-[var(--border)] bg-gradient-to-br from-[#0A1628] to-[#1e5fa8]/50">
              <div className="absolute left-4 top-3 flex h-16 w-14 flex-col items-center justify-center rounded-xl border border-white/10 bg-[#0a0f1a]/90 px-1">
                <span className="text-[10px] font-bold uppercase text-[#C9A84C]">
                  {dateParts(detail.date).month}
                </span>
                <span className="mt-1 text-2xl font-extrabold text-white">{dateParts(detail.date).day}</span>
              </div>
            </div>
            <div className="p-5">
              {detailLoading ? (
                <p className="text-sm text-[var(--text-muted)]">Φόρτωση…</p>
              ) : (
                <>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className={"inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold " + typeBadgeClass(detail.type)}>
                      {detail.type}
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">{detail.status || "—"}</span>
                  </div>
                  <p className="mt-2 flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#1e5fa8]" />
                    {detail.location || "—"}
                  </p>
                  {detail.start_time && (
                    <p className="mt-1 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                      <CalendarIcon className="h-4 w-4 text-[#C9A84C]" />
                      {detail.start_time}
                      {detail.end_time ? ` — ${detail.end_time}` : null}
                    </p>
                  )}
                  <p className="mt-3 flex items-center gap-2 text-sm">
                    <Users className="h-4 w-4 text-[#C9A84C]" />
                    <span>
                      {detail.attendee_count ?? 0} συμμετέχοντες
                      {detail.max_attendees != null ? ` / max ${detail.max_attendees}` : null}
                    </span>
                  </p>
                  {detail.description && (
                    <p className="mt-4 whitespace-pre-wrap border-t border-[var(--border)]/60 pt-4 text-sm text-[var(--text-secondary)]">
                      {detail.description}
                    </p>
                  )}
                </>
              )}
            </div>
          </>
        ) : null}
      </CenteredModal>
    </div>
  );
}

export default function EventsPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm">Φόρτωση…</p>}>
      <EventsBody />
    </Suspense>
  );
}
