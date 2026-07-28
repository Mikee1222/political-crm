"use client";

import Link from "next/link";
import {
  BarChart3,
  CheckCircle2,
  FileText,
  LayoutGrid,
  Megaphone,
  MessageCircle,
  Phone,
  PhoneOff,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";
import { FormEvent, Suspense, useCallback, useEffect, useState, type ComponentType } from "react";
import { useSearchParams } from "next/navigation";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { formatDateAthens } from "@/lib/date-format";
import { lux } from "@/lib/luxury-styles";
import type { CampaignTypeRow } from "@/lib/campaign-types";
import {
  clampConcurrentLines,
  CONCURRENT_LINES_MAX,
  CONCURRENT_LINES_MIN,
} from "@/lib/campaign-concurrent-lines";
import { CenteredModal } from "@/components/ui/centered-modal";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { HqSelect } from "@/components/ui/hq-select";
import { useFormToast } from "@/contexts/form-toast-context";

export default function CampaignsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-[var(--text-muted)]">Φόρτωση καμπανιών…</p>}>
      <CampaignsPageInner />
    </Suspense>
  );
}

type OutcomeStats = { total: number; positive: number; negative: number; noAnswer: number };

type Campaign = {
  id: string;
  name: string;
  started_at: string | null;
  created_at: string | null;
  description: string | null;
  status: string;
  channel?: string;
  concurrent_lines?: number | null;
  retell_agent_name?: string | null;
  retell_agent_id_resolved?: string | null;
  stats: OutcomeStats;
  progress: number;
  callsMade: number;
  contactTotal: number;
  withPhone?: number;
  withoutPhone?: number;
  remaining?: number;
  sentiment?: {
    positiveRate: number;
    trendDelta: number | null;
    previousCampaignId: string | null;
  };
};

type FieldOptions = { areas: string[]; municipalities: string[] };

type NewFilter = {
  call_status: string;
  area: string;
  municipality: string;
  priority: string;
  tag: string;
};

const CAMPAIGN_CREATE_IDS_KEY = "campaign_create_contact_ids";

const statusBadge =
  "inline-flex min-h-7 min-w-0 max-w-full shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide";

const goldCta =
  "no-mobile-scale inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-full border-2 border-[#8B6914] bg-gradient-to-b from-[#E8C96B] to-[#8B6914] px-4 text-xs font-bold text-[#0A1628] shadow-sm transition duration-200 hover:brightness-110 sm:text-sm";

function CampaignsPageInner() {
  const searchParams = useSearchParams();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [campaignChannel, setCampaignChannel] = useState<"call" | "whatsapp">("call");
  const [campaignTypes, setCampaignTypes] = useState<CampaignTypeRow[]>([]);
  const [campaignTypeId, setCampaignTypeId] = useState("");
  const [concurrentLines, setConcurrentLines] = useState(3);
  const [filter, setFilter] = useState<NewFilter>({
    call_status: "",
    area: "",
    municipality: "",
    priority: "",
    tag: "",
  });
  const [options, setOptions] = useState<FieldOptions | null>(null);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewWithPhone, setPreviewWithPhone] = useState<number | null>(null);
  const [previewWithoutPhone, setPreviewWithoutPhone] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [dialingId, setDialingId] = useState<string | null>(null);
  const [redialingId, setRedialingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [nameFieldErr, setNameFieldErr] = useState<string | null>(null);
  const { showToast } = useFormToast();

  const load = useCallback(async () => {
    const res = await fetchWithTimeout("/api/campaigns");
    const data = await res.json();
    if (!res.ok) return;
    setCampaigns((data.campaigns ?? []) as Campaign[]);
  }, []);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  // Deep-link / session: create from advanced search selection
  useEffect(() => {
    const create = searchParams.get("create");
    const idsParam = searchParams.get("ids");
    let ids: string[] = [];
    if (idsParam) {
      ids = [...new Set(idsParam.split(",").map((x) => x.trim()).filter(Boolean))];
    } else if (typeof window !== "undefined") {
      try {
        const raw = sessionStorage.getItem(CAMPAIGN_CREATE_IDS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as unknown;
          if (Array.isArray(parsed)) {
            ids = parsed.map((x) => String(x).trim()).filter(Boolean);
          }
          sessionStorage.removeItem(CAMPAIGN_CREATE_IDS_KEY);
        }
      } catch {
        /* ignore */
      }
    }
    if (create === "1" || ids.length > 0) {
      if (ids.length > 0) setSelectedContactIds(ids);
      setConcurrentLines(3);
      setModal(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!modal) return;
    fetchWithTimeout("/api/contacts/field-options")
      .then((r) => r.json())
      .then((d: FieldOptions) => setOptions({ areas: d.areas ?? [], municipalities: d.municipalities ?? [] }))
      .catch(() => setOptions({ areas: [], municipalities: [] }));
    fetchWithTimeout("/api/campaign-types")
      .then((r) => r.json())
      .then((d: { types?: CampaignTypeRow[] }) => setCampaignTypes(d.types ?? []))
      .catch(() => setCampaignTypes([]));
  }, [modal]);

  useEffect(() => {
    if (!modal) return;
    if (selectedContactIds.length > 0) {
      setPreviewing(true);
      const q = new URLSearchParams();
      q.set("contact_ids", selectedContactIds.join(","));
      const t = setTimeout(() => {
        fetchWithTimeout(`/api/campaigns/preview?${q.toString()}`)
          .then((r) => r.json())
          .then((d) => {
            setPreviewCount(typeof d.count === "number" ? d.count : null);
            setPreviewWithPhone(typeof d.with_phone === "number" ? d.with_phone : null);
            setPreviewWithoutPhone(typeof d.without_phone === "number" ? d.without_phone : null);
          })
          .catch(() => {
            setPreviewCount(null);
            setPreviewWithPhone(null);
            setPreviewWithoutPhone(null);
          })
          .finally(() => setPreviewing(false));
      }, 200);
      return () => clearTimeout(t);
    }

    const q = new URLSearchParams();
    if (filter.call_status) q.set("call_status", filter.call_status);
    if (filter.area) q.set("area", filter.area);
    if (filter.municipality) q.set("municipality", filter.municipality);
    if (filter.priority) q.set("priority", filter.priority);
    if (filter.tag) q.set("tag", filter.tag);
    if (!q.toString()) {
      setPreviewCount(null);
      setPreviewWithPhone(null);
      setPreviewWithoutPhone(null);
      return;
    }
    setPreviewing(true);
    const t = setTimeout(() => {
      fetchWithTimeout(`/api/campaigns/preview?${q.toString()}`)
        .then((r) => r.json())
        .then((d) => {
          setPreviewCount(typeof d.count === "number" ? d.count : null);
          setPreviewWithPhone(typeof d.with_phone === "number" ? d.with_phone : null);
          setPreviewWithoutPhone(typeof d.without_phone === "number" ? d.without_phone : null);
        })
        .catch(() => {
          setPreviewCount(null);
          setPreviewWithPhone(null);
          setPreviewWithoutPhone(null);
        })
        .finally(() => setPreviewing(false));
    }, 300);
    return () => clearTimeout(t);
  }, [modal, filter, selectedContactIds]);

  const selectedType = campaignTypes.find((x) => x.id === campaignTypeId);
  const agentPreview = selectedType?.retell_agent_id
    ? selectedType.retell_agent_id
    : "RETELL_AGENT_ID (προεπιλογή περιβάλλοντος)";

  const createCampaign = async (e: FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    setNameFieldErr(null);
    if (!name.trim()) {
      setNameFieldErr("Υποχρεωτικό όνομα");
      showToast("Συμπληρώστε το όνομα της καμπάνιας.", "error");
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name,
        description: description || null,
        channel: campaignChannel,
        campaign_type_id: campaignTypeId || null,
        concurrent_lines: clampConcurrentLines(concurrentLines),
      };
      if (selectedContactIds.length > 0) {
        body.contact_ids = selectedContactIds;
      } else {
        body.filter = {
          call_status: filter.call_status || undefined,
          area: filter.area || undefined,
          municipality: filter.municipality || undefined,
          priority: filter.priority || undefined,
          tag: filter.tag || undefined,
        };
      }
      const res = await fetchWithTimeout("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string; assigned_contacts?: number };
      if (!res.ok) {
        const msg = d.error ?? "Σφάλμα";
        setFormErr(msg);
        showToast(msg, "error");
        return;
      }
      showToast("Η καμπάνια δημιουργήθηκε επιτυχώς.", "success");
      setModal(false);
      setName("");
      setDescription("");
      setCampaignChannel("call");
      setCampaignTypeId("");
      setConcurrentLines(3);
      setSelectedContactIds([]);
      setFilter({ call_status: "", area: "", municipality: "", priority: "", tag: "" });
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Σφάλμα δικτύου";
      setFormErr(msg);
      showToast(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  const totalN = campaigns.length;
  const activeN = campaigns.filter((c) => c.status === "active").length;
  const doneN = campaigns.filter((c) => c.status === "completed").length;

  return (
    <div className="space-y-8 max-md:space-y-6">
      <section className="data-hq-card relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm [data-theme='light']:bg-white [data-theme='light']:shadow-[0_2px_20px_rgba(0,0,0,0.06)] sm:p-6">
        <div className="pointer-events-none absolute -right-12 -top-8 h-40 w-40 rounded-full bg-[var(--accent-gold)]/10 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">Καμπάνιες</h1>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Θέση κλήσεων, αποτελέσματα & ίχνος επικοινωνίας.
              </p>
            </div>
            <button
              type="button"
              className={goldCta + " w-full min-w-0 sm:w-auto sm:self-center"}
              onClick={() => {
                setFormErr(null);
                setSelectedContactIds([]);
                setConcurrentLines(3);
                setModal(true);
              }}
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              <span>Νέα Καμπάνια</span>
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <TopMetric label="Σύνολο" value={totalN} sub="Όλες οι καταχωρήσεις" icon={BarChart3} />
            <TopMetric label="Ενεργές" value={activeN} sub="Σε εξέλιξη" icon={Radio} />
            <TopMetric label="Ολοκληρώθηκαν" value={doneN} sub="Έκλεισαν" icon={CheckCircle2} />
          </div>
        </div>
      </section>

      {loading && <p className="text-sm text-[var(--text-muted)]">Φόρτωση καμπανιών…</p>}

      {!loading && campaigns.length === 0 && (
        <p className="text-center text-sm text-[var(--text-secondary)]">
          Δεν έχετε ακόμα δημιουργήσει καμία καμπάνια.
        </p>
      )}

      <ul className="flex flex-col gap-4">
        {campaigns.map((c) => {
          const isActive = c.status === "active";
          const isDone = c.status === "completed";
          const s = c.stats;
          const dialable = c.withPhone ?? c.contactTotal;
          const hasPool = dialable > 0;
          const barPct = hasPool ? Math.min(100, c.progress) : s.total > 0 ? 100 : 0;
          const leftBorder = isActive
            ? "border-l-[var(--accent-gold)]"
            : isDone
              ? "border-l-emerald-500"
              : "border-l-stone-400/70 [data-theme='light']:border-l-stone-300";
          const isWhatsApp = c.channel === "whatsapp";
          return (
            <li
              key={c.id}
              className={[
                "data-hq-card relative flex w-full max-w-full flex-col overflow-hidden rounded-2xl border border-[var(--border)] border-l-4 bg-[var(--bg-card)] p-5 shadow-sm [data-theme='light']:bg-white [data-theme='light']:shadow-[0_2px_20px_rgba(0,0,0,0.06)]",
                leftBorder,
              ].join(" ")}
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                    <h2 className="min-w-0 text-[1.125rem] font-bold leading-tight text-[var(--text-primary)]">
                      {c.name}
                    </h2>
                    <span
                      className={
                        statusBadge +
                        (isActive
                          ? " border-[#C9A84C]/45 bg-[var(--accent-gold)]/10 text-[var(--accent-gold)]"
                          : isDone
                            ? " border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
                            : " border-[var(--border)] bg-[var(--bg-elevated)]/50 text-[var(--text-secondary)]")
                      }
                    >
                      {isActive ? "Ενεργή" : isDone ? "Ολοκληρώθηκε" : c.status ?? "—"}
                    </span>
                    {isWhatsApp ? (
                      <span
                        className={
                          statusBadge +
                          " inline-flex items-center gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                        }
                      >
                        <MessageCircle className="h-3 w-3" />
                        WhatsApp
                      </span>
                    ) : (
                      <span
                        className={
                          statusBadge +
                          " inline-flex items-center gap-1 border-sky-500/30 bg-sky-500/10 text-sky-200"
                        }
                      >
                        <Phone className="h-3 w-3" />
                        Κλήσεις
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                    {c.created_at
                      ? formatDateAthens(c.created_at, {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        })
                      : "—"}
                    {c.started_at ? ` · Έναρξη: ${formatDateAthens(c.started_at)}` : ""}
                  </p>
                  {c.retell_agent_name ? (
                    <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                      Agent: <span className="font-medium">{c.retell_agent_name}</span>
                    </p>
                  ) : null}
                </div>
                {isWhatsApp ? (
                  <MessageCircle className="h-5 w-5 shrink-0 text-emerald-400 opacity-90" strokeWidth={2} aria-hidden />
                ) : (
                  <Megaphone className="h-5 w-5 shrink-0 text-[#C9A84C] opacity-90" strokeWidth={2} aria-hidden />
                )}
              </div>

              {c.description ? (
                <p className="mt-2 line-clamp-2 text-sm text-[var(--text-secondary)]">{c.description}</p>
              ) : null}

              <div className="mt-4">
                <div className="mb-1 flex items-center justify-between text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                  <span>Πρόοδος (με αριθμό)</span>
                  <span className="text-[var(--text-secondary)]">
                    {hasPool
                      ? `${c.callsMade} / ${dialable}`
                      : s.total
                        ? `${s.total} κλήση/εις`
                        : "0 / 0"}
                  </span>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--bg-elevated)]/90 ring-1 ring-inset ring-[#C9A84C]/12">
                  <div
                    className="h-full rounded-full bg-[#C9A84C] shadow-[0_0_10px_rgba(201,168,76,0.35)]"
                    style={{ width: `${barPct}%`, transition: "width 0.25s ease" }}
                  />
                </div>
                {c.withoutPhone != null && c.withoutPhone > 0 ? (
                  <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                    {c.withPhone ?? dialable} με αριθμό · {c.withoutPhone} χωρίς (εξαιρούνται)
                  </p>
                ) : null}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2.5">
                <CampaignStat
                  label="Θετικοί"
                  value={s.positive}
                  numClass="text-emerald-500"
                  icon={CheckCircle2}
                />
                <CampaignStat
                  label="Αρνητικοί"
                  value={s.negative}
                  numClass="text-rose-500"
                  icon={XCircle}
                />
                <CampaignStat
                  label="Δεν Απάντησαν"
                  value={s.noAnswer}
                  numClass="text-amber-600"
                  icon={PhoneOff}
                />
              </div>

              {c.sentiment && c.sentiment.trendDelta != null && (
                <p className="mt-3 text-xs text-[var(--text-muted)]">
                  Θετική αναλογία {c.sentiment.positiveRate}%
                  {c.sentiment.trendDelta >= 0 ? (
                    <span className="ml-1 font-semibold text-emerald-500">+{c.sentiment.trendDelta}%</span>
                  ) : (
                    <span className="ml-1 font-semibold text-rose-400">{c.sentiment.trendDelta}%</span>
                  )}{" "}
                  <span>έναντι προηγούμενης</span>
                </p>
              )}

              <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
                <Link
                  href={`/campaigns/${c.id}`}
                  className="inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-transparent px-3 text-sm font-medium text-[var(--text-primary)] transition hover:border-[#C9A84C]/40 hover:bg-[var(--bg-elevated)]/60 sm:min-w-[6.5rem] sm:flex-none"
                >
                  <FileText className="h-4 w-4 opacity-70" />
                  Προβολή
                </Link>
                {!isWhatsApp && (
                  <button
                    type="button"
                    className={goldCta + " min-w-0 flex-1 sm:flex-none sm:px-4"}
                    disabled={dialingId === c.id || !isActive || !dialable}
                    title={!dialable ? "Δεν υπάρχουν επαφές με αριθμό" : undefined}
                    onClick={async () => {
                      setDialingId(c.id);
                      setFormErr(null);
                      try {
                        const r = await fetchWithTimeout(`/api/campaigns/${c.id}/dial-next`, {
                          method: "POST",
                        });
                        const j = (await r.json().catch(() => ({}))) as {
                          error?: string;
                          results?: Array<{ ok: boolean }>;
                        };
                        if (!r.ok) {
                          setFormErr(j.error ?? "Σφάλμα");
                          return;
                        }
                        const n = (j.results ?? []).filter((x) => x.ok).length;
                        if (n > 0) {
                          showToast(`Ξεκίνησαν ${n} κλήσεις`, "success");
                          void load();
                        }
                      } finally {
                        setDialingId(null);
                      }
                    }}
                  >
                    {dialingId === c.id ? (
                      "Σύνδεση…"
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5" />
                        <span>Εκκίνηση Κλήσεων</span>
                      </>
                    )}
                  </button>
                )}
                {!isWhatsApp && s.noAnswer > 0 && isActive && (
                  <button
                    type="button"
                    className="inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 text-sm font-semibold text-amber-200 transition hover:bg-amber-500/20 sm:flex-none"
                    disabled={redialingId === c.id}
                    title="Επανεκκίνηση επαφών που δεν απάντησαν"
                    onClick={async () => {
                      setRedialingId(c.id);
                      setFormErr(null);
                      try {
                        const r = await fetchWithTimeout(
                          `/api/campaigns/${c.id}/dial-next?redial_no_answer=1`,
                          { method: "POST" },
                        );
                        const j = (await r.json().catch(() => ({}))) as {
                          error?: string;
                          results?: Array<{ ok: boolean }>;
                        };
                        if (!r.ok) {
                          setFormErr(j.error ?? "Σφάλμα");
                          showToast(j.error ?? "Σφάλμα", "error");
                          return;
                        }
                        const n = (j.results ?? []).filter((x) => x.ok).length;
                        showToast(
                          n > 0
                            ? `Επανεκκίνηση: ${n} κλήσεις`
                            : "Δεν ξεκίνησαν κλήσεις",
                          n > 0 ? "success" : "error",
                        );
                        if (n > 0) void load();
                      } finally {
                        setRedialingId(null);
                      }
                    }}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {redialingId === c.id ? "…" : "Επανεκκίνηση"}
                  </button>
                )}
                {isActive ? (
                  <button
                    type="button"
                    className="h-10 min-w-0 flex-1 rounded-xl border-2 border-emerald-500/50 bg-transparent px-3 text-sm font-semibold text-emerald-500 transition hover:bg-emerald-500/10 sm:min-w-[7rem] sm:flex-none [data-theme='light']:text-emerald-600"
                    disabled={togglingId === c.id}
                    onClick={async () => {
                      setTogglingId(c.id);
                      try {
                        const r = await fetchWithTimeout(`/api/campaigns/${c.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ status: "completed" }),
                        });
                        if (r.ok) void load();
                      } finally {
                        setTogglingId(null);
                      }
                    }}
                  >
                    {togglingId === c.id ? "…" : "Ολοκλήρωση"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="h-10 min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-transparent px-3 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--bg-elevated)]/80 sm:min-w-[7rem] sm:flex-none"
                    disabled={togglingId === c.id}
                    onClick={async () => {
                      setTogglingId(c.id);
                      try {
                        const r = await fetchWithTimeout(`/api/campaigns/${c.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ status: "active" }),
                        });
                        if (r.ok) void load();
                      } finally {
                        setTogglingId(null);
                      }
                    }}
                  >
                    {togglingId === c.id ? "…" : "Επανενεργοπ."}
                  </button>
                )}
                <button
                  type="button"
                  className="group inline-flex h-10 w-10 shrink-0 items-center justify-center self-center rounded-xl border border-red-500/40 bg-transparent text-red-500 transition hover:border-red-500/70 hover:bg-red-500/5 sm:ml-0.5"
                  title="Διαγραφή"
                  disabled={deletingId === c.id}
                  onClick={async () => {
                    if (!confirm("Διαγραφή καμπάνιας; Δεν ανακαλείται.")) return;
                    setDeletingId(c.id);
                    setFormErr(null);
                    try {
                      const r = await fetchWithTimeout(`/api/campaigns/${c.id}`, { method: "DELETE" });
                      const d = (await r.json().catch(() => ({}))) as { error?: string };
                      if (!r.ok) {
                        setFormErr(d.error ?? "Σφάλμα διαγραφής");
                        return;
                      }
                      await load();
                    } finally {
                      setDeletingId(null);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="sr-only">Διαγραφή</span>
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {formErr && !modal && (
        <p
          className="fixed bottom-24 left-1/2 z-50 max-md:bottom-28 -translate-x-1/2 rounded-lg border border-red-500/40 bg-[var(--bg-card)] px-4 py-2 text-sm text-red-200 shadow-xl"
          role="alert"
        >
          {formErr}
        </p>
      )}

      <CenteredModal
        open={modal}
        onClose={() => setModal(false)}
        title="Νέα Καμπάνια"
        className="w-full max-w-[720px]"
        ariaLabel="Νέα καμπάνια"
        footer={
          <>
            <button
              type="button"
              className={lux.btnSecondary + " !min-h-11 w-full !justify-center sm:w-auto"}
              onClick={() => setModal(false)}
              disabled={saving}
            >
              Άκυρο
            </button>
            <FormSubmitButton
              type="submit"
              form="campaign-create-form"
              loading={saving}
              variant="gold"
              className={goldCta + " !h-12 !min-w-0 !w-full !rounded-xl sm:!w-auto sm:!px-6"}
            >
              Αποθήκευση
            </FormSubmitButton>
          </>
        }
      >
        <form id="campaign-create-form" className="flex min-h-0 w-full flex-col" onSubmit={createCampaign}>
          <p className="mb-4 text-xs text-[var(--text-muted)]">
            Όνομα, περιγραφή και ποιες επαφές θα τρέχουν (φίλτρα ή επιλεγμένες από αναζήτηση).
          </p>

          <div className="space-y-4">
            {formErr && (
              <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {formErr}
              </p>
            )}

            {selectedContactIds.length > 0 && (
              <div className="rounded-xl border border-[#C9A84C]/30 bg-[#C9A84C]/10 px-3 py-2 text-sm text-[var(--text-primary)]">
                Επιλεγμένες επαφές από αναζήτηση:{" "}
                <strong className="tabular-nums">{selectedContactIds.length}</strong>
                <button
                  type="button"
                  className="ml-2 text-xs text-[#C9A84C] underline"
                  onClick={() => setSelectedContactIds([])}
                >
                  Καθαρισμός — χρήση φίλτρων
                </button>
              </div>
            )}

            <div>
              <label className={lux.label} htmlFor="c-name">
                Όνομα<span className="ml-0.5 text-red-500" aria-hidden>*</span>
              </label>
              <input
                id="c-name"
                className={[lux.input, "!text-base", nameFieldErr ? lux.inputError : ""]
                  .filter(Boolean)
                  .join(" ")}
                required
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (nameFieldErr) setNameFieldErr(null);
                }}
                onBlur={() => {
                  if (!name.trim()) setNameFieldErr("Υποχρεωτικό όνομα");
                }}
                placeholder="π.χ. Θερινή εξόρμηση 2025"
                aria-invalid={nameFieldErr ? true : undefined}
              />
              {nameFieldErr && (
                <p className="mt-1 text-xs text-red-400" role="alert">
                  {nameFieldErr}
                </p>
              )}
            </div>
            <div>
              <label className={lux.label} htmlFor="c-desc">
                Περιγραφή (προαιρετική)
              </label>
              <textarea
                id="c-desc"
                className={lux.textarea + " !min-h-[88px] !text-base"}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Σύντομη περιγραφή στόχων…"
              />
            </div>

            <div>
              <label className={lux.label} htmlFor="c-ctype">
                Τύπος καμπάνιας (AI / Retell)
              </label>
              <HqSelect
                id="c-ctype"
                className="!min-h-11 !text-base"
                value={campaignTypeId}
                onChange={(e) => setCampaignTypeId(e.target.value)}
              >
                <option value="">— Επιλέξτε —</option>
                {campaignTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </HqSelect>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                Agent που θα χρησιμοποιηθεί:{" "}
                <span className="font-mono text-[var(--text-secondary)]">{agentPreview}</span>
              </p>
            </div>

            <div>
              <label className={lux.label} htmlFor="c-ch">
                Κανάλι
              </label>
              <HqSelect
                id="c-ch"
                className="!min-h-11 !text-base"
                value={campaignChannel}
                onChange={(e) => setCampaignChannel(e.target.value as "call" | "whatsapp")}
              >
                <option value="call">Κλήσεις (Retell)</option>
                <option value="whatsapp">WhatsApp</option>
              </HqSelect>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                Το κανάλι αποθηκεύεται στο CRM· για WhatsApp στείλτε μηνύματα από μαζικές ενέργειες επαφών.
              </p>
            </div>

            <div>
              <label className={lux.label} htmlFor="c-conc">
                Παράλληλες γραμμές κλήσης
              </label>
              <input
                id="c-conc"
                type="number"
                min={CONCURRENT_LINES_MIN}
                max={CONCURRENT_LINES_MAX}
                className={lux.input + " !min-h-11 !text-base tabular-nums"}
                value={concurrentLines}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  setConcurrentLines(Number.isFinite(n) ? n : CONCURRENT_LINES_MIN);
                }}
              />
            </div>

            {selectedContactIds.length === 0 && (
              <>
                <p className="text-xs font-medium uppercase tracking-wider text-[#C9A84C]">
                  Φιλτράρισμα επαφών
                </p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Χρειάζεται τουλάχιστον ένα κριτήριο — ή επιλέξτε επαφές από{" "}
                  <Link href="/contacts/search" className="text-[#C9A84C] underline">
                    προηγμένη αναζήτηση
                  </Link>{" "}
                  και «Νέα καμπάνια».
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={lux.label} htmlFor="c-st">
                      Κατάσταση κλήσης
                    </label>
                    <HqSelect
                      id="c-st"
                      className="!min-h-11 !text-base"
                      value={filter.call_status}
                      onChange={(e) => setFilter((f) => ({ ...f, call_status: e.target.value }))}
                    >
                      <option value="">Όλες</option>
                      <option value="Pending">Αναμονή</option>
                      <option value="Positive">Θετική</option>
                      <option value="Negative">Αρνητική</option>
                      <option value="No Answer">Δεν απάντησε</option>
                    </HqSelect>
                  </div>
                  <div>
                    <label className={lux.label} htmlFor="c-pri">
                      Προτεραιότητα
                    </label>
                    <HqSelect
                      id="c-pri"
                      className="!min-h-11 !text-base"
                      value={filter.priority}
                      onChange={(e) => setFilter((f) => ({ ...f, priority: e.target.value }))}
                    >
                      <option value="">Όλες</option>
                      <option value="High">Υψηλή</option>
                      <option value="Medium">Μεσαία</option>
                      <option value="Low">Χαμηλή</option>
                    </HqSelect>
                  </div>
                  <div>
                    <label className={lux.label} htmlFor="c-area">
                      Περιοχή
                    </label>
                    <HqSelect
                      id="c-area"
                      className="!min-h-11 !text-base"
                      value={filter.area}
                      onChange={(e) => setFilter((f) => ({ ...f, area: e.target.value }))}
                    >
                      <option value="">Όλες</option>
                      {(options?.areas ?? []).map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </HqSelect>
                  </div>
                  <div>
                    <label className={lux.label} htmlFor="c-mun">
                      Δήμος που ψηφίζει (περίπου)
                    </label>
                    <HqSelect
                      id="c-mun"
                      className="!min-h-11 !text-base"
                      value={filter.municipality}
                      onChange={(e) => setFilter((f) => ({ ...f, municipality: e.target.value }))}
                    >
                      <option value="">Όλοι</option>
                      {(options?.municipalities ?? []).map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </HqSelect>
                  </div>
                  <div className="sm:col-span-2">
                    <label className={lux.label} htmlFor="c-tag">
                      Ετικέτα (ακριβές tag)
                    </label>
                    <div className="relative">
                      <input
                        id="c-tag"
                        className={lux.input + " !pl-9 !text-base"}
                        value={filter.tag}
                        onChange={(e) => setFilter((f) => ({ ...f, tag: e.target.value }))}
                      />
                      <LayoutGrid className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                    </div>
                  </div>
                </div>
              </>
            )}

            <div
              className="flex items-center justify-between gap-2 rounded-xl border border-[#C9A84C]/25 bg-[#050D1A]/60 px-4 py-3"
              role="status"
              aria-live="polite"
            >
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#C9A84C]/15 text-[#C9A84C]">
                  <Search className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#C9A84C]">
                    Προεπισκόπηση
                  </p>
                  <p className="text-sm text-[var(--text-primary)]">
                    {previewing || previewWithPhone == null
                      ? "Επαφές που ταιριάζουν"
                      : `${previewWithPhone} με αριθμό / ${previewWithoutPhone ?? 0} χωρίς`}
                  </p>
                </div>
              </div>
              <p className="shrink-0 text-2xl font-bold tabular-nums text-[#C9A84C] sm:text-3xl">
                {previewing || previewCount == null ? "—" : previewCount}
              </p>
            </div>
          </div>
        </form>
      </CenteredModal>
    </div>
  );
}

function TopMetric({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: number;
  sub: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)]/30 p-4 [data-theme='light']:bg-slate-50/90">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#C9A84C]/20 bg-[var(--accent-gold)]/5 text-[#C9A84C] [data-theme='light']:bg-amber-50 [data-theme='light']:text-amber-800">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">{label}</p>
        <p
          className="text-2xl font-bold tabular-nums text-[var(--accent-gold)] [data-theme='light']:text-amber-800 sm:text-3xl"
          style={{ fontFeatureSettings: '"tnum"' }}
        >
          {value}
        </p>
        <p className="text-[10px] text-[var(--text-muted)] sm:text-xs">{sub}</p>
      </div>
    </div>
  );
}

function CampaignStat({
  label,
  value,
  numClass,
  icon: Icon,
}: {
  label: string;
  value: number;
  numClass: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex flex-col justify-center rounded-xl border border-[var(--border)]/80 bg-[var(--bg-elevated)]/25 p-2.5 [data-theme='light']:border-slate-200/90 [data-theme='light']:bg-slate-50/80">
      <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        <Icon className={`h-3 w-3 ${numClass}`} />
        {label}
      </span>
      <span
        className={["mt-0.5 text-lg font-bold tabular-nums sm:text-xl", numClass].join(" ")}
        style={{ fontFeatureSettings: '"tnum"' }}
      >
        {value}
      </span>
    </div>
  );
}
