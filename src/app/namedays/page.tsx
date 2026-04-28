"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { lux } from "@/lib/luxury-styles";
import { normalizeGreek } from "@/lib/nameday-celebrating";
import { useFormToast } from "@/contexts/form-toast-context";

const MONTHS_HEADER = [
  "Ιανουάριος",
  "Φεβρουάριος",
  "Μάρτιος",
  "Απρίλιος",
  "Μάιος",
  "Ιούνιος",
  "Ιούλιος",
  "Αύγουστος",
  "Σεπτέμβριος",
  "Οκτώβριος",
  "Νοέμβριος",
  "Δεκέμβριος",
] as const;

const MONTHS_GEN = [
  "Ιανουαρίου",
  "Φεβρουαρίου",
  "Μαρτίου",
  "Απριλίου",
  "Μαΐου",
  "Ιουνίου",
  "Ιουλίου",
  "Αυγούστου",
  "Σεπτεμβρίου",
  "Οκτωβρίου",
  "Νοεμβρίου",
  "Δεκεμβρίου",
] as const;

type DayRow = { month: number; day: number; names: string[] };

function formatDateLabel(day: number, month: number) {
  return `${day} ${MONTHS_GEN[month - 1]}`;
}

type TodaySummary = { dateLabel: string; calendarNames: string[]; contactCount: number };

export default function NamedaysPage() {
  const { showToast } = useFormToast();
  const [days, setDays] = useState<DayRow[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [todaySummary, setTodaySummary] = useState<TodaySummary | null>(null);
  const [todayErr, setTodayErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const loadToday = useCallback(async () => {
    setTodayErr(null);
    const res = await fetchWithTimeout("/api/namedays/today-summary");
    const data = (await res.json()) as { dateLabel?: string; calendarNames?: string[]; contactCount?: number; error?: string };
    if (!res.ok) {
      const msg = data.error || "Σφάλμα";
      setTodayErr(msg);
      showToast(msg, "error");
      return;
    }
    setTodaySummary({
      dateLabel: data.dateLabel ?? "—",
      calendarNames: data.calendarNames ?? [],
      contactCount: typeof data.contactCount === "number" ? data.contactCount : 0,
    });
  }, [showToast]);

  const today = useMemo(() => {
    const d = new Date();
    return { m: d.getMonth() + 1, d: d.getDate() };
  }, []);

  const load = useCallback(async () => {
    setLoadErr(null);
    const res = await fetchWithTimeout("/api/namedays/calendar");
    const data = (await res.json()) as { days?: DayRow[]; error?: string };
    if (!res.ok) {
      const msg = data.error || "Σφάλμα φόρτωσης";
      setLoadErr(msg);
      showToast(msg, "error");
      return;
    }
    setDays(data.days ?? []);
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadToday();
  }, [loadToday]);

  const byMonth = useMemo(() => {
    const m: DayRow[][] = Array.from({ length: 12 }, () => []);
    for (const row of days) {
      if (row.month >= 1 && row.month <= 12) m[row.month - 1]!.push(row);
    }
    for (const arr of m) arr.sort((a, b) => a.day - b.day);
    return m;
  }, [days]);

  const queryNorm = useMemo(() => normalizeGreek(q.trim()), [q]);
  const hasQuery = queryNorm.length > 0;

  const nameMatches = useCallback(
    (row: DayRow) => {
      if (!hasQuery) return false;
      return row.names.some((name) => normalizeGreek(name).includes(queryNorm));
    },
    [hasQuery, queryNorm],
  );

  return (
    <div className="space-y-6">
      <section
        className="relative overflow-hidden rounded-2xl border-2 border-[var(--accent-gold)]/50 bg-gradient-to-b from-[rgba(201,168,76,0.14)] via-[var(--bg-card)] to-[var(--bg-secondary)] p-6 shadow-[0_8px_40px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(201,168,76,0.2)]"
        aria-labelledby="namedays-hero-title"
      >
        <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-[var(--accent-gold)]/10 blur-3xl" aria-hidden />
        <p id="namedays-hero-title" className="text-sm font-medium uppercase tracking-[0.2em] text-[var(--accent-gold)]">
          Σήμερα
        </p>
        {todayErr ? (
          <p className="mt-2 text-sm text-amber-200/90">{todayErr}</p>
        ) : !todaySummary ? (
          <p className="mt-3 text-sm text-[var(--text-muted)]">Φόρτωση…</p>
        ) : (
          <>
            <p className="mt-1 text-2xl font-semibold text-[var(--text-primary)] md:text-3xl">{todaySummary.dateLabel}</p>
            <p className="mt-4 break-words text-balance text-2xl font-bold leading-tight text-[var(--accent-gold)] [text-shadow:0_0_32px_rgba(201,168,76,0.25)] md:text-3xl">
              {todaySummary.calendarNames.length > 0
                ? todaySummary.calendarNames.join(" · ")
                : "Καμία καταχωρημένη εορτή σήμερα · δείτε το πλήρες ημερολόγιο παρακάτω"}
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <p className="text-sm text-[var(--text-secondary)]">
                <span className="text-lg font-bold tabular-nums text-[var(--text-primary)]">{todaySummary.contactCount}</span>{" "}
                {todaySummary.contactCount === 1
                  ? "επαφή στη βάση εορτάζει σήμερα (ονομαστική)"
                  : "επαφές στη βάση εορτάζουν σήμερα (ονομαστική)"}
              </p>
              <Link
                href="/contacts?nameday_today=1"
                className={lux.btnPrimary + " !inline-flex w-full !justify-center sm:w-auto !px-6 !py-3 !text-sm"}
              >
                Δες τις επαφές
              </Link>
            </div>
          </>
        )}
      </section>

      <div className={lux.card}>
        <h1 className={lux.pageTitle + " mb-1"}>Εορτολόγιο</h1>
        <p className="text-sm text-[var(--text-secondary)]">Ορθόδοξο εορτολόγιο (ονόματα εορτασμού ανά ημέρα)</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1 sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              className={lux.input + " !h-11 !pl-10"}
              type="search"
              placeholder="Αναζήτηση ονόματος…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoComplete="off"
              aria-label="Αναζήτηση ονόματος"
            />
          </div>
          {hasQuery && <p className="text-xs text-[var(--text-muted)]">Τονίζονται οι ημέρες με ταιριάζοντα όνομα</p>}
        </div>
        {loadErr && <p className="mt-3 text-sm text-amber-200">{loadErr}</p>}
        <p className="mt-4 text-xs text-[var(--text-muted)]">
          Η <span className="font-medium text-[var(--accent-gold)]">τρέχουσα ημέρα</span> τονίζεται με χρυσό πλαίσιο στο
          παρακάτω ημερολόγιο.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {MONTHS_HEADER.map((monthName, i) => {
          const monthNum = i + 1;
          const list = byMonth[i] ?? [];
          return (
            <section
              key={monthName}
              id={`month-${monthNum}`}
              className={[
                lux.cardFlat,
                "flex min-h-0 flex-col !p-0 overflow-hidden",
                "border border-[var(--border)] bg-[var(--bg-card)] shadow-[0_4px_24px_rgba(0,0,0,0.35)]",
              ].join(" ")}
            >
              <h2
                className="border-b border-[var(--border)] bg-gradient-to-r from-[rgba(201,168,76,0.12)] to-transparent px-5 py-3 text-sm font-bold uppercase tracking-[0.1em] text-[var(--accent-gold)]"
                style={{ fontFeatureSettings: '"tnum"' }}
              >
                {monthName}
              </h2>
              <ul className="max-h-[min(70vh,28rem)] flex-1 divide-y divide-[var(--border)] overflow-y-auto">
                {list.length === 0 && (
                  <li className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">Καμία καταχώρηση στη βάση</li>
                )}
                {list.map((row) => {
                  const isToday = row.month === today.m && row.day === today.d;
                  const isSearchHit = nameMatches(row);
                  const showDim = hasQuery && !isSearchHit;
                  return (
                    <li
                      key={`${row.month}-${row.day}`}
                      className={[
                        "px-4 py-3 text-sm transition-colors",
                        isToday
                          ? "bg-[rgba(201,168,76,0.1)] ring-1 ring-inset ring-[var(--accent-gold)]/60"
                          : isSearchHit
                            ? "bg-[rgba(201,168,76,0.06)] ring-1 ring-inset ring-[var(--accent-gold)]/35"
                            : "bg-transparent",
                        showDim ? "opacity-35" : "",
                      ].join(" ")}
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        {formatDateLabel(row.day, row.month)}
                      </p>
                      <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-primary)]">{row.names.join(", ")}</p>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
