"use client";

import Link from "next/link";
import { BarChart3, CheckCircle2, FileText, LayoutGrid, Megaphone, Play, Search, Plus, Radio, Trash2 } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState, type ComponentType } from "react";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { lux } from "@/lib/luxury-styles";
import type { CampaignTypeRow } from "@/lib/campaign-types";

type OutcomeStats = { total: number; positive: number; negative: number; noAnswer: number };

type Campaign = {
  id: string;
  name: string;
  started_at: string | null;
  created_at: string | null;
  description: string | null;
  status: string;
  channel?: string;
  stats: OutcomeStats;
  progress: number;
  callsMade: number;
  contactTotal: number;
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

const statusBadge =
  "inline-flex min-h-7 min-w-0 max-w-full shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide";

const goldCta =
  "no-mobile-scale inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-full border-2 border-[#8B6914] bg-gradient-to-b from-[#E8C96B] to-[#8B6914] px-4 text-xs font-bold text-[#0A1628] shadow-sm transition duration-200 hover:brightness-110 sm:text-sm";

export default function CampaignsPage() {
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
  const [filter, setFilter] = useState<NewFilter>({
    call_status: "",
    area: "",
    municipality: "",
    priority: "",
    tag: "",
  });
  const [options, setOptions] = useState<FieldOptions | null>(null);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [dialingId, setDialingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

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
    const q = new URLSearchParams();
    if (filter.call_status) q.set("call_status", filter.call_status);
    if (filter.area) q.set("area", filter.area);
    if (filter.municipality) q.set("municipality", filter.municipality);
    if (filter.priority) q.set("priority", filter.priority);
    if (filter.tag) q.set("tag", filter.tag);
    if (!q.toString()) {
      setPreviewCount(null);
      return;
    }
    setPreviewing(true);
    const t = setTimeout(() => {
      fetchWithTimeout(`/api/campaigns/preview?${q.toString()}`)
        .then((r) => r.json())
        .then((d) => setPreviewCount(typeof d.count === "number" ? d.count : null))
        .catch(() => setPreviewCount(null))
        .finally(() => setPreviewing(false));
    }, 300);
    return () => clearTimeout(t);
  }, [modal, filter]);

  const createCampaign = async (e: FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    setSaving(true);
    try {
      const f = {
        call_status: filter.call_status || undefined,
        area: filter.area || undefined,
        municipality: filter.municipality || undefined,
        priority: filter.priority || undefined,
        tag: filter.tag || undefined,
      };
      const res = await fetchWithTimeout("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || null,
          filter: f,
          channel: campaignChannel,
          campaign_type_id: campaignTypeId || null,
        }),
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string; assigned_contacts?: number };
      if (!res.ok) {
        setFormErr(d.error ?? "Σφάλμα");
        return;
      }
      setModal(false);
      setName("");
      setDescription("");
      setCampaignChannel("call");
      setCampaignTypeId("");
      setFilter({ call_status: "", area: "", municipality: "", priority: "", tag: "" });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const totalN = campaigns.length;
  const activeN = campaigns.filter((c) => c.status === "active").length;
  const doneN = campaigns.filter((c) => c.status === "completed").length;

  return (
    <div className="space-y-8 max-md:space-y-6">
      <section
        className="data-hq-card relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm [data-theme='light']:bg-white [data-theme='light']:shadow-[0_2px_20px_rgba(0,0,0,0.06)] sm:p-6"
      >
        <div className="pointer-events-none absolute -right-12 -top-8 h-40 w-40 rounded-full bg-[var(--accent-gold)]/10 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">Καμπάνιες</h1>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">Θέση κλήσεων, αποτελέσματα & ίχνος επικοινωνίας.</p>
            </div>
            <button
              type="button"
              className={goldCta + " w-full min-w-0 sm:w-auto sm:self-center"}
              onClick={() => {
                setFormErr(null);
                setModal(true);
              }}
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              <span>Νέα Καμπάνια</span>
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <TopMetric
              label="Σύνολο"
              value={totalN}
              sub="Όλες οι καταχωρήσεις"
              icon={BarChart3}
            />
            <TopMetric
              label="Ενεργές"
              value={activeN}
              sub="Σε εξέλιξη"
              icon={Radio}
            />
            <TopMetric
              label="Ολοκληρώθηκαν"
              value={doneN}
              sub="Έκλεισαν"
              icon={CheckCircle2}
            />
          </div>
        </div>
      </section>

      {loading && (
        <p className="text-sm text-[var(--text-muted)]">Φόρτωση καμπανιών…</p>
      )}

      {!loading && campaigns.length === 0 && (
        <p className="text-center text-sm text-[var(--text-secondary)]">Δεν έχετε ακόμα δημιουργήσει καμία καμπάνια.</p>
      )}

      <ul className="flex flex-col gap-4">
        {campaigns.map((c) => {
          const isActive = c.status === "active";
          const isDone = c.status === "completed";
          const s = c.stats;
          const hasPool = c.contactTotal > 0;
          const barPct = hasPool ? Math.min(100, c.progress) : s.total > 0 ? 100 : 0;
          const leftBorder = isActive
            ? "border-l-[var(--accent-gold)]"
            : isDone
              ? "border-l-emerald-500"
              : "border-l-stone-400/70 [data-theme='light']:border-l-stone-300";
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
                    <h2 className="min-w-0 text-[1.125rem] font-bold leading-tight text-[var(--text-primary)]">{c.name}</h2>
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
                    {c.channel === "whatsapp" ? (
                      <span
                        className={
                          statusBadge + " border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                        }
                      >
                        WhatsApp
                      </span>
                    ) : (
                      <span className={statusBadge + " border-sky-500/30 bg-sky-500/10 text-sky-200"}>Κλήσεις</span>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                    {c.created_at
                      ? new Date(c.created_at).toLocaleDateString("el-GR", { day: "2-digit", month: "2-digit", year: "numeric" })
                      : "—"}
                    {c.started_at
                      ? ` · Έναρξη: ${new Date(c.started_at).toLocaleDateString("el-GR")}`
                      : ""}
                  </p>
                </div>
                <Megaphone
                  className="h-5 w-5 shrink-0 text-[#C9A84C] opacity-90 [data-theme='light']:text-amber-700"
                  strokeWidth={2}
                  aria-hidden
                />
              </div>

              {c.description ? (
                <p className="mt-2 line-clamp-2 text-sm text-[var(--text-secondary)]">{c.description}</p>
              ) : null}

              <div className="mt-4">
                <div className="mb-1 flex items-center justify-between text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                  <span>Κλήσεις {hasPool ? "προς επαφές" : ""}</span>
                  <span className="text-[var(--text-secondary)]">
                    {hasPool
                      ? `${c.callsMade} / ${c.contactTotal}`
                      : s.total
                        ? `${s.total} κλήση/εις (χωρίς δεσμ. περιοχών)`
                        : "0 / 0"}
                  </span>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--bg-elevated)]/90 ring-1 ring-inset ring-[#C9A84C]/12">
                  <div
                    className="h-full rounded-full bg-[#C9A84C] shadow-[0_0_10px_rgba(201,168,76,0.35)]"
                    style={{ width: `${barPct}%`, transition: "width 0.25s ease" }}
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2.5">
                <CampaignStat label="Σύνολο" value={s.total} numClass="text-slate-600 [data-theme='light']:text-slate-800" />
                <CampaignStat label="Θετικοί" value={s.positive} numClass="text-emerald-500" />
                <CampaignStat label="Αρνητικοί" value={s.negative} numClass="text-rose-500" />
                <CampaignStat label="Δεν Απάντησαν" value={s.noAnswer} numClass="text-amber-600" />
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
                <button
                  type="button"
                  className={goldCta + " flex-1 min-w-0 sm:flex-none sm:px-4"}
                  disabled={dialingId === c.id || !isActive || !c.contactTotal}
                  title={!c.contactTotal ? "Δεν υπάρχει αναλυτική λίστα επαφών" : undefined}
                  onClick={async () => {
                    setDialingId(c.id);
                    setFormErr(null);
                    const maxPerRun = 25;
                    let started = 0;
                    try {
                      const maxBatches = Math.ceil(maxPerRun / 3);
                      for (let i = 0; i < maxBatches; i += 1) {
                        const r = await fetchWithTimeout(`/api/campaigns/${c.id}/dial-next`, { method: "POST" });
                        const j = (await r.json().catch(() => ({}))) as {
                          error?: string;
                          results?: Array<{ ok: boolean }>;
                        };
                        if (!r.ok) {
                          const msg = j.error ?? "Σφάλμα";
                          if (r.status === 400 && msg.includes("όλες")) {
                            if (started === 0) setFormErr("Όλες οι επαφές έχουν ήδη κληθεί.");
                            break;
                          }
                          setFormErr(msg);
                          return;
                        }
                        const n = (j.results ?? []).filter((x) => x.ok).length;
                        if (n === 0) break;
                        started += n;
                        if (started >= maxPerRun) break;
                      }
                      if (started > 0) void load();
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
        <p className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-red-500/40 bg-[var(--bg-card)] px-4 py-2 text-sm text-red-200 shadow-xl max-md:bottom-28" role="alert">
          {formErr}
        </p>
      )}

      {modal && (
        <div className={lux.modalOverlay + " !z-50 !items-stretch !p-0 sm:!items-center sm:!p-4"} onClick={() => setModal(false)}>
          <form
            className={lux.modalPanel + " flex w-full !max-w-[720px] flex-1 !flex-col overflow-hidden sm:!max-h-[min(100dvh,90vh)]"}
            onClick={(e) => e.stopPropagation()}
            onSubmit={createCampaign}
          >
            <div className="mx-auto mt-2 h-1 w-11 rounded-full bg-white/20 sm:hidden" aria-hidden />
            <div className="shrink-0 border-b border-[var(--border)] bg-[var(--bg-secondary)]/50 px-5 py-4">
              <h2 className="text-xl font-bold text-[var(--text-primary)]">Νέα Καμπάνια</h2>
              <p className="text-xs text-[var(--text-muted)]">Όνομα, περιγραφή και ποιες επαφές θα τρέχουν (φίλτρα).</p>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {formErr && (
                <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{formErr}</p>
              )}

              <div>
                <label className={lux.label} htmlFor="c-name">Όνομα</label>
                <input
                  id="c-name"
                  className={lux.input + " !text-base"}
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="π.χ. Θερινή εξόρμηση 2025"
                />
              </div>
              <div>
                <label className={lux.label} htmlFor="c-desc">Περιγραφή (προαιρετική)</label>
                <textarea
                  id="c-desc"
                  className={lux.textarea + " !min-h-[88px] !text-base"}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>

              <div>
                <label className={lux.label} htmlFor="c-ctype">Τύπος καμπάνιας (AI / Retell)</label>
                <select
                  id="c-ctype"
                  className={lux.select + " !min-h-11 !text-base"}
                  value={campaignTypeId}
                  onChange={(e) => setCampaignTypeId(e.target.value)}
                >
                  <option value="">— Επιλέξτε —</option>
                  {campaignTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 font-mono text-[11px] text-[var(--text-muted)]">
                  {campaignTypeId
                    ? (() => {
                        const t = campaignTypes.find((x) => x.id === campaignTypeId);
                        return t?.retell_agent_id
                          ? `Retell agent: ${t.retell_agent_id}`
                          : "Χωρίς agent στον τύπο — θα χρησιμοποιηθεί RETELL_AGENT_ID.";
                      })()
                    : "Προαιρετικό· ορίζει τον Retell agent για κλήσεις."}
                </p>
              </div>

              <div>
                <label className={lux.label} htmlFor="c-ch">Κανάλι</label>
                <select
                  id="c-ch"
                  className={lux.select + " !min-h-11 !text-base"}
                  value={campaignChannel}
                  onChange={(e) => setCampaignChannel(e.target.value as "call" | "whatsapp")}
                >
                  <option value="call">Κλήσεις (Retell)</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                  Το κανάλι αποθηκεύεται στο CRM· για WhatsApp στείλτε μηνύματα από μαζικές ενέργειες επαφών.
                </p>
              </div>

              <p className="text-xs font-medium uppercase tracking-wider text-[#C9A84C]">Φιλτράρισμα επαφών</p>
              <p className="text-[11px] text-[var(--text-muted)]">Χρειάζεται τουλάχιστον ένα κριτήριο.</p>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={lux.label} htmlFor="c-st">Κατάσταση κλήσης</label>
                  <select
                    id="c-st"
                    className={lux.select + " !min-h-11 !text-base"}
                    value={filter.call_status}
                    onChange={(e) => setFilter((f) => ({ ...f, call_status: e.target.value }))}
                  >
                    <option value="">Όλες</option>
                    <option value="Pending">Αναμονή</option>
                    <option value="Positive">Θετική</option>
                    <option value="Negative">Αρνητική</option>
                    <option value="No Answer">Δεν απάντησε</option>
                  </select>
                </div>
                <div>
                  <label className={lux.label} htmlFor="c-pri">Προτεραιότητα</label>
                  <select
                    id="c-pri"
                    className={lux.select + " !min-h-11 !text-base"}
                    value={filter.priority}
                    onChange={(e) => setFilter((f) => ({ ...f, priority: e.target.value }))}
                  >
                    <option value="">Όλες</option>
                    <option value="High">Υψηλή</option>
                    <option value="Medium">Μεσαία</option>
                    <option value="Low">Χαμηλή</option>
                  </select>
                </div>
                <div>
                  <label className={lux.label} htmlFor="c-area">Περιοχή</label>
                  <select
                    id="c-area"
                    className={lux.select + " !min-h-11 !text-base"}
                    value={filter.area}
                    onChange={(e) => setFilter((f) => ({ ...f, area: e.target.value }))}
                  >
                    <option value="">Όλες</option>
                    {(options?.areas ?? []).map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={lux.label} htmlFor="c-mun">Δήμος (περίπου)</label>
                  <select
                    id="c-mun"
                    className={lux.select + " !min-h-11 !text-base"}
                    value={filter.municipality}
                    onChange={(e) => setFilter((f) => ({ ...f, municipality: e.target.value }))}
                  >
                    <option value="">Όλοι</option>
                    {(options?.municipalities ?? []).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className={lux.label} htmlFor="c-tag">Ετικέτα (ακριβές tag)</label>
                  <div className="relative">
                    <input
                      id="c-tag"
                      className={lux.input + " !text-base !pl-9"}
                      value={filter.tag}
                      onChange={(e) => setFilter((f) => ({ ...f, tag: e.target.value }))}
                    />
                    <LayoutGrid className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                  </div>
                </div>
              </div>

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
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#C9A84C]">Προεπισκόπηση</p>
                    <p className="text-sm text-[var(--text-primary)]">Επαφές που ταιριάζουν</p>
                  </div>
                </div>
                <p className="shrink-0 text-2xl font-bold text-[#C9A84C] tabular-nums sm:text-3xl">
                  {previewing || previewCount == null ? "—" : previewCount}
                </p>
              </div>
            </div>

            <div className="shrink-0 border-t border-[var(--border)] bg-[#050D1A]/50 px-5 py-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-2">
                <button type="button" className={lux.btnSecondary + " !min-h-11 w-full !justify-center sm:w-auto"} onClick={() => setModal(false)} disabled={saving}>
                  Άκυρο
                </button>
                <button
                  type="submit"
                  className={goldCta + " !h-12 !w-full !rounded-xl sm:!w-auto !min-w-0 sm:!px-6"}
                  disabled={saving}
                >
                  {saving ? "…" : "Δημιουργία"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
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
        <p className="text-2xl font-bold tabular-nums text-[var(--accent-gold)] [data-theme='light']:text-amber-800 sm:text-3xl" style={{ fontFeatureSettings: '"tnum"' }}>
          {value}
        </p>
        <p className="text-[10px] text-[var(--text-muted)] sm:text-xs">{sub}</p>
      </div>
    </div>
  );
}

function CampaignStat({ label, value, numClass }: { label: string; value: number; numClass: string }) {
  return (
    <div className="flex flex-col justify-center rounded-xl border border-[var(--border)]/80 bg-[var(--bg-elevated)]/25 p-2.5 [data-theme='light']:border-slate-200/90 [data-theme='light']:bg-slate-50/80">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</span>
      <span className={["mt-0.5 text-lg font-bold tabular-nums sm:text-xl", numClass].join(" ")} style={{ fontFeatureSettings: '"tnum"' }}>
        {value}
      </span>
    </div>
  );
}
