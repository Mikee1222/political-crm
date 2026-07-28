"use client";

import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  Minus,
  Pause,
  Phone,
  PhoneOff,
  Play,
  Plus,
  RefreshCw,
  Search,
  UserPlus,
  XCircle,
  Clock,
  Pencil,
  MessageCircle,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { formatDateTimeAthens } from "@/lib/date-format";
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
import { formatDurationGreek } from "@/lib/campaign-contact-status";
import { retellOutcomeLabel } from "@/lib/retell-call-outcomes";

type OutcomeStats = { total: number; positive: number; negative: number; noAnswer: number };

type CallRow = {
  id: string;
  called_at: string | null;
  outcome: string | null;
  duration_seconds: number | null;
  transferred_to_politician: boolean | null;
  contact_id: string;
  contacts: {
    first_name: string;
    last_name: string;
    phone: string | null;
    phone2?: string | null;
    landline?: string | null;
  } | null;
};

type CampaignStatusMeta = {
  key: string;
  label: string;
  icon: string;
  tone: "amber" | "emerald" | "rose" | "orange" | "slate";
};

type AssignedRow = {
  contact_id: string;
  added_at: string;
  contact: {
    id: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    phone2: string | null;
    landline: string | null;
  } | null;
  call_count: number;
  campaign_status: CampaignStatusMeta;
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
  retell_agent_name?: string | null;
  campaign_type?: { id: string; name: string; color: string; retell_agent_id?: string | null } | null;
  concurrent_lines?: number | null;
};

type HeadData = {
  campaign: CampaignHead;
  stats: OutcomeStats;
  progress: number;
  callsMade: number;
  contactTotal: number;
  withPhone: number;
  withoutPhone: number;
  remaining: number;
  avgDurationSec: number | null;
  estimatedRemainingSec: number | null;
  assigned_contacts: AssignedRow[];
  assigned_pagination: { page: number; page_size: number; total: number; page_count: number };
  calls: CallRow[];
};

type OpenRequestChip = {
  id: string;
  title: string | null;
  category: string | null;
  status: string | null;
};

type OngoingCall = {
  call_id: string;
  contact_id: string | null;
  contact_name: string | null;
  phone: string | null;
  duration_so_far_sec: number | null;
  started_at: string | null;
  call_phase: "ringing" | "connected";
  transferred_to_kk: boolean;
  open_requests_count: number;
  open_requests: OpenRequestChip[];
};

type LastCompleted = {
  id: string;
  contact_id: string;
  contact_name: string | null;
  phone: string | null;
  outcome: string | null;
  outcome_label: string;
  called_at: string | null;
  duration_seconds: number | null;
  open_requests_count: number;
  open_requests: OpenRequestChip[];
};

type LiveSnapshot = {
  ongoing_count: number;
  called_today: number | null;
  success_rate_today_pct: number | null;
  concurrent_lines: number;
  agent_name: string | null;
  ongoing_calls: OngoingCall[];
  last_completed: LastCompleted[];
  stats: OutcomeStats | null;
  progress: number | null;
  callsMade: number | null;
  contactTotal: number | null;
  remaining: number | null;
  estimatedRemainingSec: number | null;
  estimated_completion_at: string | null;
};

const GOLD = "#D4AF37";
const CREAM = "#FDFAF5";
const NAVY = "#0A1628";

const tableTh = "text-left text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]";

const statusToneClass: Record<CampaignStatusMeta["tone"], string> = {
  amber: "bg-amber-500/15 text-amber-200 ring-amber-500/25",
  emerald: "bg-emerald-500/15 text-emerald-200 ring-emerald-500/25",
  rose: "bg-rose-500/15 text-rose-200 ring-rose-500/25",
  orange: "bg-orange-500/15 text-orange-200 ring-orange-500/25",
  slate: "bg-slate-500/15 text-slate-300 ring-slate-500/25",
};

function formatEta(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return "—";
  if (sec <= 0) return "Ολοκληρώθηκε";
  const m = Math.floor(sec / 60);
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h > 0) return `~${h}ώ ${rm}λ`;
  if (m > 0) return `~${m}λ`;
  return `~${sec}δ`;
}

function normalizeOpenRequests(raw: unknown): OpenRequestChip[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const r = item as Partial<OpenRequestChip>;
      if (!r || typeof r.id !== "string") return null;
      return {
        id: r.id,
        title: r.title ?? null,
        category: r.category ?? null,
        status: r.status ?? null,
      };
    })
    .filter((x): x is OpenRequestChip => x != null)
    .slice(0, 3);
}

function normalizeOngoingCalls(raw: unknown): OngoingCall[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const o = item as Partial<OngoingCall>;
    const phase = o.call_phase === "connected" ? "connected" : "ringing";
    return {
      call_id: String(o.call_id ?? ""),
      contact_id: o.contact_id ?? null,
      contact_name: o.contact_name ?? null,
      phone: o.phone ?? null,
      duration_so_far_sec:
        typeof o.duration_so_far_sec === "number" ? o.duration_so_far_sec : null,
      started_at: o.started_at ?? null,
      call_phase: phase,
      transferred_to_kk: Boolean(o.transferred_to_kk),
      open_requests_count:
        typeof o.open_requests_count === "number" ? o.open_requests_count : 0,
      open_requests: normalizeOpenRequests(o.open_requests),
    };
  });
}

function normalizeLastCompleted(raw: unknown): LastCompleted[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const lc = item as Partial<LastCompleted>;
    return {
      id: String(lc.id ?? ""),
      contact_id: String(lc.contact_id ?? ""),
      contact_name: lc.contact_name ?? null,
      phone: lc.phone ?? null,
      outcome: lc.outcome ?? null,
      outcome_label: lc.outcome_label ?? retellOutcomeLabel(lc.outcome ?? null),
      called_at: lc.called_at ?? null,
      duration_seconds:
        typeof lc.duration_seconds === "number" ? lc.duration_seconds : null,
      open_requests_count:
        typeof lc.open_requests_count === "number" ? lc.open_requests_count : 0,
      open_requests: normalizeOpenRequests(lc.open_requests),
    };
  });
}

/** Compact Greek relative time: «πριν 2λ» */
function formatAgoCompact(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "—";
  const sec = Math.max(0, Math.floor((nowMs - then) / 1000));
  if (sec < 60) return `πριν ${sec}δ`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `πριν ${m}λ`;
  const h = Math.floor(m / 60);
  if (h < 48) return `πριν ${h}ώ`;
  return `πριν ${Math.floor(h / 24)}η`;
}

function formatDurationGreekFull(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—";
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}λ ${r}δ`;
}

function liveCallElapsedSec(
  call: OngoingCall,
  nowMs: number,
): number | null {
  if (call.started_at) {
    const start = Date.parse(call.started_at);
    if (Number.isFinite(start)) return Math.max(0, Math.floor((nowMs - start) / 1000));
  }
  return call.duration_so_far_sec;
}

function requestChipLabel(r: OpenRequestChip): string {
  const label = (r.category || r.title || "Αίτημα").trim();
  const short = label.length > 18 ? `${label.slice(0, 17)}…` : label;
  return `📋 ${short}`;
}

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
  const [liveNowMs, setLiveNowMs] = useState(() => Date.now());
  const [addOpen, setAddOpen] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [addResults, setAddResults] = useState<
    Array<{ id: string; first_name: string; last_name: string; phone: string }>
  >([]);
  const [addBusy, setAddBusy] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [linesDraft, setLinesDraft] = useState("");
  const [linesSaving, setLinesSaving] = useState(false);
  const [assignedPage, setAssignedPage] = useState(1);
  const [autoDial, setAutoDial] = useState(false);
  const [redialMode, setRedialMode] = useState(false);
  const autoDialRef = useRef(false);
  const dialingRef = useRef(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");
  const [editingDesc, setEditingDesc] = useState(false);
  const [metaSaving, setMetaSaving] = useState(false);
  const { showToast } = useFormToast();

  useEffect(() => {
    autoDialRef.current = autoDial;
  }, [autoDial]);

  const load = useCallback(async () => {
    if (!id) return;
    setErr(null);
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (outcome) q.set("outcome", outcome);
      q.set("page", String(assignedPage));
      q.set("page_size", "50");
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
        withPhone: j.withPhone ?? j.contactTotal ?? 0,
        withoutPhone: j.withoutPhone ?? 0,
        remaining: j.remaining ?? 0,
        avgDurationSec: j.avgDurationSec ?? null,
        estimatedRemainingSec: j.estimatedRemainingSec ?? null,
        assigned_contacts: (j.assigned_contacts ?? []) as AssignedRow[],
        assigned_pagination: j.assigned_pagination ?? {
          page: 1,
          page_size: 50,
          total: 0,
          page_count: 1,
        },
        calls: (j.calls ?? []) as CallRow[],
      });
      setNameDraft(String(j.campaign?.name ?? ""));
      setDescDraft(String(j.campaign?.description ?? ""));
    } finally {
      setLoading(false);
    }
  }, [id, outcome, assignedPage]);

  const patchCampaign = useCallback(
    async (body: Record<string, unknown>) => {
      if (!id) return false;
      setMetaSaving(true);
      setErr(null);
      try {
        const r = await fetchWithTimeout(`/api/campaigns/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const j = (await r.json().catch(() => ({}))) as { error?: string; campaign?: CampaignHead };
        if (!r.ok) {
          setErr(j.error ?? "Σφάλμα αποθήκευσης");
          showToast(j.error ?? "Σφάλμα αποθήκευσης", "error");
          return false;
        }
        if (j.campaign) {
          setData((prev) =>
            prev
              ? {
                  ...prev,
                  campaign: { ...prev.campaign, ...j.campaign },
                }
              : prev,
          );
        }
        return true;
      } finally {
        setMetaSaving(false);
      }
    },
    [id, showToast],
  );

  const patchConcurrentLines = useCallback(
    async (next: number) => {
      const v = clampConcurrentLines(next);
      setLinesSaving(true);
      try {
        const ok = await patchCampaign({ concurrent_lines: v });
        if (ok) setLinesDraft(String(v));
        return ok;
      } finally {
        setLinesSaving(false);
      }
    },
    [patchCampaign],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const concurrentLinesStored = data?.campaign?.concurrent_lines;
  const campaignIdForLines = data?.campaign?.id;
  useEffect(() => {
    if (!campaignIdForLines) return;
    setLinesDraft(String(clampConcurrentLines(concurrentLinesStored)));
  }, [campaignIdForLines, concurrentLinesStored]);

  const runDialBatch = useCallback(async (): Promise<number> => {
    if (!id) return 0;
    const q = redialMode ? "?redial_no_answer=1" : "";
    const r = await fetchWithTimeout(`/api/campaigns/${id}/dial-next${q}`, { method: "POST" });
    const j = (await r.json().catch(() => ({}))) as {
      error?: string;
      results?: Array<{ ok: boolean }>;
    };
    if (!r.ok) {
      const msg = j.error ?? "Σφάλμα";
      if (r.status === 400 && (msg.includes("όλες") || msg.includes("Δεν υπάρχουν"))) {
        setAutoDial(false);
        if (!autoDialRef.current) setErr(msg);
        return 0;
      }
      setErr(msg);
      setAutoDial(false);
      return 0;
    }
    return (j.results ?? []).filter((x) => x.ok).length;
  }, [id, redialMode]);

  const campStatus = data?.campaign?.status;
  const isCallChannel =
    data?.campaign?.channel === "call" || data?.campaign?.channel == null;

  useEffect(() => {
    if (!id || campStatus !== "active" || !isCallChannel) {
      setLive(null);
      setLiveErr(null);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      const res = await fetchWithTimeout(
        `/api/retell/active-calls?campaign_id=${encodeURIComponent(id)}`,
      );
      const j = (await res.json().catch(() => ({}))) as Partial<LiveSnapshot> & { error?: string };
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
        agent_name: j.agent_name ?? null,
        ongoing_calls: normalizeOngoingCalls(j.ongoing_calls),
        last_completed: normalizeLastCompleted(j.last_completed),
        stats: (j.stats as OutcomeStats | null | undefined) ?? null,
        progress: j.progress ?? null,
        callsMade: j.callsMade ?? null,
        contactTotal: j.contactTotal ?? null,
        remaining: j.remaining ?? null,
        estimatedRemainingSec: j.estimatedRemainingSec ?? null,
        estimated_completion_at: j.estimated_completion_at ?? null,
      });
    };
    void tick();
    const t = setInterval(() => void tick(), 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [id, campStatus, isCallChannel]);

  // 1s tick for live duration timers + «πριν Νλ» freshness
  useEffect(() => {
    if (campStatus !== "active" || !isCallChannel) return;
    const t = setInterval(() => setLiveNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [campStatus, isCallChannel]);

  // Auto-dial: every ~10s if lines free and contacts remain
  useEffect(() => {
    if (!autoDial || !id || campStatus !== "active" || !isCallChannel) return;
    const t = setInterval(() => {
      if (!autoDialRef.current || dialingRef.current) return;
      const ongoing = live?.ongoing_count ?? 0;
      const lines = clampConcurrentLines(data?.campaign?.concurrent_lines);
      const remaining = live?.remaining ?? data?.remaining ?? 0;
      if (ongoing >= lines) return;
      if (remaining <= 0 && !redialMode) {
        setAutoDial(false);
        return;
      }
      dialingRef.current = true;
      setDialing(true);
      void runDialBatch()
        .then((n) => {
          if (n > 0) void load();
        })
        .finally(() => {
          dialingRef.current = false;
          setDialing(false);
        });
    }, 10_000);
    return () => clearInterval(t);
  }, [
    autoDial,
    id,
    campStatus,
    isCallChannel,
    live?.ongoing_count,
    live?.remaining,
    data?.campaign?.concurrent_lines,
    data?.remaining,
    redialMode,
    runDialBatch,
    load,
  ]);

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
        .then(
          (d: {
            contacts?: Array<{ id: string; first_name: string; last_name: string; phone: string }>;
          }) => {
            setAddResults(d.contacts ?? []);
          },
        )
        .catch(() => setAddResults([]))
        .finally(() => setAddBusy(false));
    }, 300);
    return () => clearTimeout(h);
  }, [addOpen, addSearch]);

  const c = data?.campaign;
  const s = live?.stats ?? data?.stats;
  const hasPool = (data?.contactTotal ?? 0) > 0;
  const barPct = hasPool
    ? Math.min(100, live?.progress ?? data?.progress ?? 0)
    : (s?.total ?? 0) > 0
      ? 100
      : 0;
  const etaSec = live?.estimatedRemainingSec ?? data?.estimatedRemainingSec ?? null;
  const callsMadeDisplay = live?.callsMade ?? data?.callsMade ?? 0;
  const contactTotalDisplay = live?.contactTotal ?? data?.contactTotal ?? 0;

  if (!id) {
    return <p className="text-sm text-[var(--text-secondary)]">Μη έγκυρο id.</p>;
  }

  return (
    <div className="space-y-6 max-md:space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Link
            href="/campaigns"
            className="mb-2 inline-flex h-9 min-w-0 items-center gap-1.5 text-xs font-medium text-[#C9A84C] transition hover:text-[#E8C96B]"
          >
            <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
            Καμπάνιες
          </Link>
          {c ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {editingName ? (
                  <input
                    className={lux.input + " !max-w-md !text-xl !font-bold"}
                    value={nameDraft}
                    disabled={metaSaving}
                    autoFocus
                    onChange={(e) => setNameDraft(e.target.value)}
                    onBlur={() => {
                      void (async () => {
                        const n = nameDraft.trim();
                        if (!n || n === c.name) {
                          setEditingName(false);
                          setNameDraft(c.name);
                          return;
                        }
                        const ok = await patchCampaign({ name: n });
                        if (ok) setEditingName(false);
                      })();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") {
                        setNameDraft(c.name);
                        setEditingName(false);
                      }
                    }}
                  />
                ) : (
                  <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                    {c.name}
                    <button
                      type="button"
                      className="ml-2 inline-flex align-middle text-[var(--text-muted)] hover:text-[#C9A84C]"
                      aria-label="Επεξεργασία ονόματος"
                      onClick={() => {
                        setNameDraft(c.name);
                        setEditingName(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </h1>
                )}
                <ChannelBadge channel={c.channel} />
                <span
                  className={
                    "inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase " +
                    (c.status === "active"
                      ? "border-[#C9A84C]/45 bg-[var(--accent-gold)]/10 text-[var(--accent-gold)]"
                      : "border-emerald-500/40 bg-emerald-500/10 text-emerald-400")
                  }
                >
                  {c.status === "active" ? "Ενεργή" : "Ολοκληρώθηκε"}
                </span>
              </div>
              <div className="mt-1 text-sm text-[var(--text-secondary)]">
                {editingDesc ? (
                  <textarea
                    className={lux.textarea + " !mt-1 !min-h-[64px] max-w-xl"}
                    value={descDraft}
                    disabled={metaSaving}
                    autoFocus
                    onChange={(e) => setDescDraft(e.target.value)}
                    onBlur={() => {
                      void (async () => {
                        const d = descDraft.trim();
                        const prev = (c.description ?? "").trim();
                        if (d === prev) {
                          setEditingDesc(false);
                          return;
                        }
                        const ok = await patchCampaign({ description: d || null });
                        if (ok) setEditingDesc(false);
                      })();
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="text-left hover:text-[#C9A84C]"
                    onClick={() => {
                      setDescDraft(c.description ?? "");
                      setEditingDesc(true);
                    }}
                  >
                    {c.description ? c.description : "Προσθήκη περιγραφής…"}
                    <Pencil className="ml-1 inline h-3 w-3 opacity-60" />
                  </button>
                )}
              </div>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Agent:{" "}
                <span className="font-medium text-[var(--text-secondary)]">
                  {c.retell_agent_name || c.retell_agent_id || "—"}
                </span>
                {c.campaign_type?.name ? ` · Τύπος: ${c.campaign_type.name}` : ""}
              </p>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                {data?.withPhone ?? 0} με αριθμό / {data?.withoutPhone ?? 0} χωρίς
              </p>
            </>
          ) : (
            <h1 className="text-xl text-[var(--text-muted)]">{loading ? "Φόρτωση…" : "—"}</h1>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          {isCallChannel && c?.status === "active" && (
            <>
              {!autoDial ? (
                <button
                  type="button"
                  className={lux.btnSecondary + " !h-10 !gap-2 !px-3 !text-sm"}
                  disabled={dialing || !data?.contactTotal}
                  onClick={() => {
                    setAutoDial(true);
                    showToast("Αυτόματη συνέχεια ενεργή", "success");
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Αυτόματη συνέχεια
                </button>
              ) : (
                <button
                  type="button"
                  className={lux.btnDanger + " !h-10 !gap-2 !px-3 !text-sm"}
                  onClick={() => {
                    setAutoDial(false);
                    showToast("Παύση αυτόματης συνέχειας", "success");
                  }}
                >
                  <Pause className="h-3.5 w-3.5" />
                  Παύση
                </button>
              )}
              <button
                type="button"
                className={lux.btnPrimary + " !h-10 !gap-2 !px-3 !py-2 !text-sm"}
                disabled={dialing || !c || !data?.contactTotal}
                onClick={async () => {
                  setDialing(true);
                  dialingRef.current = true;
                  setErr(null);
                  try {
                    const n = await runDialBatch();
                    if (n > 0) showToast(`Ξεκίνησαν ${n} κλήσεις`, "success");
                    await load();
                  } finally {
                    dialingRef.current = false;
                    setDialing(false);
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
            </>
          )}
        </div>
      </div>

      {err && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {err}
        </p>
      )}

      {c?.status === "active" && isCallChannel && (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]/80 p-4 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-[var(--text-primary)]">Παράλληλες γραμμές</h2>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Πόσες ταυτόχρονες κλήσεις (1–10). Εκτιμ. χρόνος: {formatEta(etaSec)}
                {data?.avgDurationSec != null
                  ? ` · μέση διάρκεια ${formatDurationGreek(data.avgDurationSec)}`
                  : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={lux.btnSecondary + " !h-9 !min-w-9 !px-0"}
                disabled={linesSaving || clampConcurrentLines(c.concurrent_lines) <= CONCURRENT_LINES_MIN}
                aria-label="Μείωση"
                onClick={() => void patchConcurrentLines(clampConcurrentLines(c.concurrent_lines) - 1)}
              >
                <Minus className="h-4 w-4" />
              </button>
              <input
                type="number"
                min={CONCURRENT_LINES_MIN}
                max={CONCURRENT_LINES_MAX}
                className={lux.input + " w-16 !text-center !text-base tabular-nums"}
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
              <button
                type="button"
                className={lux.btnSecondary + " !h-9 !min-w-9 !px-0"}
                disabled={linesSaving || clampConcurrentLines(c.concurrent_lines) >= CONCURRENT_LINES_MAX}
                aria-label="Αύξηση"
                onClick={() => void patchConcurrentLines(clampConcurrentLines(c.concurrent_lines) + 1)}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
          <label className="mt-3 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={redialMode}
              onChange={(e) => setRedialMode(e.target.checked)}
            />
            Επανεκκίνηση μόνο «Δεν απάντησε»
          </label>
        </section>
      )}

      {c?.status === "active" && isCallChannel && (
        <section
          className="rounded-2xl border bg-white p-4 sm:p-5"
          style={{ borderColor: GOLD }}
          aria-live="polite"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2
              className="text-sm font-bold uppercase tracking-widest"
              style={{ color: GOLD }}
            >
              Live κλήσεις
            </h2>
            <span className="text-[10px] text-gray-500">
              {live != null ? live.ongoing_count : "—"}/
              {clampConcurrentLines(c.concurrent_lines)} γραμμές
              {autoDial ? " · Αυτόματη συνέχεια ON" : ""}
            </span>
          </div>
          {liveErr && (
            <p className="mb-2 text-xs text-amber-700">{liveErr}</p>
          )}
          {(live?.ongoing_calls?.length ?? 0) === 0 ? (
            <div
              className="flex items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-sm text-gray-500"
              style={{ borderColor: `${GOLD}66`, background: CREAM }}
            >
              <span
                className="inline-block h-2 w-2 animate-pulse rounded-full"
                style={{ backgroundColor: GOLD }}
                aria-hidden
              />
              Καμία ενεργή κλήση αυτή τη στιγμή
            </div>
          ) : (
            <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
              {live!.ongoing_calls.map((oc) => {
                const elapsed = liveCallElapsedSec(oc, liveNowMs);
                const phase =
                  oc.transferred_to_kk || (elapsed != null && elapsed >= 8)
                    ? "connected"
                    : oc.call_phase;
                const pulseColor = phase === "connected" ? "#16A34A" : GOLD;
                return (
                  <article
                    key={oc.call_id || `${oc.contact_id}-${oc.phone}`}
                    className="w-[280px] shrink-0 rounded-xl border bg-white p-3 shadow-sm"
                    style={{ borderColor: GOLD }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold" style={{ color: NAVY }}>
                          {oc.contact_id ? (
                            <Link
                              href={`/contacts/${oc.contact_id}`}
                              className="hover:underline"
                              style={{ color: NAVY }}
                            >
                              {oc.contact_name || "—"}
                            </Link>
                          ) : (
                            oc.contact_name || "—"
                          )}
                        </p>
                        <p className="mt-0.5 font-mono text-xs text-gray-500">
                          {oc.phone || "—"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span
                          className="inline-block h-2.5 w-2.5 animate-pulse rounded-full"
                          style={{ backgroundColor: pulseColor }}
                          title={phase === "connected" ? "Συνδεδεμένη" : "Κουδουνίζει"}
                          aria-hidden
                        />
                        <span
                          className="tabular-nums text-xs font-semibold"
                          style={{ color: NAVY }}
                        >
                          {formatDurationGreekFull(elapsed)}
                        </span>
                      </div>
                    </div>
                    {oc.transferred_to_kk && (
                      <span className="mt-2 inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-[#16A34A] ring-1 ring-emerald-200">
                        🔗 Συνδέθηκε με ΚΚ
                      </span>
                    )}
                    {(oc.open_requests?.length ?? 0) > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {oc.open_requests.map((r) => (
                          <span
                            key={r.id}
                            className="inline-flex max-w-full truncate rounded-md bg-[#FDFAF5] px-1.5 py-0.5 text-[10px] font-medium text-gray-700 ring-1 ring-[#D4AF37]/40"
                            title={r.title ?? r.category ?? ""}
                          >
                            {requestChipLabel(r)}
                          </span>
                        ))}
                        {oc.open_requests_count > oc.open_requests.length && (
                          <span className="text-[10px] text-gray-500">
                            +{oc.open_requests_count - oc.open_requests.length}
                          </span>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {c && s && data && (
        <section
          className="relative overflow-hidden rounded-2xl border p-4 sm:p-5"
          style={{ background: CREAM, borderColor: GOLD }}
          aria-live="polite"
        >
          <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
            <h2
              className="border-l-[3px] pl-3 text-sm font-bold uppercase tracking-widest"
              style={{ color: GOLD, borderLeftColor: GOLD }}
            >
              Ζωντανό ταμπλό κλήσεων
            </h2>
            <span className="text-[10px] text-gray-500">
              {live?.agent_name || c.retell_agent_name
                ? `Agent: ${live?.agent_name || c.retell_agent_name}`
                : ""}
              {(live?.agent_name || c.retell_agent_name) && c?.status === "active" && isCallChannel
                ? " · "
                : ""}
              {c?.status === "active" && isCallChannel ? "Ανανέωση κάθε 5 δευτ." : ""}
            </span>
          </div>

          <div className="mb-4">
            <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wider text-gray-500">
              <span>Πρόοδος</span>
              <span style={{ color: NAVY }}>
                {callsMadeDisplay} / {contactTotalDisplay}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${barPct}%`, backgroundColor: GOLD }}
              />
            </div>
            {c.status === "active" && isCallChannel && (
              <p className="mt-1 text-[10px] text-gray-500">
                Εκτιμ. ολοκλήρωση: {formatEta(etaSec)}
                {live?.estimated_completion_at
                  ? ` (${formatDateTimeAthens(live.estimated_completion_at)})`
                  : ""}
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <GoldKpi
              label="Σημειώθηκαν"
              value={String(s.total)}
              valueColor={NAVY}
            />
            <GoldKpi
              label="Θετικοί"
              value={String(s.positive)}
              valueColor="#16A34A"
            />
            <GoldKpi
              label="Αρνητικοί"
              value={String(s.negative)}
              valueColor="#DC2626"
            />
            <GoldKpi
              label="Δεν Απάντησαν"
              value={String(s.noAnswer)}
              valueColor="#EA580C"
            />
            <div
              className="rounded-lg border bg-white p-3"
              style={{ borderColor: `${GOLD}55`, borderTopWidth: 3, borderTopColor: GOLD }}
            >
              <p
                className="text-[9px] font-bold uppercase tracking-widest"
                style={{ color: GOLD }}
              >
                Με αριθμό / {contactTotalDisplay || "—"}
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums" style={{ color: NAVY }}>
                {callsMadeDisplay}
              </p>
              <p className="text-[10px] text-gray-500">κλήθηκαν</p>
            </div>
          </div>
        </section>
      )}

      {c?.status === "active" && isCallChannel && (
        <section
          className="rounded-2xl border bg-white p-4 sm:p-5"
          style={{ borderColor: GOLD }}
        >
          <h2
            className="mb-3 text-sm font-bold uppercase tracking-widest"
            style={{ color: GOLD }}
          >
            Τελευταίες κλήσεις
          </h2>
          {(live?.last_completed?.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-500">Καμία ολοκληρωμένη κλήση ακόμα.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {live!.last_completed.map((lc) => (
                <li
                  key={lc.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex flex-wrap items-center gap-2">
                    <Link
                      href={`/contacts/${lc.contact_id}`}
                      className="font-semibold hover:underline"
                      style={{ color: NAVY }}
                    >
                      {lc.contact_name || "—"}
                    </Link>
                    <OutcomePill o={lc.outcome} light />
                    {lc.open_requests_count > 0 && (
                      <span className="text-[10px] font-medium text-gray-500">
                        📋 {lc.open_requests_count} αίτημ
                        {lc.open_requests_count === 1 ? "α" : "ατα"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="tabular-nums" style={{ color: NAVY }}>
                      {formatDurationGreekFull(lc.duration_seconds)}
                    </span>
                    <span>{formatAgoCompact(lc.called_at, liveNowMs)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {data && c && (
        <div className={lux.card + " !overflow-hidden !p-0"}>
          <div className="flex flex-col gap-3 border-b border-[var(--border)] bg-[var(--bg-elevated)]/40 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
            <div>
              <h2 className="text-sm font-bold text-[var(--text-primary)]">Ανατεθειμένες επαφές</h2>
              <p className="text-[10px] text-[var(--text-secondary)]">
                Μόνο με αριθμό · σελ. {data.assigned_pagination.page}/
                {data.assigned_pagination.page_count} ({data.assigned_pagination.total})
              </p>
            </div>
            <button
              type="button"
              className={lux.btnPrimary + " !min-h-10 w-full gap-2 !py-2 sm:w-auto"}
              disabled={c.status !== "active"}
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
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className={lux.tableHead + " border-b border-[var(--border)]"}>
                  <th className={`p-2 pl-3 sm:p-3 sm:pl-4 ${tableTh}`}>Επαφή</th>
                  <th className={`p-2 sm:p-3 ${tableTh}`}>Αριθμοί</th>
                  <th className={`p-2 sm:p-3 ${tableTh}`}>Κατάσταση</th>
                  <th className={`p-2 sm:p-3 ${tableTh}`}>Κλήσεις</th>
                  <th className={`p-2 pr-3 text-right sm:p-3 sm:pr-4 ${tableTh}`}>Ενέργεια</th>
                </tr>
              </thead>
              <tbody>
                {(data.assigned_contacts ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-[var(--text-secondary)]">
                      Καμία επαφή με αριθμό σε αυτή τη σελίδα.
                    </td>
                  </tr>
                ) : (
                  (data.assigned_contacts ?? []).map((row) => {
                    const n = row.contact;
                    const st = row.campaign_status;
                    return (
                      <tr key={row.contact_id} className="border-b border-[var(--border)]/80 last:border-0">
                        <td className="p-2 pl-3 sm:p-3 sm:pl-4">
                          <Link
                            className="font-medium text-[var(--text-primary)] hover:text-[#C9A84C]"
                            href={`/contacts/${row.contact_id}`}
                          >
                            {n ? [n.first_name, n.last_name].filter(Boolean).join(" ") : "—"}
                          </Link>
                        </td>
                        <td className="p-2 text-xs text-[var(--text-secondary)] sm:p-3">
                          <PhoneStack contact={n} />
                        </td>
                        <td className="p-2 sm:p-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${statusToneClass[st?.tone ?? "slate"]}`}
                          >
                            <span aria-hidden>{st?.icon ?? "⬜"}</span>
                            {st?.label ?? "—"}
                          </span>
                        </td>
                        <td className="p-2 tabular-nums text-xs text-[var(--text-secondary)] sm:p-3">
                          {row.call_count === 0
                            ? "—"
                            : `${row.call_count} κλήσ${row.call_count === 1 ? "η" : "εις"}`}
                        </td>
                        <td className="p-2 pr-3 text-right sm:p-3 sm:pr-4">
                          <button
                            type="button"
                            className={lux.btnDanger + " !px-2 !py-1.5 text-xs"}
                            disabled={removingId === row.contact_id || c.status !== "active"}
                            onClick={async () => {
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
          {data.assigned_pagination.page_count > 1 && (
            <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] p-3">
              <button
                type="button"
                className={lux.btnSecondary + " !text-xs"}
                disabled={assignedPage <= 1}
                onClick={() => setAssignedPage((p) => Math.max(1, p - 1))}
              >
                Προηγούμενη
              </button>
              <span className="text-xs text-[var(--text-muted)]">
                Σελίδα {data.assigned_pagination.page} / {data.assigned_pagination.page_count}
              </span>
              <button
                type="button"
                className={lux.btnSecondary + " !text-xs"}
                disabled={assignedPage >= data.assigned_pagination.page_count}
                onClick={() => setAssignedPage((p) => p + 1)}
              >
                Επόμενη
              </button>
            </div>
          )}
        </div>
      )}

      {c && (
        <p className="text-xs text-[var(--text-muted)]">
          Δημιουργήθηκε: {c.created_at ? formatDateTimeAthens(c.created_at) : "—"}{" "}
          {c.started_at ? `· Έναρξη: ${formatDateTimeAthens(c.started_at)}` : ""}
        </p>
      )}

      <CenteredModal
        open={Boolean(addOpen && id)}
        onClose={() => setAddOpen(false)}
        title="Προσθήκη Επαφής"
        className="w-full max-w-lg"
        ariaLabel="Προσθήκη επαφής"
        footer={
          <button type="button" className={lux.btnSecondary} onClick={() => setAddOpen(false)}>
            Άκυρο
          </button>
        }
      >
        {addOpen && id ? (
          <div className="grid gap-4">
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
                    <span className="shrink-0 font-mono text-xs text-[var(--text-secondary)]">
                      {row.phone}
                    </span>
                  </button>
                </li>
              ))}
              {!addBusy && addSearch.trim() && addResults.length === 0 && (
                <li className="px-3 py-4 text-center text-sm text-[var(--text-muted)]">
                  Δεν βρέθηκαν επαφές.
                </li>
              )}
            </ul>
          </div>
        ) : null}
      </CenteredModal>

      <div className={lux.card + " !overflow-hidden !p-0"}>
        <div className="flex flex-col gap-3 border-b border-[var(--border)] bg-[var(--bg-elevated)]/40 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div>
            <h2 className="text-sm font-bold text-[var(--text-primary)]">Καταγεγραμμένες κλήσεις</h2>
            <p className="text-[10px] text-[var(--text-secondary)]">Φίλτρα με βάση το αποτέλεσμα.</p>
          </div>
          <div className="flex w-full min-w-0 max-w-lg flex-col gap-2 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <label className="sr-only" htmlFor="out-camp">
                Αποτέλεσμα
              </label>
              <HqSelect
                id="out-camp"
                className="w-full !min-h-11 !text-base max-md:!text-base"
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
              >
                <option value="">Όλα</option>
                <option value="Συνδέθηκε με ΚΚ">Συνδέθηκε με ΚΚ</option>
                <option value="Δεν ήθελε σύνδεση με ΚΚ">Δεν ήθελε σύνδεση με ΚΚ</option>
                <option value="Δεν απάντησε">Δεν απάντησε</option>
                <option value="Pending">Εκκρεμεί</option>
              </HqSelect>
            </div>
            <a
              href={`/api/campaigns/${id}/export`}
              className={lux.btnSecondary + " !min-h-11 w-full !justify-center gap-2 !py-2 sm:w-auto"}
            >
              <Download className="h-4 w-4" />
              Excel
            </a>
            <button
              type="button"
              className={
                lux.btnSecondary +
                " !min-h-11 w-full !justify-center gap-2 !py-2 sm:w-auto sm:!shrink-0"
              }
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
                  <th className={`p-2 pl-3 sm:p-3 sm:pl-4 ${tableTh}`}>Επαφή</th>
                  <th className={`p-2 sm:p-3 ${tableTh}`}>Τηλέφωνο</th>
                  <th className={`p-2 sm:p-3 ${tableTh}`}>Αποτέλεσμα</th>
                  <th className={`p-2 sm:p-3 ${tableTh}`}>Διάρκεια</th>
                  <th className={`p-2 pr-3 text-left sm:p-3 sm:pr-4 ${tableTh}`}>Χρόνος</th>
                  <th className={`p-2 pr-3 text-right sm:p-3 sm:pr-4 ${tableTh}`}>Κατάσταση</th>
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
                    const phone =
                      n?.phone?.trim() || n?.phone2?.trim() || n?.landline?.trim() || null;
                    return (
                      <tr key={call.id} className="border-b border-[var(--border)]/80 last:border-0">
                        <td className="p-2 pl-3 sm:max-w-[14rem] sm:p-3 sm:pl-4">
                          <Link
                            className="font-semibold text-[var(--text-primary)] hover:text-[#C9A84C] hover:underline"
                            href={`/contacts/${call.contact_id}`}
                          >
                            {n ? [n.first_name, n.last_name].filter(Boolean).join(" ") : "—"}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap p-2 font-mono text-[12px] text-[var(--text-secondary)] sm:p-3">
                          {phone ? (
                            <a className="hover:text-[#C9A84C] hover:underline" href={`tel:${phone}`}>
                              {phone}
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="p-2 sm:p-3">
                          <OutcomePill o={call.outcome} />
                        </td>
                        <td className="whitespace-nowrap p-2 text-[13px] text-[var(--text-primary)] sm:p-3">
                          {formatDurationGreek(call.duration_seconds)}
                        </td>
                        <td className="p-2 pr-3 text-left text-xs text-[var(--text-secondary)] sm:p-3 sm:pr-4 sm:text-sm">
                          {call.called_at ? formatDateTimeAthens(call.called_at) : "—"}
                        </td>
                        <td className="p-2 pr-3 text-right sm:p-3 sm:pr-4">
                          {call.transferred_to_politician ? (
                            <span className="inline-flex items-center justify-end gap-1 text-[9px] font-bold uppercase text-[#C9A84C] sm:text-[10px]">
                              <Phone className="h-2.5 w-2.5" />
                              Transfer
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-end gap-1 text-[9px] font-semibold uppercase text-[var(--text-muted)] sm:text-[10px]">
                              <FileText className="h-2.5 w-2.5 opacity-50" />
                              —
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

function ChannelBadge({ channel }: { channel?: string }) {
  if (channel === "whatsapp") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold uppercase text-emerald-200">
        <MessageCircle className="h-3 w-3" />
        WhatsApp
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-bold uppercase text-sky-200">
      <Phone className="h-3 w-3" />
      Κλήσεις
    </span>
  );
}

function PhoneStack({
  contact,
}: {
  contact: {
    phone: string | null;
    phone2: string | null;
    landline: string | null;
  } | null;
}) {
  if (!contact) return <span>—</span>;
  const rows: Array<{ label: string; value: string }> = [];
  if (contact.phone) rows.push({ label: "κινητό", value: contact.phone });
  if (contact.phone2) rows.push({ label: "κινητό 2", value: contact.phone2 });
  if (contact.landline) rows.push({ label: "σταθερό", value: contact.landline });
  if (!rows.length) return <span>—</span>;
  return (
    <div className="space-y-0.5">
      {rows.map((r) => (
        <div key={r.label + r.value}>
          <span className="text-[9px] uppercase text-[var(--text-muted)]">{r.label}: </span>
          <a className="font-mono hover:text-[#C9A84C]" href={`tel:${r.value}`}>
            {r.value}
          </a>
        </div>
      ))}
    </div>
  );
}

function GoldKpi({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor: string;
}) {
  return (
    <div
      className="rounded-lg border bg-white p-3"
      style={{ borderColor: `${GOLD}55`, borderTopWidth: 3, borderTopColor: GOLD }}
    >
      <p className="text-[9px] font-bold uppercase tracking-widest text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums" style={{ color: valueColor }}>
        {value}
      </p>
    </div>
  );
}

function OutcomePill({ o, light = false }: { o: string | null; light?: boolean }) {
  const t = o ?? "—";
  const darkMap: Record<string, { bg: string; text: string; ring: string; icon: typeof CheckCircle2 }> = {
    Positive: { bg: "bg-emerald-500/15", text: "text-emerald-200", ring: "ring-emerald-500/25", icon: CheckCircle2 },
    Negative: { bg: "bg-rose-500/15", text: "text-rose-200", ring: "ring-rose-500/25", icon: XCircle },
    "No Answer": { bg: "bg-amber-500/15", text: "text-amber-200", ring: "ring-amber-500/25", icon: PhoneOff },
    "Συνδέθηκε με ΚΚ": {
      bg: "bg-emerald-500/15",
      text: "text-emerald-200",
      ring: "ring-emerald-500/25",
      icon: CheckCircle2,
    },
    "Δεν ήθελε σύνδεση με ΚΚ": {
      bg: "bg-rose-500/15",
      text: "text-rose-200",
      ring: "ring-rose-500/25",
      icon: XCircle,
    },
    "Δεν απάντησε": {
      bg: "bg-amber-500/15",
      text: "text-amber-200",
      ring: "ring-amber-500/25",
      icon: PhoneOff,
    },
    Pending: { bg: "bg-sky-500/15", text: "text-sky-200", ring: "ring-sky-500/25", icon: Clock },
  };
  const lightMap: Record<string, { bg: string; text: string; ring: string; icon: typeof CheckCircle2 }> = {
    Positive: { bg: "bg-emerald-50", text: "text-[#16A34A]", ring: "ring-emerald-200", icon: CheckCircle2 },
    Negative: { bg: "bg-red-50", text: "text-[#DC2626]", ring: "ring-red-200", icon: XCircle },
    "No Answer": { bg: "bg-orange-50", text: "text-[#EA580C]", ring: "ring-orange-200", icon: PhoneOff },
    "Συνδέθηκε με ΚΚ": {
      bg: "bg-emerald-50",
      text: "text-[#16A34A]",
      ring: "ring-emerald-200",
      icon: CheckCircle2,
    },
    "Δεν ήθελε σύνδεση με ΚΚ": {
      bg: "bg-red-50",
      text: "text-[#DC2626]",
      ring: "ring-red-200",
      icon: XCircle,
    },
    "Δεν απάντησε": {
      bg: "bg-orange-50",
      text: "text-[#EA580C]",
      ring: "ring-orange-200",
      icon: PhoneOff,
    },
    Pending: { bg: "bg-sky-50", text: "text-sky-700", ring: "ring-sky-200", icon: Clock },
  };
  const map = light ? lightMap : darkMap;
  const c = map[t] ?? {
    bg: light ? "bg-slate-50" : "bg-slate-500/10",
    text: light ? "text-slate-700" : "text-[#E2E8F0]",
    ring: light ? "ring-slate-200" : "ring-slate-500/20",
    icon: Clock,
  };
  const Icon = c.icon;
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${c.bg} ${c.text} ${c.ring}`}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {retellOutcomeLabel(t === "—" ? null : t)}
    </span>
  );
}
