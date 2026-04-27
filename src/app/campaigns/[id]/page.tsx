"use client";

import { ArrowLeft, FileText, Minus, Phone, Play, Plus, RefreshCw, Search, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { lux } from "@/lib/luxury-styles";
import { CenteredModal } from "@/components/ui/centered-modal";
import { HqSelect } from "@/components/ui/hq-select";
import { useFormToast } from "@/contexts/form-toast-context";
import {
  clampConcurrentLines,
  CONCURRENT_LINES_DEFAULT,
  CONCURRENT_LINES_MAX,
  CONCURRENT_LINES_MIN,
} from "@/lib/campaign-concurrent-lines";

type OutcomeStats = { total: number; positive: number; negative: number; noAnswer: number };

type CallRow = {
  id: string;
  called_at: string | null;
  outcome: string | null;
  duration_seconds: number | null;
  transferred_to_politician: boolean | null;
  contact_id: string;
  contacts: { first_name: string; last_name: string; phone: string } | null;
};

type AssignedRow = {
  contact_id: string;
  added_at: string;
  contact: { id: string; first_name: string; last_name: string; phone: string } | null;
};

type CampaignHead = {
  id: string;
  name: string;
  created_at: string | null;
  started_at: string | null;
  description: string | null;
  status: string;
  channel?: string;
  campaign_type_id?: string | null;
  retell_agent_id?: string | null;
  campaign_type?: { id: string; name: string; color: string; retell_agent_id?: string | null } | null;
  concurrent_lines?: number | null;
};

type HeadData = {
  campaign: CampaignHead;
  stats: OutcomeStats;
  progress: number;
  callsMade: number;
  contactTotal: number;
  assigned_contacts: AssignedRow[];
  calls: CallRow[];
};

type LiveSnapshot = {
  ongoing_count: number;
  called_today: number | null;
  success_rate_today_pct: number | null;
  concurrent_lines: number;
};

function formatDuration(s: number | null | undefined): string {
  if (s == null || s < 0) return "—";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function outcomeGreek(o: string | null | undefined): string {
  const t = o ?? "—";
  const m: Record<string, string> = {
    Positive: "Θετικό",
    Negative: "Αρνητικό",
    "No Answer": "Δεν απάντησε",
    Pending: "Αναμονή",
  };
  return m[t] ?? t;
}

const tableTh = "text-left text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]";

export default function CampaignDetailPage() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";
  const [data, setData] = useState<HeadData | null>(null);
  const [outcome, setOutcome] = useState("");
  const [loading, setLoading] = useState(true);
  const [dialing, setDialing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [live, setLive] = useState<LiveSnapshot | null>(null);
  const [liveErr, setLiveErr] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [addResults, setAddResults] = useState<Array<{ id: string; first_name: string; last_name: string; phone: string }>>([]);
  const [addBusy, setAddBusy] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [linesDraft, setLinesDraft] = useState("");
  const [linesSaving, setLinesSaving] = useState(false);
  const { showToast } = useFormToast();

  const load = useCallback(async () => {
    if (!id) return;
    setErr(null);
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (outcome) q.set("outcome", outcome);
      const res = await fetchWithTimeout(`/api/campaigns/${id}?${q.toString()}`);
      const j = await res.json();
      if (!res.ok) {
        setErr((j as { error?: string }).error ?? "Σφάλμα");
        setData(null);
        return;
      }
      setData({
        campaign: j.campaign,
        stats: j.stats,
        progress: j.progress,
        callsMade: j.callsMade,
        contactTotal: j.contactTotal,
        assigned_contacts: (j.assigned_contacts ?? []) as AssignedRow[],
        calls: (j.calls ?? []) as CallRow[],
      });
    } finally {
      setLoading(false);
    }
  }, [id, outcome]);

  const patchConcurrentLines = useCallback(async (next: number) => {
    if (!id) return false;
    const v = clampConcurrentLines(next);
    setLinesSaving(true);
    setErr(null);
    try {
      const r = await fetchWithTimeout(`/api/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concurrent_lines: v }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        setErr(j.error ?? "Σφάλμα αποθήκευσης");
        return false;
      }
      setData((prev) => {
        if (!prev) return prev;
        return { ...prev, campaign: { ...prev.campaign, concurrent_lines: v } };
      });
      setLinesDraft(String(v));
      return true;
    } finally {
      setLinesSaving(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const concurrentLinesStored = data?.campaign?.concurrent_lines;
  const campaignIdForLines = data?.campaign?.id;
  useEffect(() => {
    if (!campaignIdForLines) return;
    setLinesDraft(String(clampConcurrentLines(concurrentLinesStored)));
  }, [campaignIdForLines, concurrentLinesStored]);

  const campStatus = data?.campaign?.status;
  useEffect(() => {
    if (!id || campStatus !== "active") {
      setLive(null);
      setLiveErr(null);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      const res = await fetchWithTimeout(`/api/retell/active-calls?campaign_id=${encodeURIComponent(id)}`);
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        ongoing_count?: number;
        called_today?: number | null;
        success_rate_today_pct?: number | null;
        concurrent_lines?: number;
      };
      if (cancelled) return;
      if (!res.ok) {
        setLiveErr(j.error ?? "Σφάλμα live");
        return;
      }
      setLiveErr(null);
      setLive({
        ongoing_count: typeof j.ongoing_count === "number" ? j.ongoing_count : 0,
        called_today: j.called_today ?? null,
        success_rate_today_pct: j.success_rate_today_pct ?? null,
        concurrent_lines: clampConcurrentLines(
          typeof j.concurrent_lines === "number" ? j.concurrent_lines : CONCURRENT_LINES_DEFAULT,
        ),
      });
    };
    void tick();
    const t = setInterval(() => void tick(), 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [id, campStatus]);

  useEffect(() => {
    if (!addOpen || !addSearch.trim()) {
      setAddResults([]);
      return;
    }
    const h = setTimeout(() => {
      setAddBusy(true);
      const q = new URLSearchParams();
      q.set("search", addSearch.trim());
      q.set("page_size", "20");
      void fetchWithTimeout(`/api/contacts?${q.toString()}`)
        .then((r) => r.json())
        .then((d: { contacts?: Array<{ id: string; first_name: string; last_name: string; phone: string }> }) => {
          setAddResults(d.contacts ?? []);
        })
        .catch(() => setAddResults([]))
        .finally(() => setAddBusy(false));
    }, 300);
    return () => clearTimeout(h);
  }, [addOpen, addSearch]);

  const c = data?.campaign;
  const s = data?.stats;
  const hasPool = (data?.contactTotal ?? 0) > 0;
  const barPct = hasPool ? Math.min(100, data?.progress ?? 0) : (s?.total ?? 0) > 0 ? 100 : 0;

  if (!id) {
    return <p className="text-sm text-[var(--text-secondary)]">Μη έγκυρο id.</p>;
  }

  return (
    <div className="space-y-6 max-md:space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href="/campaigns"
            className="mb-2 inline-flex h-9 min-w-0 items-center gap-1.5 text-xs font-medium text-[#C9A84C] transition hover:text-[#E8C96B]"
          >
            <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
            Καμπάνιες
          </Link>
          {c ? (
            <>
              <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">{c.name}</h1>
              <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
                {c.status === "active" ? "Ενεργή" : "Ολοκληρώθηκε"}{" "}
                {c.description ? `· ${c.description}` : null}
              </p>
            </>
          ) : (
            <h1 className="text-xl text-[var(--text-muted)]">{loading ? "Φόρτωση…" : "—"}</h1>
          )}
        </div>
        <button
          type="button"
          className={lux.btnPrimary + " !h-10 !shrink-0 !gap-2 !px-3 !py-2 !text-sm"}
          disabled={dialing || !c || c.status !== "active" || !data?.contactTotal}
          onClick={async () => {
            if (!id) return;
            setDialing(true);
            setErr(null);
            const maxPerRun = 25;
            let started = 0;
            try {
              const lines = clampConcurrentLines(c?.concurrent_lines);
              const maxBatches = Math.ceil(maxPerRun / Math.max(1, lines));
              for (let i = 0; i < maxBatches; i += 1) {
                const r = await fetchWithTimeout(`/api/campaigns/${id}/dial-next`, { method: "POST" });
                const j = (await r.json().catch(() => ({}))) as {
                  error?: string;
                  results?: Array<{ ok: boolean }>;
                };
                if (!r.ok) {
                  const msg = j.error ?? "Σφάλμα";
                  if (r.status === 400 && msg.includes("όλες")) {
                    if (started === 0) setErr("Όλες οι επαφές της καμπάνιας έχουν ήδη κληθεί.");
                    break;
                  }
                  setErr(msg);
                  return;
                }
                const n = (j.results ?? []).filter((x) => x.ok).length;
                if (n === 0) break;
                started += n;
                if (started >= maxPerRun) break;
              }
            } finally {
              setDialing(false);
              void load();
            }
          }}
        >
          {dialing ? (
            "Σύνδεση…"
          ) : (
            <>
              <Play className="h-3.5 w-3.5" />
              Εκκίνηση Κλήσεων
            </>
          )}
        </button>
      </div>

      {err && <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{err}</p>}

      {c?.status === "active" && (c.channel === "call" || c.channel == null) && (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]/80 p-4 sm:p-5">
          <h2 className="text-sm font-bold text-[var(--text-primary)]">Παράλληλες γραμμές</h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Πόσες ταυτόχρονες κλήσεις να κάνει ο agent (1–10).
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="min-w-0">
              <label className={lux.label + " !text-xs"} htmlFor="conc-lines">
                Αριθμός
              </label>
              <input
                id="conc-lines"
                type="number"
                min={CONCURRENT_LINES_MIN}
                max={CONCURRENT_LINES_MAX}
                className={lux.input + " !mt-1 w-24 !text-base tabular-nums"}
                value={linesDraft}
                disabled={linesSaving}
                onChange={(e) => setLinesDraft(e.target.value)}
                onBlur={() => {
                  const n = parseInt(linesDraft, 10);
                  if (!Number.isFinite(n)) {
                    setLinesDraft(String(clampConcurrentLines(c.concurrent_lines)));
                    return;
                  }
                  void patchConcurrentLines(n);
                }}
              />
            </div>
          </div>
        </section>
      )}

      {c?.status === "active" && (c.channel === "call" || c.channel == null) && (
        <section
          className="rounded-2xl border border-[#1e5fa8]/35 bg-gradient-to-r from-[#0a1628] to-[#0F1E35] p-4 shadow-[0_4px_24px_rgba(0,0,0,0.35)] sm:p-5"
          aria-live="polite"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-widest text-[#C9A84C]">Ζωντανό ταμπλό κλήσεων</h2>
            <span className="text-[10px] text-[var(--text-muted)]">Ανανέωση κάθε 5 δευτ.</span>
          </div>
          {liveErr && <p className="mb-2 text-xs text-amber-200">{liveErr}</p>}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/20 bg-[#050D1A]/40 px-3 py-3 sm:px-4">
            <p className="text-base font-semibold tabular-nums text-emerald-200 sm:text-lg">
              {live != null ? live.ongoing_count : "—"}/{clampConcurrentLines(c.concurrent_lines)}
              <span className="ml-2 text-sm font-normal text-[var(--text-secondary)]">γραμμές ενεργές</span>
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={lux.btnSecondary + " !h-9 !min-w-9 !px-0"}
                disabled={linesSaving || clampConcurrentLines(c.concurrent_lines) <= CONCURRENT_LINES_MIN}
                aria-label="Μείωση παράλληλων γραμμών"
                onClick={() =>
                  void patchConcurrentLines(clampConcurrentLines(c.concurrent_lines) - 1)
                }
              >
                <Minus className="h-4 w-4" />
              </button>
              <button
                type="button"
                className={lux.btnSecondary + " !h-9 !min-w-9 !px-0"}
                disabled={linesSaving || clampConcurrentLines(c.concurrent_lines) >= CONCURRENT_LINES_MAX}
                aria-label="Αύξηση παράλληλων γραμμών"
                onClick={() =>
                  void patchConcurrentLines(clampConcurrentLines(c.concurrent_lines) + 1)
                }
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-emerald-500/25 bg-[#050D1A]/50 p-3">
              <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-subtitle)]">Ενεργές κλήσεις (Retell)</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-300">{live?.ongoing_count ?? "—"}</p>
              <p className="text-[10px] text-[var(--text-muted)]">Ongoing στον agent</p>
            </div>
            <div className="rounded-xl border border-[#C9A84C]/25 bg-[#050D1A]/50 p-3">
              <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-subtitle)]">Κλήσεις σήμερα</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--text-primary)]">
                {live?.called_today != null ? live.called_today : "—"}
              </p>
              <p className="text-[10px] text-[var(--text-muted)]">Ευρώπη/Αθήνα</p>
            </div>
            <div className="rounded-xl border border-sky-500/25 bg-[#050D1A]/50 p-3">
              <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-subtitle)]">Ποσοστό επιτυχίας (σήμερα)</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-sky-200">
                {live?.success_rate_today_pct != null ? `${live.success_rate_today_pct}%` : "—"}
              </p>
              <p className="text-[10px] text-[var(--text-muted)]">Θετικό / (θετ+αρν+δεν απ.)</p>
            </div>
          </div>
        </section>
      )}

      {c && s && data && (
        <section
          className="relative overflow-hidden rounded-2xl border border-[var(--border)] p-4 shadow-[0_4px_32px_rgba(0,0,0,0.45)] sm:p-5"
          style={{
            background: "linear-gradient(165deg, #0F1E35 0%, #050D1A 100%)",
          }}
        >
          <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 bg-[#C9A84C]/5 blur-3xl" />
          <div className="relative grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <KpiBox label="Σημειώθηκαν" value={String(s.total)} sub="κλήση/εις" color="text-white" border="border-slate-500/20" />
            <KpiBox label="Θετικοί" value={String(s.positive)} sub="αποτέλεσμα" color="text-emerald-300" border="border-emerald-500/20" />
            <KpiBox label="Αρνητικοί" value={String(s.negative)} sub="αποτέλεσμα" color="text-rose-300" border="border-rose-500/20" />
            <KpiBox label="Δεν Απάντησαν" value={String(s.noAnswer)} sub="αποτέλεσμα" color="text-amber-200" border="border-amber-500/20" />
            <div className="col-span-1 sm:col-span-2 lg:col-span-1">
              <p className="text-[9px] font-bold uppercase tracking-widest text-[#C9A84C]">Λίστα επαφών</p>
              <p className="text-lg font-bold text-[var(--text-primary)]">
                {data.callsMade} <span className="text-sm font-normal text-[var(--text-subtitle)]">/ {data.contactTotal || "—"}</span>
              </p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#050D1A] ring-1 ring-[#C9A84C]/15">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#1e5fa8] to-[#C9A84C]"
                  style={{ width: `${barPct}%` }}
                />
              </div>
            </div>
          </div>
        </section>
      )}

      {data && c && (
        <div className={lux.card + " !p-0 !overflow-hidden"}>
          <div className="flex flex-col gap-3 border-b border-[var(--border)] bg-[var(--bg-elevated)]/40 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
            <div>
              <h2 className="text-sm font-bold text-[var(--text-primary)]">Ανατεθειμένες επαφές</h2>
              <p className="text-[10px] text-[var(--text-secondary)]">Διαχείριση λίστας καμπάνιας.</p>
            </div>
            <button
              type="button"
              className={lux.btnPrimary + " !min-h-10 w-full gap-2 !py-2 sm:w-auto"}
              disabled={c.status !== "active"}
              title={c.status !== "active" ? "Η καμπάνια δεν είναι ενεργή" : undefined}
              onClick={() => {
                setAddOpen(true);
                setAddSearch("");
                setAddResults([]);
              }}
            >
              <UserPlus className="h-4 w-4" />
              Προσθήκη Επαφής
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className={lux.tableHead + " border-b border-[var(--border)]"}>
                  <th className={`p-2 pl-3 sm:p-3 ${tableTh} sm:pl-4`}>Επαφή</th>
                  <th className={`p-2 sm:p-3 ${tableTh}`}>Τηλέφωνο</th>
                  <th className={`p-2 pr-3 text-right sm:p-3 sm:pr-4 ${tableTh}`}>Ενέργεια</th>
                </tr>
              </thead>
              <tbody>
                {(data.assigned_contacts ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-6 text-center text-[var(--text-secondary)]">
                      Καμία επαφή στην καμπάνια.
                    </td>
                  </tr>
                ) : (
                  (data.assigned_contacts ?? []).map((row) => {
                    const n = row.contact;
                    return (
                      <tr key={row.contact_id} className="border-b border-[var(--border)]/80 last:border-0">
                        <td className="p-2 pl-3 sm:p-3 sm:pl-4">
                          <div className="font-medium text-[var(--text-primary)]">
                            {n ? [n.first_name, n.last_name].filter(Boolean).join(" ") : "—"}
                          </div>
                          <Link className="text-[10px] text-[#1e5fa8] hover:underline" href={`/contacts/${row.contact_id}`}>
                            Προφίλ
                          </Link>
                        </td>
                        <td className="p-2 font-mono text-xs text-[var(--text-secondary)] sm:p-3">{n?.phone ?? "—"}</td>
                        <td className="p-2 pr-3 text-right sm:p-3 sm:pr-4">
                          <button
                            type="button"
                            className={lux.btnDanger + " !px-2 !py-1.5 text-xs"}
                            disabled={removingId === row.contact_id || c.status !== "active"}
                            onClick={async () => {
                              if (!id) return;
                              setRemovingId(row.contact_id);
                              setErr(null);
                              try {
                                const r = await fetchWithTimeout(
                                  `/api/campaigns/${id}/contacts?contact_id=${encodeURIComponent(row.contact_id)}`,
                                  { method: "DELETE" },
                                );
                                const j = (await r.json().catch(() => ({}))) as { error?: string };
                                if (!r.ok) {
                                  setErr(j.error ?? "Σφάλμα");
                                  return;
                                }
                                await load();
                              } finally {
                                setRemovingId(null);
                              }
                            }}
                          >
                            {removingId === row.contact_id ? "…" : "Αφαίρεση"}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {c && (
        <p className="text-xs text-[var(--text-muted)]">
          Δημιουργήθηκε: {c.created_at ? new Date(c.created_at).toLocaleString("el-GR") : "—"}{" "}
          {c.started_at ? `· Έναρξη: ${new Date(c.started_at).toLocaleString("el-GR")}` : ""}
        </p>
      )}

      <CenteredModal
        open={Boolean(addOpen && id)}
        onClose={() => setAddOpen(false)}
        overlayClassName="!z-[10050]"
        className="flex w-full max-w-lg flex-col overflow-hidden p-0"
        ariaLabel="Προσθήκη επαφής"
      >
        {addOpen && id ? (
          <>
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <h3 className="text-lg font-bold text-[var(--text-primary)]">Προσθήκη Επαφής</h3>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
                aria-label="Κλείσιμο"
                onClick={() => setAddOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid max-h-[min(90vh,720px)] gap-4 overflow-y-auto p-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  className={lux.input + " !pl-10"}
                  placeholder="Αναζήτηση ονόματος ή τηλεφώνου…"
                  value={addSearch}
                  onChange={(e) => setAddSearch(e.target.value)}
                  autoFocus
                />
              </div>
              {addBusy && <p className="text-xs text-[var(--text-muted)]">Αναζήτηση…</p>}
              <ul className="max-h-[min(50dvh,320px)] space-y-1 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/30 p-2">
                {addResults.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--bg-elevated)]"
                      onClick={async () => {
                        setErr(null);
                        const r = await fetchWithTimeout(`/api/campaigns/${id}/contacts`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ contact_id: row.id }),
                        });
                        const j = (await r.json().catch(() => ({}))) as { error?: string };
                        if (!r.ok) {
                          const msg = j.error ?? "Σφάλμα";
                          setErr(msg);
                          showToast(msg, "error");
                          return;
                        }
                        showToast("Η επαφή προστέθηκε στην καμπάνια.", "success");
                        setAddOpen(false);
                        await load();
                      }}
                    >
                      <span className="font-medium text-[var(--text-primary)]">
                        {[row.first_name, row.last_name].filter(Boolean).join(" ")}
                      </span>
                      <span className="shrink-0 font-mono text-xs text-[var(--text-secondary)]">{row.phone}</span>
                    </button>
                  </li>
                ))}
                {!addBusy && addSearch.trim() && addResults.length === 0 && (
                  <li className="px-3 py-4 text-center text-sm text-[var(--text-muted)]">Δεν βρέθηκαν επαφές.</li>
                )}
              </ul>
            </div>
          </>
        ) : null}
      </CenteredModal>

      <div className={lux.card + " !p-0 !overflow-hidden"}>
        <div className="flex flex-col gap-3 border-b border-[var(--border)] bg-[var(--bg-elevated)]/40 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div>
            <h2 className="text-sm font-bold text-[var(--text-primary)]">Καταγεγραμμένες κλήσεις</h2>
            <p className="text-[10px] text-[var(--text-secondary)]">Φίλτρα με βάση το αποτέλεσμα.</p>
          </div>
          <div className="flex w-full min-w-0 max-w-sm flex-col gap-2 sm:flex-row sm:items-center">
            <div className="min-w-0">
              <label className="sr-only" htmlFor="out-camp">Αποτέλεσμα</label>
              <HqSelect
                id="out-camp"
                className="w-full !text-base !min-h-11 max-md:!text-base"
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
              >
                <option value="">Όλα</option>
                <option value="Positive">Θετικό</option>
                <option value="Negative">Αρνητικό</option>
                <option value="No Answer">Δεν απάντησε</option>
              </HqSelect>
            </div>
            <button
              type="button"
              className={lux.btnSecondary + " !min-h-11 w-full !justify-center gap-2 !py-2 sm:w-auto sm:!shrink-0 sm:!self-end"}
              onClick={() => void load()}
            >
              <RefreshCw className="h-4 w-4" />
              Αναν.
            </button>
          </div>
        </div>
        {loading && !data ? (
          <p className="p-6 text-sm text-[var(--text-secondary)]">Φόρτωση…</p>
        ) : (
          <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
            <table className="w-full min-w-[720px] text-sm text-[var(--text-primary)]">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-elevated)]/60">
                  <th className={`p-2 pl-3 sm:p-3 ${tableTh} sm:pl-4`}>Επαφή</th>
                  <th className={`p-2 sm:p-3 ${tableTh}`}>Τηλέφωνο</th>
                  <th className={`p-2 sm:p-3 ${tableTh}`}>Αποτέλεσμα</th>
                  <th className={`p-2 sm:p-3 ${tableTh}`}>Διάρκεια</th>
                  <th className={`p-2 pr-3 sm:p-3 sm:pr-4 ${tableTh} text-left`}>Χρόνος</th>
                  <th className={`p-2 pr-3 sm:p-3 sm:pr-4 text-right ${tableTh}`}>Κατάσταση</th>
                </tr>
              </thead>
              <tbody>
                {(data?.calls ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-[var(--text-secondary)]">
                      Δεν βρέθηκαν εγγραφές κλήσεων{outcome ? " γι’ αυτό το φίλτρο" : ""}.
                    </td>
                  </tr>
                ) : (
                  (data?.calls ?? []).map((call) => {
                    const n = call.contacts;
                    const out = call.outcome;
                    return (
                      <tr key={call.id} className="border-b border-[var(--border)]/80 last:border-0">
                        <td className="p-2 pl-3 sm:max-w-[14rem] sm:min-w-0 sm:p-3 sm:pl-4">
                          <div className="font-semibold text-[var(--text-primary)] break-words">
                            {n ? [n.first_name, n.last_name].filter(Boolean).join(" ") : "—"}
                          </div>
                          <Link
                            className="mt-0.5 text-[10px] text-[#1e5fa8] hover:underline"
                            href={`/contacts/${call.contact_id}`}
                          >
                            Προφίλ
                          </Link>
                        </td>
                        <td className="whitespace-nowrap p-2 font-mono text-[12px] text-[var(--text-secondary)] sm:p-3">
                          {n?.phone ? (
                            <a
                              className="hover:text-[#C9A84C] hover:underline"
                              href={`tel:${n.phone}`}
                            >
                              {n.phone}
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="p-2 sm:p-3">
                          <OutcomePill o={out} />
                        </td>
                        <td className="whitespace-nowrap p-2 text-[13px] text-[var(--text-primary)] sm:p-3">
                          {formatDuration(call.duration_seconds ?? null)}
                        </td>
                        <td className="p-2 pr-3 sm:p-3 sm:pr-4 text-left text-xs text-[var(--text-secondary)] sm:text-sm">
                          {call.called_at ? new Date(call.called_at).toLocaleString("el-GR") : "—"}
                        </td>
                        <td className="p-2 pr-3 sm:p-3 sm:pr-4 text-right">
                          {call.transferred_to_politician ? (
                            <span
                              className="inline-flex items-center justify-end gap-1 text-[9px] font-bold uppercase text-[#C9A84C] sm:text-[10px] sm:leading-tight"
                              title="Έγινε transfer"
                            >
                              <Phone className="h-2.5 w-2.5" />
                              Transfer
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center justify-end gap-1 text-[9px] font-semibold uppercase text-[var(--text-muted)] sm:text-[10px] sm:leading-tight"
                              title="Άμεση κλήση / χωρίς transfer"
                            >
                              <FileText className="h-2.5 w-2.5 opacity-50" />
                              <span>—</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiBox({ label, value, sub, color, border }: { label: string; value: string; sub: string; color: string; border: string }) {
  return (
    <div className={["rounded-lg border p-2.5 sm:p-3", border, "bg-[#050D1A]/30"].join(" ")}>
      <p className="text-[8px] font-bold uppercase leading-tight tracking-wider text-[var(--text-subtitle)] sm:text-[9px] sm:leading-tight sm:tracking-widest">{label}</p>
      <p className={["mt-0.5 text-xl font-bold sm:text-2xl", color].join(" ")}>{value}</p>
      <p className="text-[8px] text-[var(--text-subtitle)] sm:text-[9px] sm:leading-tight">{sub}</p>
    </div>
  );
}

function OutcomePill({ o }: { o: string | null }) {
  const t = o ?? "—";
  const map: Record<string, { bg: string; text: string; ring: string }> = {
    Positive: { bg: "bg-emerald-500/15", text: "text-emerald-200", ring: "ring-emerald-500/25" },
    Negative: { bg: "bg-rose-500/15", text: "text-rose-200", ring: "ring-rose-500/25" },
    "No Answer": { bg: "bg-amber-500/15", text: "text-amber-200", ring: "ring-amber-500/25" },
  };
  const c = map[t] ?? { bg: "bg-slate-500/10", text: "text-[#E2E8F0]", ring: "ring-slate-500/20" };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${c.bg} ${c.text} ${c.ring} max-w-full`}>
      {outcomeGreek(t === "—" ? null : t)}
    </span>
  );
}
