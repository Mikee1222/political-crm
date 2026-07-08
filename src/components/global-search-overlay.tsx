"use client";

import Link from "next/link";
import { Search, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithTimeout, CLIENT_FETCH_TIMEOUT_MS } from "@/lib/client-fetch";
import { formatCalendarDateOnly } from "@/lib/date-format";
import { hasMinRole } from "@/lib/roles";
import {
  CONTACTS_SEARCH_FRESH_KEY,
  markSearchFreshIntent,
  REQUESTS_SEARCH_FRESH_KEY,
} from "@/lib/search-session-state";

type SContact = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  municipality: string | null;
  contact_code?: string | null;
  group_names?: string[];
  matchReasons?: string[];
  aiMatch?: boolean;
};
type SRequest = {
  id: string;
  request_code: string | null;
  title: string;
  status: string | null;
  snippet?: string | null;
  requester_name?: string | null;
};
type STask = { id: string; title: string; due_date: string | null; completed: boolean | null };
type SCampaign = { id: string; name: string; status: string | null };

const RECENT_KEY = "crm-global-search-recent";
const MAX_RECENT = 5;

const overlay =
  "fixed inset-0 z-[400] flex flex-col items-center bg-black/80 backdrop-blur-sm pt-[min(18vh,100px)] px-4";
const inputBox =
  "h-[56px] w-full max-w-3xl rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-5 pr-12 text-lg text-[var(--text-primary)] shadow-2xl outline-none focus:ring-2 focus:ring-[#C9A84C]/40";
const sectionTitle =
  "mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[#C9A84C]/90";
const searchResultItemBase =
  "rounded-lg px-2 py-2.5 text-left text-sm transition-colors data-[active=true]:bg-[var(--search-result-active-bg)] data-[active=true]:ring-1 data-[active=true]:ring-[var(--accent-gold)]/35 hover:bg-[var(--search-result-hover-bg)]";

function searchResultItemClass(isActive: boolean, extra = "") {
  return [searchResultItemBase, extra].filter(Boolean).join(" ");
}

function searchResultItemProps(isActive: boolean) {
  return {
    "data-global-search-item": true,
    "data-active": isActive ? "true" : "false",
    "aria-selected": isActive,
  } as const;
}

type Entry = { k: "c" | "r" | "t" | "ca"; id: string; href: string; title: string; sub: string };

type Props = { open: boolean; onClose: () => void; role: string };

function av(fn: string, ln: string) {
  return `${(fn[0] ?? "?").toUpperCase()}${(ln[0] ?? "?").toUpperCase()}`;
}

function loadRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function persistRecentSearch(query: string): string[] {
  const q = query.trim();
  if (q.length < 1) return loadRecentSearches();
  try {
    const prev = loadRecentSearches().filter((x) => x !== q);
    const next = [q, ...prev].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    return next;
  } catch {
    return loadRecentSearches();
  }
}

export function GlobalSearchOverlay({ open, onClose, role }: Props) {
  const router = useRouter();
  const canSearch = hasMinRole(role, "caller");
  const [q, setQ] = useState("");
  const [deb, setDeb] = useState("");
  const [loading, setLoading] = useState(false);
  const [c, setC] = useState<SContact[]>([]);
  const [r, setR] = useState<SRequest[]>([]);
  const [t, setT] = useState<STask[]>([]);
  const [ca, setCa] = useState<SCampaign[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [active, setActive] = useState(0);

  const entries: Entry[] = useMemo(() => {
    const out: Entry[] = [];
    for (const x of c) {
      out.push({
        k: "c",
        id: x.id,
        href: `/contacts/${x.id}`,
        title: `${x.first_name} ${x.last_name}`.trim(),
        sub: [x.phone, x.municipality].filter(Boolean).join(" · ") || "—",
      });
    }
    for (const x of r) {
      out.push({
        k: "r",
        id: x.id,
        href: `/requests/${x.id}`,
        title: (x.request_code != null ? `#${x.request_code} ` : "") + x.title,
        sub: x.snippet || x.status || "—",
      });
    }
    for (const x of t) {
      out.push({
        k: "t",
        id: x.id,
        href: `/tasks`,
        title: x.title,
        sub: x.due_date ? formatCalendarDateOnly(x.due_date) : "—",
      });
    }
    for (const x of ca) {
      out.push({ k: "ca", id: x.id, href: `/campaigns/${x.id}`, title: x.name, sub: x.status ?? "—" });
    }
    return out;
  }, [c, r, t, ca]);
  const total = entries.length;

  useEffect(() => {
    const id = window.setTimeout(() => setDeb(q), 150);
    return () => clearTimeout(id);
  }, [q]);

  const load = useCallback(
    async (query: string) => {
      if (!canSearch) return;
      abortRef.current?.abort();
      if (query.length < 1) {
        setC([]);
        setR([]);
        setT([]);
        setCa([]);
        setLoading(false);
        return;
      }
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      try {
        const res = await fetchWithTimeout(`/api/search?q=${encodeURIComponent(query)}`, {
          credentials: "same-origin",
          timeoutMs: CLIENT_FETCH_TIMEOUT_MS,
          signal: ctrl.signal,
        });
        if (ctrl.signal.aborted) return;
        if (!res.ok) {
          return;
        }
        const d = (await res.json()) as {
          contacts?: SContact[];
          requests?: SRequest[];
          tasks?: STask[];
          campaigns?: SCampaign[];
        };
        if (ctrl.signal.aborted) return;
        setC(d.contacts ?? []);
        setR(d.requests ?? []);
        setT(d.tasks ?? []);
        setCa(d.campaigns ?? []);
        setRecent(persistRecentSearch(query));
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        // ignore
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    },
    [canSearch],
  );

  useEffect(() => {
    if (open) {
      void load(deb);
    }
  }, [deb, open, load]);

  useEffect(() => {
    if (open) {
      setQ("");
      setDeb("");
      setC([]);
      setR([]);
      setT([]);
      setCa([]);
      setActive(0);
      setRecent(loadRecentSearches());
      window.setTimeout(() => inputRef.current?.focus(), 50);
    }
    return () => {
      abortRef.current?.abort();
    };
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [entries.length, deb]);

  const clearRecent = useCallback(() => {
    try {
      localStorage.removeItem(RECENT_KEY);
    } catch {
      // ignore
    }
    setRecent([]);
  }, []);

  const go = useCallback(
    (e: Entry) => {
      if (e.k === "t" && e.id) {
        try {
          if (typeof window !== "undefined") {
            sessionStorage.setItem("crm-task-open", e.id);
          }
        } catch {
          // ignore
        }
        router.push("/tasks");
        onClose();
        return;
      }
      if (e.k === "t") {
        router.push("/tasks");
      } else {
        router.push(e.href);
      }
      onClose();
    },
    [onClose, router],
  );

  useEffect(() => {
    if (!open) return;
    const onK = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown" && total > 0) {
        e.preventDefault();
        setActive((a) => (a + 1) % total);
        return;
      }
      if (e.key === "ArrowUp" && total > 0) {
        e.preventDefault();
        setActive((a) => (a - 1 + total) % total);
        return;
      }
      if (e.key === "Enter" && total > 0) {
        e.preventDefault();
        const p = entries[active];
        if (p) go(p);
      }
    };
    window.addEventListener("keydown", onK, true);
    return () => window.removeEventListener("keydown", onK, true);
  }, [open, onClose, total, active, entries, go]);

  if (!open) {
    return null;
  }
  if (!canSearch) {
    return (
      <div className={overlay} role="dialog" aria-label="Αναζήτηση" onMouseDown={() => onClose()}>
        <div className="w-full max-w-2xl rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6" onMouseDown={(e) => e.stopPropagation()}>
          <p className="text-sm text-[var(--text-secondary)]">Η καθολική αναζήτηση απαιτεί σύνδεση στο CRM.</p>
          <button type="button" onClick={onClose} className="mt-4 text-sm text-[#C9A84C] underline">
            Κλείσιμο
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={overlay} role="dialog" aria-modal aria-label="Αναζήτηση" onMouseDown={() => onClose()}>
      <div className="w-full max-w-3xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="relative">
          <input
            ref={inputRef}
            className={inputBox}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Αναζήτηση επαφών, αιτημάτων, εργασιών, καμπανιών…"
            aria-label="Καθολική αναζήτηση"
            autoComplete="off"
            spellCheck={false}
          />
          <Search className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden />
          <button type="button" className="absolute right-12 top-1/2 -translate-y-1/2 p-1 text-[var(--text-muted)]" onClick={onClose} aria-label="Κλείσιμο">
            <X className="h-5 w-5" />
          </button>
        </div>
        {loading && <p className="mt-2 text-center text-sm text-[var(--text-muted)]">Φόρτωση…</p>}

        <div
          data-global-search-results
          className="mt-4 max-h-[min(62dvh,480px)] space-y-5 overflow-y-auto rounded-xl border border-[var(--border)]/60 bg-[var(--bg-card)] p-4 text-left shadow-xl"
        >
          {deb.length < 1 && recent.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className={sectionTitle}>Πρόσφατες αναζητήσεις</p>
                <button
                  type="button"
                  onClick={clearRecent}
                  className="shrink-0 text-[11px] text-[var(--text-muted)] transition hover:text-[var(--text-secondary)]"
                >
                  Καθαρισμός
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {recent.map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => setQ(term)}
                    className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)]/80 px-3 py-1.5 text-xs text-[var(--text-primary)] transition hover:border-[#C9A84C]/40 hover:bg-[#C9A84C]/10"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          )}

          {deb.length >= 1 && total === 0 && !loading && (
            <div className="px-1 py-4 text-center">
              <p className="text-sm text-[var(--text-secondary)]">Δεν βρέθηκαν αποτελέσματα για «{deb}».</p>
              <p className="mt-2 text-xs text-[var(--text-muted)]">Δοκιμάστε μικρότερη ή πιο συγκεκριμένη αναζήτηση.</p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-sm">
                <Link
                  href="/contacts/search"
                  onClick={() => {
                    markSearchFreshIntent(CONTACTS_SEARCH_FRESH_KEY);
                    onClose();
                  }}
                  className="text-[#C9A84C] underline underline-offset-2"
                >
                  Αναζήτηση επαφών
                </Link>
                <Link
                  href="/requests/search"
                  onClick={() => {
                    markSearchFreshIntent(REQUESTS_SEARCH_FRESH_KEY);
                    onClose();
                  }}
                  className="text-[#C9A84C] underline underline-offset-2"
                >
                  Αναζήτηση αιτημάτων
                </Link>
              </div>
            </div>
          )}

          {c.length > 0 && (
            <div>
              <p className={sectionTitle}>Επαφές</p>
              {c.map((g) => {
                const e = entries.find((x) => x.k === "c" && x.id === g.id);
                if (!e) return null;
                const idx = entries.findIndex((x) => x === e);
                const matchBadge = g.matchReasons?.[0];
                const groupChips = (g.group_names ?? []).slice(0, 2);
                return (
                  <div key={g.id} className="mb-2">
                    <button
                      type="button"
                      onClick={() => go(e)}
                      className={searchResultItemClass(idx === active, "flex w-full items-start gap-3")}
                      {...searchResultItemProps(idx === active)}
                      onMouseEnter={() => setActive(idx)}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#003476]/25 text-xs font-bold text-[var(--text-primary)]">
                        {av(g.first_name, g.last_name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-bold">{e.title}</span>
                          {g.contact_code ? (
                            <span className="text-xs font-normal text-[var(--text-muted)]">{g.contact_code}</span>
                          ) : null}
                          {g.aiMatch ? (
                            <span className="inline-flex items-center gap-0.5 rounded-full border border-[#C9A84C]/40 bg-[#C9A84C]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#C9A84C]">
                              <Sparkles className="h-3 w-3" aria-hidden />
                              AI
                            </span>
                          ) : null}
                          {matchBadge ? (
                            <span className="inline-flex max-w-[min(100%,220px)] truncate rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                              {matchBadge}
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                          {[g.phone, g.municipality].filter(Boolean).join(" · ") || "—"}
                        </span>
                        {groupChips.length > 0 ? (
                          <span className="mt-1.5 flex flex-wrap gap-1">
                            {groupChips.map((name) => (
                              <span
                                key={name}
                                className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)]/70 px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]"
                              >
                                {name}
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {r.length > 0 && (
            <div>
              <p className={sectionTitle}>Αιτήματα</p>
              {r.map((req) => {
                const e = entries.find((x) => x.k === "r" && x.id === req.id);
                if (!e) return null;
                const idx = entries.findIndex((x) => x === e);
                return (
                  <button
                    type="button"
                    key={req.id}
                    onClick={() => go(e)}
                    className={searchResultItemClass(idx === active, "mb-1 w-full")}
                    {...searchResultItemProps(idx === active)}
                    onMouseEnter={() => setActive(idx)}
                  >
                    <span className="font-medium">{e.title}</span>
                    {req.requester_name ? (
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">Αιτών: {req.requester_name}</p>
                    ) : null}
                    {req.snippet ? <p className="mt-0.5 line-clamp-2 text-xs text-[var(--text-muted)]">{req.snippet}</p> : null}
                  </button>
                );
              })}
            </div>
          )}

          {t.length > 0 && (
            <div>
              <p className={sectionTitle}>Εργασίες</p>
              {t.map((task) => {
                const e = entries.find((x) => x.k === "t" && x.id === task.id);
                if (!e) return null;
                const idx = entries.findIndex((x) => x === e);
                return (
                  <button
                    type="button"
                    key={task.id}
                    onClick={() => go(e)}
                    className={searchResultItemClass(idx === active, "mb-1 w-full")}
                    {...searchResultItemProps(idx === active)}
                    onMouseEnter={() => setActive(idx)}
                  >
                    {e.title} <span className="ml-1 text-xs text-[var(--text-muted)]">{e.sub}</span>
                  </button>
                );
              })}
            </div>
          )}

          {ca.length > 0 && (
            <div>
              <p className={sectionTitle}>Καμπάνιες</p>
              {ca.map((camp) => {
                const e = entries.find((x) => x.k === "ca" && x.id === camp.id);
                if (!e) return null;
                const idx = entries.findIndex((x) => x === e);
                return (
                  <Link
                    key={camp.id}
                    href={e.href}
                    onClick={onClose}
                    className={searchResultItemClass(idx === active, "mb-1 block w-full")}
                    {...searchResultItemProps(idx === active)}
                    onMouseEnter={() => setActive(idx)}
                  >
                    {e.title} <span className="ml-1 text-xs text-[var(--text-muted)]">{e.sub}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
        <p className="mt-2 text-center text-xs text-[var(--text-muted)]/80">↑↓ · Enter · Esc</p>
      </div>
    </div>
  );
}
