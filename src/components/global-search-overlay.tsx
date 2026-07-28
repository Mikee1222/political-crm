"use client";

import Link from "next/link";
import {
  Clock,
  FileText,
  HelpCircle,
  Inbox,
  Loader2,
  Search,
  SearchX,
  Sparkles,
  Stethoscope,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { fetchWithTimeout, CLIENT_FETCH_TIMEOUT_MS } from "@/lib/client-fetch";
import { formatCalendarDateOnly } from "@/lib/date-format";
import { extractPhoneSearchDigits } from "@/lib/phone-search";
import { RequestStatusBadge } from "@/components/requests/request-status-badge";
import { hasMinRole } from "@/lib/roles";
import {
  CONTACTS_SEARCH_FRESH_KEY,
  markSearchFreshIntent,
  REQUESTS_SEARCH_FRESH_KEY,
  saveContactsSearchNav,
  saveRequestsSearchNav,
} from "@/lib/search-session-state";

type SContact = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  municipality: string | null;
  contact_code?: string | null;
  political_stance?: string | null;
  call_status?: string | null;
  group_names?: string[];
  matchReasons?: string[];
  aiMatch?: boolean;
};
type SRequest = {
  id: string;
  request_code: string | null;
  title: string;
  status: string | null;
  category?: string | null;
  created_at?: string | null;
  snippet?: string | null;
  requester_name?: string | null;
};
type STask = { id: string; title: string; due_date: string | null; completed: boolean | null };
type SCampaign = { id: string; name: string; status: string | null };

type SearchPayload = {
  contacts: SContact[];
  requests: SRequest[];
  tasks: STask[];
  campaigns: SCampaign[];
};

type RecentEntry = {
  query: string;
  contactId?: string;
  contactName?: string;
  initials?: string;
};

type Entry =
  | { k: "c"; id: string; href: string }
  | { k: "r"; id: string; href: string }
  | { k: "t"; id: string; href: string }
  | { k: "ca"; id: string; href: string }
  | { k: "ac"; id: string; href: string }
  | { k: "ar"; id: string; href: string };

const RECENT_KEY = "crm-global-search-recent";
const MAX_RECENT = 5;
const MIN_QUERY_CHARS = 2;
const DEBOUNCE_MS = 150;
const CACHE_TTL_MS = 30_000;

const PLACEHOLDERS = [
  "Αναζήτηση επαφών...",
  "Αναζήτηση αιτημάτων...",
  "Αναζήτηση με τηλέφωνο...",
] as const;

const AVATAR_LETTER_COLORS = [
  "#003476",
  "#1e5fa8",
  "#8b6914",
  "#C9A84C",
  "#0d9488",
  "#7c3aed",
  "#be185d",
  "#b45309",
  "#0369a1",
  "#15803d",
] as const;

type Props = { open: boolean; onClose: () => void; role: string };

type CacheEntry = { at: number; data: SearchPayload };
const queryCache = new Map<string, CacheEntry>();

function cacheKey(query: string) {
  return query.trim().toLowerCase();
}

function getCached(query: string): SearchPayload | null {
  const hit = queryCache.get(cacheKey(query));
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    queryCache.delete(cacheKey(query));
    return null;
  }
  return hit.data;
}

function setCached(query: string, data: SearchPayload) {
  queryCache.set(cacheKey(query), { at: Date.now(), data });
}

function av(fn: string, ln: string) {
  return `${(fn[0] ?? "?").toUpperCase()}${(ln[0] ?? "?").toUpperCase()}`;
}

function avatarStyleByLetter(first: string): CSSProperties {
  const ch = (first[0] ?? "?").toUpperCase();
  const idx = (ch.charCodeAt(0) || 63) % AVATAR_LETTER_COLORS.length;
  const bg = AVATAR_LETTER_COLORS[idx]!;
  return {
    background: `linear-gradient(145deg, color-mix(in srgb, ${bg} 78%, white), ${bg})`,
    color: "#fff",
  };
}

function loadRecentSearches(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: RecentEntry[] = [];
    for (const item of parsed) {
      if (typeof item === "string" && item.trim()) {
        out.push({ query: item.trim() });
      } else if (item && typeof item === "object" && typeof (item as RecentEntry).query === "string") {
        const e = item as RecentEntry;
        const q = e.query.trim();
        if (!q) continue;
        out.push({
          query: q,
          contactId: typeof e.contactId === "string" ? e.contactId : undefined,
          contactName: typeof e.contactName === "string" ? e.contactName : undefined,
          initials: typeof e.initials === "string" ? e.initials : undefined,
        });
      }
    }
    return out.slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function persistRecentSearch(entry: RecentEntry): RecentEntry[] {
  const q = entry.query.trim();
  if (q.length < 1) return loadRecentSearches();
  try {
    const prev = loadRecentSearches().filter((x) => x.query.toLowerCase() !== q.toLowerCase());
    const next = [{ ...entry, query: q }, ...prev].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    return next;
  } catch {
    return loadRecentSearches();
  }
}

function highlightPhoneDigits(phone: string | null, query: string): ReactNode {
  if (!phone) return "—";
  const digits = extractPhoneSearchDigits(query);
  if (digits.length < 2) return phone;

  const phoneDigits = extractPhoneSearchDigits(phone);
  const matchAt = phoneDigits.indexOf(digits);
  if (matchAt < 0) return phone;

  let digitIdx = 0;
  let matchStart = -1;
  let matchEnd = -1;
  for (let i = 0; i < phone.length; i++) {
    if (/\d/.test(phone[i]!)) {
      if (digitIdx === matchAt) matchStart = i;
      if (digitIdx === matchAt + digits.length - 1) {
        matchEnd = i + 1;
        break;
      }
      digitIdx += 1;
    }
  }
  if (matchStart < 0 || matchEnd < 0) return phone;
  return (
    <>
      {phone.slice(0, matchStart)}
      <strong className="font-bold text-[var(--text-primary)]">{phone.slice(matchStart, matchEnd)}</strong>
      {phone.slice(matchEnd)}
    </>
  );
}

function stanceBadge(stance: string | null | undefined, callStatus: string | null | undefined) {
  const raw = (stance ?? "").trim();
  const call = (callStatus ?? "").trim();
  const labelSource = raw || call;
  if (!labelSource) return null;

  const lower = labelSource.toLowerCase();
  const isPositive =
    call === "Positive" ||
    lower.includes("θετικ") ||
    lower.includes("positive");
  const isNegative =
    call === "Negative" ||
    lower.includes("αρνητικ") ||
    lower.includes("negative");

  let label = raw;
  if (!label) {
    if (call === "Positive") label = "Θετικός";
    else if (call === "Negative") label = "Αρνητικός";
    else return null;
  } else if (raw.toLowerCase().includes("θετικ")) {
    label = "Θετικός";
  } else if (raw.toLowerCase().includes("αρνητικ")) {
    label = "Αρνητικός";
  }

  if (isPositive) {
    return (
      <span className="inline-flex rounded-md border border-emerald-500/35 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
        {label}
      </span>
    );
  }
  if (isNegative) {
    return (
      <span className="inline-flex rounded-md border border-rose-500/35 bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:text-rose-300">
        {label}
      </span>
    );
  }
  if (!raw) return null;
  return (
    <span className="inline-flex rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
      {raw}
    </span>
  );
}

function requestCategoryIcon(cat: string | null | undefined): LucideIcon {
  const c = (cat || "").toLowerCase();
  if (c.includes("υγεία")) return Stethoscope;
  if (c.includes("εκπαίδευ")) return FileText;
  if (c.includes("δημόσια") || c.includes("υπηρεσ")) return Wrench;
  if (c.includes("άλλο")) return HelpCircle;
  return Inbox;
}

function contactsSearchHref(query: string) {
  const p = new URLSearchParams();
  p.set("search", query);
  p.set("ran", "1");
  return `/contacts/search?${p.toString()}`;
}

function requestsSearchHref(query: string) {
  const p = new URLSearchParams();
  p.set("search", query);
  p.set("ran", "1");
  return `/requests/search?${p.toString()}`;
}

function sectionHeader(label: string) {
  return (
    <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[#C9A84C]">{label}</p>
  );
}

function resultItemClass(isActive: boolean, extra = "") {
  return [
    "w-full rounded-lg px-3 py-2.5 text-left text-sm transition-colors duration-150",
    "border-l-2 border-transparent",
    isActive
      ? "border-l-[#C9A84C] bg-[rgba(201,168,76,0.14)]"
      : "hover:bg-[rgba(201,168,76,0.08)]",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
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
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [inputFocused, setInputFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [active, setActive] = useState(0);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  const trimmed = q.trim();
  const debTrimmed = deb.trim();
  const hasQuery = debTrimmed.length >= MIN_QUERY_CHARS;

  const actionEntries: Entry[] = useMemo(() => {
    if (!hasQuery) return [];
    return [
      { k: "ac", id: "action-contacts", href: contactsSearchHref(debTrimmed) },
      { k: "ar", id: "action-requests", href: requestsSearchHref(debTrimmed) },
    ];
  }, [hasQuery, debTrimmed]);

  const entries: Entry[] = useMemo(() => {
    const out: Entry[] = [];
    for (const x of c) {
      out.push({ k: "c", id: x.id, href: `/contacts/${x.id}` });
    }
    for (const x of r) {
      out.push({ k: "r", id: x.id, href: `/requests/${x.id}` });
    }
    for (const x of t) {
      out.push({ k: "t", id: x.id, href: `/tasks` });
    }
    for (const x of ca) {
      out.push({ k: "ca", id: x.id, href: `/campaigns/${x.id}` });
    }
    out.push(...actionEntries);
    return out;
  }, [c, r, t, ca, actionEntries]);

  const total = entries.length;
  const resultCount = c.length + r.length + t.length + ca.length;

  const sectionStarts = useMemo(() => {
    const starts: number[] = [];
    let i = 0;
    if (c.length) {
      starts.push(i);
      i += c.length;
    }
    if (r.length) {
      starts.push(i);
      i += r.length;
    }
    if (t.length) {
      starts.push(i);
      i += t.length;
    }
    if (ca.length) {
      starts.push(i);
      i += ca.length;
    }
    if (actionEntries.length) {
      starts.push(i);
    }
    return starts;
  }, [c.length, r.length, t.length, ca.length, actionEntries.length]);

  useEffect(() => {
    const id = window.setTimeout(() => setDeb(q), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [q]);

  useEffect(() => {
    if (!open || trimmed.length > 0) return;
    const id = window.setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % PLACEHOLDERS.length);
    }, 2000);
    return () => clearInterval(id);
  }, [open, trimmed.length]);

  const load = useCallback(
    async (query: string) => {
      if (!canSearch) return;
      abortRef.current?.abort();
      const qTrim = query.trim();
      if (qTrim.length < MIN_QUERY_CHARS) {
        setC([]);
        setR([]);
        setT([]);
        setCa([]);
        setLoading(false);
        return;
      }

      const cached = getCached(qTrim);
      if (cached) {
        setC(cached.contacts);
        setR(cached.requests);
        setT(cached.tasks);
        setCa(cached.campaigns);
        setLoading(false);
        const top = cached.contacts[0];
        setRecent(
          persistRecentSearch({
            query: qTrim,
            contactId: top?.id,
            contactName: top ? `${top.first_name} ${top.last_name}`.trim() : undefined,
            initials: top ? av(top.first_name, top.last_name) : undefined,
          }),
        );
        return;
      }

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      try {
        // Single endpoint; server runs contacts + requests (+ notes/tasks/campaigns) via Promise.all.
        const res = await fetchWithTimeout(`/api/search?q=${encodeURIComponent(qTrim)}`, {
          credentials: "same-origin",
          timeoutMs: CLIENT_FETCH_TIMEOUT_MS,
          signal: ctrl.signal,
        });
        if (ctrl.signal.aborted) return;
        if (!res.ok) return;
        const d = (await res.json()) as {
          contacts?: SContact[];
          requests?: SRequest[];
          tasks?: STask[];
          campaigns?: SCampaign[];
        };
        if (ctrl.signal.aborted) return;
        const payload: SearchPayload = {
          contacts: d.contacts ?? [],
          requests: d.requests ?? [],
          tasks: d.tasks ?? [],
          campaigns: d.campaigns ?? [],
        };
        setCached(qTrim, payload);
        setC(payload.contacts);
        setR(payload.requests);
        setT(payload.tasks);
        setCa(payload.campaigns);
        const top = payload.contacts[0];
        setRecent(
          persistRecentSearch({
            query: qTrim,
            contactId: top?.id,
            contactName: top ? `${top.first_name} ${top.last_name}`.trim() : undefined,
            initials: top ? av(top.first_name, top.last_name) : undefined,
          }),
        );
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
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
      setPlaceholderIdx(0);
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

  useEffect(() => {
    if (!open || total === 0) return;
    const root = resultsRef.current;
    if (!root) return;
    const el = root.querySelector<HTMLElement>(`[data-global-search-item][data-active="true"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open, total]);

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
      if (e.k === "ac" || e.k === "ar") {
        if (e.k === "ac") markSearchFreshIntent(CONTACTS_SEARCH_FRESH_KEY);
        else markSearchFreshIntent(REQUESTS_SEARCH_FRESH_KEY);
        router.push(e.href);
        onClose();
        return;
      }
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
      if (e.k === "c") {
        const labels: Record<string, string> = {};
        for (const x of c) {
          labels[x.id] = `${x.first_name} ${x.last_name}`.trim();
        }
        saveContactsSearchNav(
          c.map((x) => x.id),
          { labels, total: c.length },
        );
        router.push(`/contacts/${e.id}?from=search`);
        onClose();
        return;
      }
      if (e.k === "r") {
        const labels: Record<string, string> = {};
        for (const x of r) {
          labels[x.id] = x.title;
        }
        saveRequestsSearchNav(
          r.map((x) => x.id),
          { labels, total: r.length },
        );
        router.push(`/requests/${e.id}?from=search`);
        onClose();
        return;
      }
      router.push(e.href);
      onClose();
    },
    [c, r, onClose, router],
  );

  useEffect(() => {
    if (!open) return;
    const onK = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab" && sectionStarts.length > 1) {
        e.preventDefault();
        const dir = e.shiftKey ? -1 : 1;
        const curSection = sectionStarts.findIndex((s, idx) => {
          const next = sectionStarts[idx + 1] ?? total;
          return active >= s && active < next;
        });
        const nextIdx = (Math.max(0, curSection) + dir + sectionStarts.length) % sectionStarts.length;
        setActive(sectionStarts[nextIdx] ?? 0);
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
  }, [open, onClose, total, active, entries, go, sectionStarts]);

  if (!open) {
    return null;
  }

  if (!canSearch) {
    return (
      <div
        className="fixed inset-0 z-[400] flex items-start justify-center bg-black/40 backdrop-blur-[8px] px-4 pt-[min(14vh,96px)]"
        role="dialog"
        aria-label="Αναζήτηση"
        onMouseDown={() => onClose()}
      >
        <div
          className="w-full max-w-[680px] rounded-2xl border border-[var(--border)] bg-white p-6 shadow-2xl [data-theme='dark']:bg-[var(--bg-card)]"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <p className="text-sm text-[var(--text-secondary)]">Η καθολική αναζήτηση απαιτεί σύνδεση στο CRM.</p>
          <button type="button" onClick={onClose} className="mt-4 text-sm text-[#C9A84C] underline">
            Κλείσιμο
          </button>
        </div>
      </div>
    );
  }

  const showEmptyRecent = !hasQuery && !loading;
  const showNoResults = hasQuery && resultCount === 0 && !loading;
  const phoneMatchReason = (g: SContact) =>
    (g.matchReasons ?? []).find((m) => m.startsWith("Πεδίο «phone") || m === "Πεδίο «phone»" || m.includes("Πεδίο «phone"));

  return (
    <div
      className="fixed inset-0 z-[400] flex items-start justify-center bg-black/40 backdrop-blur-[8px] px-4 pt-[min(14vh,96px)]"
      role="dialog"
      aria-modal
      aria-label="Αναζήτηση"
      onMouseDown={() => onClose()}
    >
      <div
        className="global-search-modal w-full max-w-[680px] overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-2xl [data-theme='dark']:bg-[var(--bg-card)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="relative border-b border-[var(--border)]/70 p-3 sm:p-4">
          <div
            className={[
              "relative flex min-h-[56px] items-center gap-3 rounded-xl border bg-[var(--bg-elevated)] px-4 transition-[border-color,box-shadow] duration-150",
              inputFocused
                ? "border-[#C9A84C] shadow-[0_0_0_3px_rgba(201,168,76,0.28)]"
                : "border-[var(--border)]",
            ].join(" ")}
          >
            {loading ? (
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[#C9A84C]" aria-hidden />
            ) : (
              <Search className="h-5 w-5 shrink-0 text-[var(--text-muted)]" aria-hidden />
            )}
            <input
              ref={inputRef}
              className="min-h-[52px] w-full flex-1 bg-transparent text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] sm:text-lg"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder={PLACEHOLDERS[placeholderIdx]}
              aria-label="Καθολική αναζήτηση"
              autoComplete="off"
              spellCheck={false}
            />
            {trimmed.length > 0 ? (
              <button
                type="button"
                className="rounded-md p-1.5 text-[var(--text-muted)] transition hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]"
                onClick={() => {
                  setQ("");
                  inputRef.current?.focus();
                }}
                aria-label="Καθαρισμός"
              >
                <X className="h-5 w-5" />
              </button>
            ) : null}
          </div>
        </div>

        <div
          ref={resultsRef}
          data-global-search-results
          role="listbox"
          aria-label="Αποτελέσματα αναζήτησης"
          className="max-h-[70vh] space-y-5 overflow-y-auto px-3 py-4 text-left sm:px-4"
        >
          {showEmptyRecent && recent.length > 0 ? (
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                {sectionHeader("ΠΡΟΣΦΑΤΕΣ ΑΝΑΖΗΤΗΣΕΙΣ")}
                <button
                  type="button"
                  onClick={clearRecent}
                  className="shrink-0 text-[11px] font-medium text-[var(--text-muted)] transition hover:text-[var(--text-secondary)]"
                >
                  Καθαρισμός
                </button>
              </div>
              <ul className="space-y-1">
                {recent.map((term) => (
                  <li key={term.query}>
                    <button
                      type="button"
                      onClick={() => setQ(term.query)}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition hover:bg-[rgba(201,168,76,0.08)]"
                    >
                      {term.contactName && term.initials ? (
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                          style={avatarStyleByLetter(term.contactName)}
                        >
                          {term.initials}
                        </span>
                      ) : (
                        <Clock className="h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
                      )}
                      <span className="min-w-0 truncate text-[var(--text-primary)]">
                        {term.contactName || term.query}
                      </span>
                      {term.contactName ? (
                        <span className="ml-auto shrink-0 text-[11px] text-[var(--text-muted)]">{term.query}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {showEmptyRecent && recent.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--text-muted)]">
              Πληκτρολογήστε τουλάχιστον {MIN_QUERY_CHARS} χαρακτήρες για αναζήτηση.
            </p>
          ) : null}

          {trimmed.length > 0 && trimmed.length < MIN_QUERY_CHARS && !loading ? (
            <p className="py-6 text-center text-sm text-[var(--text-muted)]">
              Συνεχίστε να πληκτρολογείτε… (ελάχιστο {MIN_QUERY_CHARS} χαρακτήρες)
            </p>
          ) : null}

          {showNoResults ? (
            <div className="flex flex-col items-center px-2 py-10 text-center">
              <SearchX className="mb-3 h-10 w-10 text-[var(--text-muted)]" aria-hidden />
              <p className="text-sm font-medium text-[var(--text-secondary)]">
                Δεν βρέθηκαν αποτελέσματα για «{debTrimmed}»
              </p>
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                Δοκιμάστε να αναζητήσετε με τηλέφωνο ή πατρώνυμο
              </p>
            </div>
          ) : null}

          {c.length > 0 ? (
            <div>
              {sectionHeader("ΕΠΑΦΕΣ")}
              <div className="space-y-1">
                {c.map((g, ci) => {
                  const idx = ci;
                  const e = entries[idx];
                  if (!e) return null;
                  const isActive = idx === active;
                  const groupChips = (g.group_names ?? []).slice(0, 2);
                  const phoneReason = phoneMatchReason(g);
                  return (
                    <button
                      type="button"
                      key={g.id}
                      role="option"
                      onClick={() => go(e)}
                      className={resultItemClass(isActive, "flex items-start gap-3")}
                      data-global-search-item
                      data-active={isActive ? "true" : "false"}
                      aria-selected={isActive}
                      onMouseEnter={() => setActive(idx)}
                    >
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold shadow-sm"
                        style={avatarStyleByLetter(g.first_name)}
                      >
                        {av(g.first_name, g.last_name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-[var(--text-primary)]">
                            {g.first_name} {g.last_name}
                          </span>
                          {g.contact_code ? (
                            <span className="font-mono text-xs font-normal text-[var(--text-muted)]">
                              {g.contact_code}
                            </span>
                          ) : null}
                          {stanceBadge(g.political_stance, g.call_status)}
                          {g.aiMatch ? (
                            <span className="inline-flex items-center gap-0.5 rounded-full border border-[#C9A84C]/40 bg-[#C9A84C]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#C9A84C]">
                              <Sparkles className="h-3 w-3" aria-hidden />
                              AI
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block font-mono text-xs text-[var(--text-muted)]">
                          {highlightPhoneDigits(g.phone, debTrimmed)}
                          {g.municipality ? (
                            <span className="font-sans"> · {g.municipality}</span>
                          ) : null}
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
                        {phoneReason ? (
                          <span className="mt-1 inline-flex rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                            {phoneReason}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {r.length > 0 ? (
            <div>
              {sectionHeader("ΑΙΤΗΜΑΤΑ")}
              <div className="space-y-1">
                {r.map((req, ri) => {
                  const idx = c.length + ri;
                  const e = entries[idx];
                  if (!e) return null;
                  const isActive = idx === active;
                  const Icon = requestCategoryIcon(req.category);
                  return (
                    <button
                      type="button"
                      key={req.id}
                      role="option"
                      onClick={() => go(e)}
                      className={resultItemClass(isActive, "flex items-start gap-3")}
                      data-global-search-item
                      data-active={isActive ? "true" : "false"}
                      aria-selected={isActive}
                      onMouseEnter={() => setActive(idx)}
                    >
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[rgba(201,168,76,0.12)] text-[#C9A84C]">
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-3">
                          <span className="min-w-0">
                            <span className="block truncate font-bold text-[var(--text-primary)]">
                              {req.request_code ? `#${req.request_code} ` : null}
                              {req.title}
                            </span>
                            {req.requester_name ? (
                              <span className="mt-0.5 block truncate text-xs text-[var(--text-muted)]">
                                {req.requester_name}
                              </span>
                            ) : null}
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-1">
                            {req.status ? <RequestStatusBadge status={req.status} size="xs" /> : null}
                            {req.created_at ? (
                              <span className="text-[10px] text-[var(--text-muted)]">
                                {formatCalendarDateOnly(req.created_at)}
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {t.length > 0 ? (
            <div>
              {sectionHeader("ΕΡΓΑΣΙΕΣ")}
              {t.map((task, ti) => {
                const idx = c.length + r.length + ti;
                const e = entries[idx];
                if (!e) return null;
                const isActive = idx === active;
                return (
                  <button
                    type="button"
                    key={task.id}
                    role="option"
                    onClick={() => go(e)}
                    className={resultItemClass(isActive, "mb-1")}
                    data-global-search-item
                    data-active={isActive ? "true" : "false"}
                    aria-selected={isActive}
                    onMouseEnter={() => setActive(idx)}
                  >
                    {task.title}{" "}
                    <span className="ml-1 text-xs text-[var(--text-muted)]">
                      {task.due_date ? formatCalendarDateOnly(task.due_date) : "—"}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {ca.length > 0 ? (
            <div>
              {sectionHeader("ΚΑΜΠΑΝΙΕΣ")}
              {ca.map((camp, cai) => {
                const idx = c.length + r.length + t.length + cai;
                const e = entries[idx];
                if (!e) return null;
                const isActive = idx === active;
                return (
                  <Link
                    key={camp.id}
                    href={e.href}
                    role="option"
                    onClick={onClose}
                    className={resultItemClass(isActive, "mb-1 block")}
                    data-global-search-item
                    data-active={isActive ? "true" : "false"}
                    aria-selected={isActive}
                    onMouseEnter={() => setActive(idx)}
                  >
                    {camp.name}{" "}
                    <span className="ml-1 text-xs text-[var(--text-muted)]">{camp.status ?? "—"}</span>
                  </Link>
                );
              })}
            </div>
          ) : null}

          {hasQuery ? (
            <div>
              {sectionHeader("ΕΝΑΡΞΗ ΑΝΑΖΗΤΗΣΗΣ")}
              <div className="space-y-1">
                {actionEntries.map((ae, ai) => {
                  const idx = c.length + r.length + t.length + ca.length + ai;
                  const isActive = idx === active;
                  const label =
                    ae.k === "ac"
                      ? `Αναζήτηση επαφών για «${debTrimmed}» →`
                      : `Αναζήτηση αιτημάτων για «${debTrimmed}» →`;
                  return (
                    <button
                      type="button"
                      key={ae.id}
                      role="option"
                      onClick={() => go(ae)}
                      className={resultItemClass(isActive, "font-medium text-[#C9A84C]")}
                      data-global-search-item
                      data-active={isActive ? "true" : "false"}
                      aria-selected={isActive}
                      onMouseEnter={() => setActive(idx)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        <div className="border-t border-[var(--border)]/70 px-4 py-2.5">
          <p className="text-center text-[11px] text-[var(--text-muted)]">
            ↑↓ πλοήγηση · Enter επιλογή · Esc κλείσιμο
          </p>
        </div>
      </div>
    </div>
  );
}
