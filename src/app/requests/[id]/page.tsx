"use client";

import Link from "next/link";
import { ArrowLeft, Phone } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { lux, priorityPill } from "@/lib/luxury-styles";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { computeSlaStatus } from "@/lib/request-sla";
import { useProfile } from "@/contexts/profile-context";
import { hasMinRole } from "@/lib/roles";

type ContactCard = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  phone2: string | null;
  landline: string | null;
};

type RequestDetail = {
  id: string;
  request_code: string | null;
  title: string;
  description: string | null;
  category: string | null;
  status: string | null;
  priority: string | null;
  assigned_to: string | null;
  contact_id: string;
  affected_contact_id: string | null;
  sla_due_date: string | null;
  sla_status: string | null;
  created_at: string | null;
  updated_at: string | null;
  requester: ContactCard | null;
  affected: ContactCard | null;
};

type Note = {
  id: string;
  user_id: string | null;
  content: string;
  created_at: string;
  author_full_name: string;
};

const OPEN = new Set(["Νέο", "Σε εξέλιξη"]);

function fmtDateTime(s: string | null | undefined) {
  if (s == null || String(s).trim() === "") return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function authorInitials(name: string) {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (w.length === 0) return "?";
  if (w.length === 1) {
    return w[0]!.slice(0, 2).toUpperCase() || (w[0]![0] ?? "?").toUpperCase();
  }
  return `${w[0]![0] ?? ""}${w[1]![0] ?? ""}`.toUpperCase() || "?";
}

function primaryPhone(c: ContactCard | null) {
  if (!c) return null;
  return c.phone?.trim() || c.phone2?.trim() || c.landline?.trim() || null;
}

function displayName(c: ContactCard | null) {
  if (!c) return "—";
  return `${c.first_name} ${c.last_name}`.trim() || "—";
}

function StatusBadge({ status }: { status: string }) {
  const s = status || "Νέο";
  const styles: Record<string, string> = {
    "Νέο": "bg-[var(--status-req-new-bg)] text-[var(--status-req-new-fg)] ring-1 ring-inset ring-[var(--status-req-new-ring)]",
    "Σε εξέλιξη": "bg-[var(--status-req-prog-bg)] text-[var(--status-req-prog-fg)] ring-1 ring-inset ring-[var(--status-req-prog-ring)]",
    "Ολοκληρώθηκε": "bg-[var(--status-req-done-bg)] text-[var(--status-req-done-fg)] ring-1 ring-inset ring-[var(--status-req-done-ring)]",
    "Απορρίφθηκε": "bg-[var(--status-req-rej-bg)] text-[var(--status-req-rej-fg)] ring-1 ring-inset ring-[var(--status-req-rej-ring)]",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[s] ?? styles["Νέο"]}`}
    >
      {s}
    </span>
  );
}

function PriorityBadge({ p }: { p: string | null | undefined }) {
  const k = p === "High" || p === "Low" || p === "Medium" ? p : "Medium";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${priorityPill[k] ?? priorityPill.Medium}`}
    >
      {k}
    </span>
  );
}

function SlaBar({
  status,
  sla_due_date,
  created_at,
}: {
  status: string | null;
  sla_due_date: string | null;
  created_at: string | null;
}) {
  if (!sla_due_date) {
    return <p className="text-sm text-[var(--text-muted)]">Δεν ορίστηκε SLA.</p>;
  }
  if (!OPEN.has(status ?? "")) {
    return (
      <p className="text-sm text-[var(--text-secondary)]">Το αίτημα δεν παρακολουθεί SLA (λήξη: {sla_due_date}).</p>
    );
  }
  const start = created_at ? new Date(created_at) : new Date();
  const due = new Date(sla_due_date + "T12:00:00");
  const now = new Date();
  start.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const total = Math.max(1, Math.ceil((due.getTime() - start.getTime()) / 86_400_000));
  const left = Math.ceil((due.getTime() - now.getTime()) / 86_400_000);
  const ui = computeSlaStatus(sla_due_date, status ?? "Νέο");
  const fillPct = Math.max(0, Math.min(100, (left / total) * 100));
  const barClass =
    ui === "overdue"
      ? "from-red-500/50 to-red-600/30"
      : ui === "at_risk"
        ? "from-amber-500/50 to-amber-600/25"
        : "from-emerald-500/45 to-emerald-600/25";
  return (
    <div className="w-full max-w-2xl">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-[var(--text-primary)]">SLA</span>
        <span className="text-sm text-[var(--text-secondary)]">
          {left < 0
            ? `Ληξιπρόθεσμο κατά ${Math.abs(left)} ${Math.abs(left) === 1 ? "ημέρα" : "ημέρες"}`
            : left === 0
              ? "Λήγει σήμερα"
              : `Απομένουν ${left} ${left === 1 ? "ημέρα" : "ημέρες"}`}
        </span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full border border-[var(--border)] bg-[var(--bg-elevated)]/80">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${barClass} transition-all duration-500`}
          style={{ width: `${fillPct}%` }}
        />
      </div>
      <p className="mt-1.5 text-[10px] text-[var(--text-muted)]">Προθεσμία: {new Date(sla_due_date + "T12:00:00").toLocaleDateString("el-GR")}</p>
    </div>
  );
}

function PersonCard({ label, contact }: { label: string; contact: ContactCard | null }) {
  const ph = contact ? primaryPhone(contact) : null;
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/30 p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
      {contact ? (
        <div className="mt-2">
          <Link
            href={`/contacts/${contact.id}`}
            className="group block rounded-lg p-0.5 transition hover:bg-[var(--bg-elevated)]/50"
          >
            <div className="flex items-start gap-2.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent-gold)] to-[#8b6914] text-xs font-bold text-white shadow-sm">
                {authorInitials(displayName(contact))}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--text-primary)] group-hover:underline">
                  {displayName(contact)}
                </p>
                {ph && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                    <Phone className="h-3.5 w-3.5 shrink-0 text-[var(--accent-gold)]" aria-hidden />
                    {ph}
                  </p>
                )}
                <span className="mt-1 inline-block text-[10px] font-medium text-[#003476]">Άνοιγμα επαφής →</span>
              </div>
            </div>
          </Link>
        </div>
      ) : (
        <p className="mt-1 text-sm text-[var(--text-muted)]">—</p>
      )}
    </div>
  );
}

export default function RequestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { profile } = useProfile();
  const id = typeof params?.id === "string" ? params.id : "";
  const canManage = hasMinRole(profile?.role, "manager");

  const [data, setData] = useState<RequestDetail | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [err, setErr] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setErr("");
    try {
      const [rRes, nRes] = await Promise.all([
        fetchWithTimeout(`/api/requests/${id}`),
        fetchWithTimeout(`/api/requests/${id}/notes`),
      ]);
      const rj = await rRes.json();
      if (!rRes.ok) {
        setErr(String((rj as { error?: string }).error ?? "Σφάλμα"));
        return;
      }
      setData((rj as { request: RequestDetail }).request);
      if (nRes.ok) {
        const nj = (await nRes.json()) as { notes?: Note[] };
        setNotes(nj.notes ?? []);
      }
    } catch {
      setErr("Σφάλμα φόρτωσης");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (err && !data) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <button type="button" onClick={() => router.push("/requests")} className={lux.btnSecondary + " gap-1"}>
          <ArrowLeft className="h-4 w-4" /> Πίσω
        </button>
        <p className="text-red-300">{err}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="p-6 text-sm text-[var(--text-secondary)]" aria-busy>
        Φόρτωση…
      </div>
    );
  }

  return (
    <div className="min-h-0 space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={() => router.push("/requests")} className={lux.btnSecondary + " w-fit gap-1"}>
          <ArrowLeft className="h-4 w-4" /> Λίστα αιτημάτων
        </button>
      </div>

      <header
        className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-[0_4px_24px_rgba(0,0,0,0.35)] sm:p-6"
        data-hq-card
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            {data.request_code && (
              <span className="mb-2 inline-flex items-center rounded-lg border-2 border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 font-mono text-sm font-bold tracking-tight text-[var(--text-card-title)]">
                {data.request_code}
              </span>
            )}
            <h1 className="text-xl font-semibold tracking-tight text-[var(--text-page-title)] sm:text-2xl">
              {data.title}
            </h1>
            {data.category && <p className="mt-1 text-sm text-[var(--text-secondary)]">{data.category}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={data.status ?? "Νέο"} />
            <PriorityBadge p={data.priority} />
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div className={lux.card + " p-5"}>
            <h2 className={lux.pageTitle + " !text-lg"}>Περιγραφή</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--text-body)]">
              {data.description?.trim() || "Χωρίς περιγραφή."}
            </p>
          </div>

          <div
            className="rounded-2xl border border-[var(--border)] border-l-[3px] border-l-[var(--accent-gold)] bg-[var(--bg-card)]/95 p-5 shadow-sm"
            data-hq-card
          >
            <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Σημειώσεις (χρονολόγιο)</h2>
            <ul className="mb-4 max-h-[min(50vh,480px)] space-y-2.5 overflow-y-auto pr-1">
              {notes.length === 0 ? (
                <li className="text-xs text-[var(--text-muted)]">Καμία σημείωση ακόμα.</li>
              ) : (
                notes.map((n) => (
                  <li key={n.id}>
                    <div className="group relative rounded-md border border-[var(--border)] border-l-[3px] border-l-[var(--accent-gold)] bg-[var(--bg-elevated)]/35 p-3 pl-3 pr-2">
                      <div className="flex gap-3 pr-2">
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] text-[11px] font-bold text-[var(--text-primary)]"
                          aria-hidden
                        >
                          {authorInitials(n.author_full_name || "—")}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-[var(--text-primary)]">{n.author_full_name || "—"}</p>
                          <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{fmtDateTime(n.created_at)}</p>
                          <p className="mt-1.5 whitespace-pre-wrap text-sm text-[var(--text-primary)]">{n.content}</p>
                        </div>
                      </div>
                    </div>
                  </li>
                ))
              )}
            </ul>
            {canManage && (
              <div className="mt-1 flex flex-col gap-2 border-t border-[var(--border)]/80 pt-3">
                <textarea
                  className="min-h-[80px] w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--input-bg)] p-3 text-sm text-[var(--text-input)] placeholder:text-[var(--text-placeholder)] focus:border-[var(--accent-gold)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]/20"
                  placeholder="Νέα σημείωση…"
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  disabled={sending}
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    className={lux.btnBlue + " !text-xs"}
                    disabled={sending || !noteDraft.trim()}
                    onClick={async () => {
                      if (!noteDraft.trim() || !id) return;
                      setSending(true);
                      try {
                        const res = await fetchWithTimeout(`/api/requests/${id}/notes`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ content: noteDraft.trim() }),
                        });
                        if (res.ok) {
                          const j = (await res.json()) as { note?: Note };
                          if (j.note) {
                            setNotes((prev) => [j.note as Note, ...prev]);
                          }
                          setNoteDraft("");
                        }
                      } finally {
                        setSending(false);
                      }
                    }}
                  >
                    {sending ? "…" : "Αποστολή"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-3">
          <PersonCard label="Πρόσωπο που το ζήτησε" contact={data.requester} />
          <PersonCard label="Πρόσωπο που αφορά" contact={data.affected} />
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/30 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Ανατέθηκε σε</p>
            {data.assigned_to ? (
              <div className="mt-2 flex items-start gap-2.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] text-xs font-bold text-[var(--text-primary)]">
                  {authorInitials(data.assigned_to)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{data.assigned_to}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Στέλεχος (εσωτερική ανάθεση)</p>
                </div>
              </div>
            ) : (
              <p className="mt-1 text-sm text-[var(--text-muted)]">Χωρίς ανάθεση</p>
            )}
          </div>
        </aside>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5" data-hq-card>
        <SlaBar status={data.status} sla_due_date={data.sla_due_date} created_at={data.created_at} />
      </div>
    </div>
  );
}
