"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Activity, Filter, Phone, User, FileText, Megaphone, Loader2 } from "lucide-react";
import { fetchWithTimeout, CLIENT_FETCH_TIMEOUT_MS } from "@/lib/client-fetch";
import { fmtTime } from "./alexandra-chat-helpers";

const ACTION_OPTS: { value: string; label: string }[] = [
  { value: "", label: "Όλες" },
  { value: "contact_created", label: "Νέα επαφή" },
  { value: "contact_updated", label: "Επαφή" },
  { value: "call_made", label: "Κλήση" },
  { value: "request_created", label: "Αίτημα" },
  { value: "request_updated", label: "Ενημέρωση αιτήματος" },
  { value: "campaign_started", label: "Καμπάνια" },
];

function iconFor(a: string) {
  if (a.includes("call")) return Phone;
  if (a.includes("request")) return FileText;
  if (a.includes("campaign")) return Megaphone;
  if (a.includes("contact")) return User;
  return Activity;
}

type Row = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  description: string;
  timeAgo: string;
  created_at: string;
  href: string | null;
};

export function AlexandraActivityPanel() {
  const [filter, setFilter] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const q = new URLSearchParams({ limit: "50" });
      if (filter) q.set("action", filter);
      const res = await fetchWithTimeout(`/api/alexandra/activity-history?${q}`, { timeoutMs: CLIENT_FETCH_TIMEOUT_MS });
      const j = (await res.json()) as { items?: Row[]; error?: string };
      if (!res.ok) {
        setErr(j.error || "Σφάλμα");
        setRows([]);
        return;
      }
      setRows(j.items ?? []);
    } catch {
      setErr("Δίκτυο");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-[var(--border)]/60 px-2 py-2">
        <label className="mb-1 block text-[10px] font-medium text-[var(--text-muted)]">
          <Filter className="mr-1 inline h-3 w-3" aria-hidden />
          Τύπος
        </label>
        <select
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-xs text-[var(--text-primary)]"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {ACTION_OPTS.map((o) => (
            <option key={o.value || "all"} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 py-2">
        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--accent-gold)]" />
          </div>
        )}
        {err && !loading && <p className="px-2 text-center text-xs text-amber-400/90">{err}</p>}
        {!loading && !err && rows.length === 0 && (
          <p className="px-2 text-center text-xs text-[var(--text-muted)]">Καμία ενέργεια ακόμη.</p>
        )}
        <ul className="space-y-1.5">
          {rows.map((r) => {
            const Ic = iconFor(r.action);
            const inner = (
              <div className="flex items-start gap-2 rounded-lg border border-transparent px-2 py-2 text-left transition hover:border-[var(--border)] hover:bg-[var(--bg-elevated)]/80">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#003476]/25 text-white">
                  <Ic className="h-3.5 w-3.5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs leading-snug text-[var(--text-primary)]">{r.description}</p>
                  <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                    {r.timeAgo} · {fmtTime(r.created_at)}
                  </p>
                </div>
              </div>
            );
            return (
              <li key={r.id} className="group">
                {r.href ? (
                  <Link href={r.href} className="block">
                    {inner}
                  </Link>
                ) : (
                  <div className="opacity-80">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
