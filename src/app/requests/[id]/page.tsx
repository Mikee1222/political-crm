"use client";

import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { lux, priorityPill } from "@/lib/luxury-styles";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { computeSlaStatus } from "@/lib/request-sla";
import { formatCalendarDateOnly, formatDateTimeEnGb } from "@/lib/date-format";
import { useProfile } from "@/contexts/profile-context";
import { can } from "@/lib/can";
import { RequestDocumentsSection } from "@/components/request-documents-section";
import { RequestPersonsSections } from "@/components/requests/request-persons-sections";
import { normalizeRequestStatus, OPEN_REQUEST_STATUSES, REQUEST_STATUS_OPEN } from "@/lib/request-statuses";
import { RequestStatusBadge } from "@/components/requests/request-status-badge";
import { useOptionalAlexandraPageContext } from "@/contexts/alexandra-page-context";

type ContactCard = {
  id: string;
  person_id?: string | null;
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
  portal_message: string | null;
  portal_visible: boolean;
  requester: ContactCard | null;
  affected: ContactCard | null;
  requesters: ContactCard[];
  affected_list: ContactCard[];
  helpers: ContactCard[];
  handlers: string[];
  notes?: Note[];
};

type Note = {
  id: string;
  user_id: string | null;
  content: string;
  created_at: string;
  author_name?: string | null;
  author_full_name: string;
};

const OPEN = OPEN_REQUEST_STATUSES;

function formatDate(s: string | null | undefined) {
  return formatDateTimeEnGb(s);
}

function authorInitials(name: string) {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (w.length === 0) return "?";
  if (w.length === 1) {
    return w[0]!.slice(0, 2).toUpperCase() || (w[0]![0] ?? "?").toUpperCase();
  }
  return `${w[0]![0] ?? ""}${w[1]![0] ?? ""}`.toUpperCase() || "?";
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
  const normalizedStatus = normalizeRequestStatus(status ?? REQUEST_STATUS_OPEN);
  if (!sla_due_date) {
    return <p className="text-sm text-[var(--text-muted)]">Δεν ορίστηκε SLA.</p>;
  }
  if (!OPEN.has(normalizedStatus)) {
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
  const ui = computeSlaStatus(sla_due_date, normalizedStatus);
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
      <p className="mt-1.5 text-[10px] text-[var(--text-muted)]">Προθεσμία: {formatCalendarDateOnly(sla_due_date)}</p>
    </div>
  );
}


export default function RequestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { profile } = useProfile();
  const id = typeof params?.id === "string" ? params.id : "";
  const canEdit = can(profile, "requests_edit");

  const [data, setData] = useState<RequestDetail | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [err, setErr] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [portalMsg, setPortalMsg] = useState("");
  const [savingMsg, setSavingMsg] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const requestApiId = useMemo(() => data?.id ?? id, [data?.id, id]);
  const alexPage = useOptionalAlexandraPageContext();

  useEffect(() => {
    if (!alexPage) return;
    if (data) {
      alexPage.setPageContext({
        type: "request",
        requestId: data.id,
        requestTitle: data.title,
        requestStatus: data.status ?? REQUEST_STATUS_OPEN,
      });
    } else {
      alexPage.setPageContext(null);
    }
    return () => alexPage.setPageContext(null);
  }, [alexPage, data?.id, data?.title, data?.status]);

  const load = useCallback(async () => {
    if (!id) return;
    setErr("");
    setAiSummary(null);
    try {
      const rRes = await fetchWithTimeout(`/api/requests/${encodeURIComponent(id)}`);
      const rj = await rRes.json();
      if (!rRes.ok) {
        setErr(String((rj as { error?: string }).error ?? "Σφάλμα"));
        return;
      }
      const req = (rj as { request: RequestDetail }).request;
      setData(req);
      setPortalMsg(req.portal_message?.trim() ?? "");
      setNotes(req.notes ?? []);
      if (req.id && req.id !== id) {
        router.replace(`/requests/${req.id}`, { scroll: false });
      }
    } catch {
      setErr("Σφάλμα φόρτωσης");
    }
  }, [id, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAiSummary = async () => {
    if (!data) return;
    if (aiSummary) {
      setAiSummary(null);
      return;
    }
    setAiLoading(true);
    try {
      const res = await fetchWithTimeout("/api/requests-scheduler/ai-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: data.id }),
      });
      const json = (await res.json()) as { summary?: string };
      setAiSummary(json.summary ?? "Δεν ήταν δυνατή η δημιουργία σύνοψης.");
    } catch {
      setAiSummary("Σφάλμα σύνδεσης.");
    } finally {
      setAiLoading(false);
    }
  };

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
    <div className="min-h-0 space-y-6 overflow-x-hidden p-4 pb-24 sm:p-6 sm:pb-6">
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
            <RequestStatusBadge status={data.status ?? REQUEST_STATUS_OPEN} />
            <PriorityBadge p={data.priority} />
          </div>
        </div>
        {canEdit && (
          <>
            <button
              type="button"
              onClick={() => void handleAiSummary()}
              disabled={aiLoading}
              className="mt-3 flex touch-manipulation items-center gap-2 rounded-xl border border-primary/30 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
            >
              {aiLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="h-4 w-4" aria-hidden />
              )}
              {aiSummary ? "Απόκρυψη σύνοψης" : "Σύνοψη AI"}
            </button>
            {aiSummary && (
              <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
                <div className="mb-2 flex items-center gap-2 text-primary">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  <span className="text-xs font-semibold uppercase tracking-widest">Σύνοψη Alexandra</span>
                </div>
                <p className="text-sm leading-relaxed text-foreground">{aiSummary}</p>
              </div>
            )}
          </>
        )}
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div className={lux.card + " p-5"}>
            <h2 className={lux.pageTitle + " !text-lg"}>Περιγραφή</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--text-body)]">
              {data.description?.trim() || "Χωρίς περιγραφή."}
            </p>
          </div>

          {canEdit && (
            <div
              className="rounded-2xl border border-[var(--border)] border-l-[3px] border-l-[color-mix(in_srgb,var(--accent)_55%,var(--border))] bg-[var(--bg-card)]/95 p-5 shadow-sm"
              data-hq-card
            >
              <h2 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">Μήνυμα στον πολίτη</h2>
              <p className="mb-2 text-xs text-[var(--text-secondary)]">Εμφανίζεται στο portal του πολίτη (αίτημα) σε επισημασμένο πλαίσιο.</p>
              <textarea
                className="min-h-[72px] w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--input-bg)] p-3 text-sm"
                value={portalMsg}
                onChange={(e) => setPortalMsg(e.target.value)}
                disabled={savingMsg}
                placeholder="Σύντομη ενημέρωση…"
                aria-label="Μήνυμα portal"
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  className={lux.btnBlue + " !text-xs"}
                  disabled={savingMsg}
                  onClick={async () => {
                    if (!requestApiId) return;
                    setSavingMsg(true);
                    try {
                      const res = await fetchWithTimeout(`/api/requests/${encodeURIComponent(requestApiId)}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ portal_message: portalMsg || null }),
                      });
                      if (res.ok) {
                        const rj = (await res.json()) as { request: RequestDetail };
                        setData(rj.request);
                      }
                    } finally {
                      setSavingMsg(false);
                    }
                  }}
                >
                  {savingMsg ? "…" : "Αποθήκευση μηνύματος"}
                </button>
              </div>
            </div>
          )}

          <RequestDocumentsSection requestId={requestApiId} canManage={canEdit} />

          <div
            className="rounded-2xl border border-[var(--border)] border-l-[3px] border-l-[var(--accent-gold)] bg-[var(--bg-card)]/95 p-5 shadow-sm"
            data-hq-card
          >
            <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Σημειώσεις (χρονολόγιο)</h2>
            <ul className="mb-4 max-h-[min(50vh,480px)] space-y-2.5 overflow-y-auto pr-1">
              {notes.length === 0 ? (
                <li className="text-xs text-[var(--text-muted)]">Καμία σημείωση ακόμα.</li>
              ) : (
                notes.map((note) => (
                  <li key={note.id}>
                    <div className="group relative rounded-md border border-[var(--border)] border-l-[3px] border-l-[var(--accent-gold)] bg-[var(--bg-elevated)]/35 p-3 pl-3 pr-2">
                      <div className="flex gap-3 pr-2">
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] text-[11px] font-bold text-[var(--text-primary)]"
                          aria-hidden
                        >
                          {authorInitials(note.author_name?.trim() || note.author_full_name || "—")}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">{note.content}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            {note.author_name && (
                              <span className="text-xs font-medium text-primary/70">{note.author_name}</span>
                            )}
                            {note.author_name && <span className="text-xs text-muted-foreground">·</span>}
                            <span className="text-xs text-muted-foreground">{formatDate(note.created_at)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                ))
              )}
            </ul>
            {canEdit && (
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
                      if (!noteDraft.trim() || !requestApiId) return;
                      setSending(true);
                      try {
                        const res = await fetchWithTimeout(`/api/requests/${encodeURIComponent(requestApiId)}/notes`, {
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
          <RequestPersonsSections
            requestId={requestApiId}
            requesters={data.requesters ?? (data.requester ? [data.requester] : [])}
            affected={data.affected_list ?? (data.affected ? [data.affected] : [])}
            helpers={data.helpers ?? []}
            handlerNames={data.handlers ?? []}
            canManage={canEdit}
            onChanged={() => void load()}
          />
        </aside>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5" data-hq-card>
        <SlaBar status={data.status} sla_due_date={data.sla_due_date} created_at={data.created_at} />
      </div>
    </div>
  );
}
