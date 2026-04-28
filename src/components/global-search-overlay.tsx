"use client";

import Link from "next/link";
import { Search, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithTimeout, CLIENT_FETCH_TIMEOUT_MS } from "@/lib/client-fetch";
import { hasMinRole } from "@/lib/roles";

type SContact = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  municipality: string | null;
  contact_code?: string | null;
  matchReasons?: string[];
  aiMatch?: boolean;
};
type SRequest = {
  id: string;
  request_code: string | null;
  title: string;
  status: string | null;
  snippet?: string | null;
};
type STask = { id: string; title: string; due_date: string | null; completed: boolean | null };
type SCampaign = { id: string; name: string; status: string | null };

const overlay =
  "fixed inset-0 z-[400] flex flex-col items-center bg-black/80 backdrop-blur-sm pt-[min(18vh,100px)] px-4";
const inputBox =
  "h-[56px] w-full max-w-3xl rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-5 pr-12 text-lg text-[var(--text-primary)] shadow-2xl outline-none focus:ring-2 focus:ring-[#C9A84C]/40";
const sectionTitle =
  "mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[#C9A84C]/90";

type Entry = { k: "c" | "r" | "t" | "ca"; id: string; href: string; title: string; sub: string };

type Props = { open: boolean; onClose: () => void; role: string };

function av(fn: string, ln: string) {
  return `${(fn[0] ?? "?").toUpperCase()}${(ln[0] ?? "?").toUpperCase()}`;
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
  const inputRef = useRef<HTMLInputElement | null>(null);
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
        sub: x.due_date ? new Date(x.due_date).toLocaleDateString("el-GR") : "—",
      });
    }
    for (const x of ca) {
      out.push({ k: "ca", id: x.id, href: `/campaigns/${x.id}`, title: x.name, sub: x.status ?? "—" });
    }
    return out;
  }, [c, r, t, ca]);
  const total = entries.length;

  useEffect(() => {
    const id = window.setTimeout(() => setDeb(q), 300);
    return () => clearTimeout(id);
  }, [q]);

  const load = useCallback(
    async (query: string) => {
      if (!canSearch) return;
      if (query.length < 2) {
        setC([]);
        setR([]);
        setT([]);
        setCa([]);
        return;
      }
      setLoading(true);
      try {
        const res = await fetchWithTimeout(`/api/search?q=${encodeURIComponent(query)}`, {
          credentials: "same-origin",
          timeoutMs: CLIENT_FETCH_TIMEOUT_MS,
        });
        if (!res.ok) {
          return;
        }
        const d = (await res.json()) as {
          contacts?: SContact[];
          requests?: SRequest[];
          tasks?: STask[];
          campaigns?: SCampaign[];
        };
        setC(d.contacts ?? []);
        setR((d.requests ?? []).slice(0, 8));
        setT((d.tasks ?? []).slice(0, 8));
        setCa((d.campaigns ?? []).slice(0, 8));
      } catch {
        // ignore
      } finally {
        setLoading(false);
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
      window.setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [entries.length, deb]);

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

        <div className="mt-4 max-h-[min(62dvh,480px)] space-y-5 overflow-y-auto rounded-xl border border-[var(--border)]/60 bg-[var(--bg-card)]/95 p-4 text-left shadow-xl">
          {deb.length < 2 && <p className="px-1 py-2 text-sm text-[var(--text-secondary)]">Πληκτρολογήστε τουλάχιστον 2 χαρακτήρες…</p>}
          {deb.length >= 2 && total === 0 && !loading && (
            <p className="px-1 py-2 text-sm text-[var(--text-secondary)]">Δεν βρέθηκαν αποτελέσματα.</p>
          )}

          {c.length > 0 && (
            <div>
              <p className={sectionTitle}>Επαφές</p>
              {c.map((g) => {
                const e = entries.find((x) => x.k === "c" && x.id === g.id);
                if (!e) return null;
                const idx = entries.findIndex((x) => x === e);
                const reasons = g.matchReasons?.length ? g.matchReasons : [];
                return (
                  <div key={g.id} className="mb-2">
                    <button
                      type="button"
                      onClick={() => go(e)}
                      className={[
                        "flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left text-sm transition-colors",
                        idx === active
                          ? "bg-[var(--nav-item-active-bg)] text-[var(--nav-item-active-fg)]"
                          : "text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]",
                      ].join(" ")}
                      onMouseEnter={() => setActive(idx)}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#003476]/25 text-xs font-bold text-[var(--text-primary)]">
                        {av(g.first_name, g.last_name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{e.title}</span>
                          {g.aiMatch ? (
                            <span className="inline-flex items-center gap-0.5 rounded-full border border-[#C9A84C]/40 bg-[#C9A84C]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#C9A84C]">
                              <Sparkles className="h-3 w-3" aria-hidden />
                              AI
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block text-xs text-[var(--text-muted)]">{e.sub}</span>
                        {reasons.length > 0 && (
                          <ul className="mt-1.5 space-y-0.5 border-l-2 border-[#C9A84C]/30 pl-2 text-[11px] leading-snug text-[var(--text-secondary)]">
                            {reasons.slice(0, 3).map((line, i) => (
                              <li key={i}>{line}</li>
                            ))}
                          </ul>
                        )}
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
                    className={[
                      "mb-1 w-full rounded-lg px-2 py-2.5 text-left text-sm",
                      idx === active ? "bg-[var(--nav-item-active-bg)] text-[var(--nav-item-active-fg)]" : "hover:bg-[var(--bg-elevated)]",
                    ].join(" ")}
                    onMouseEnter={() => setActive(idx)}
                  >
                    <span className="font-medium">{e.title}</span>
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
                    className={[
                      "mb-1 w-full rounded-lg px-2 py-2.5 text-left text-sm",
                      idx === active ? "bg-[var(--nav-item-active-bg)] text-[var(--nav-item-active-fg)]" : "hover:bg-[var(--bg-elevated)]",
                    ].join(" ")}
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
                    className={[
                      "mb-1 block w-full rounded-lg px-2 py-2.5 text-sm",
                      idx === active ? "bg-[var(--nav-item-active-bg)] text-[var(--nav-item-active-fg)]" : "hover:bg-[var(--bg-elevated)]",
                    ].join(" ")}
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
