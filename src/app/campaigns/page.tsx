"use client";

import Link from "next/link";
import {
  BarChart3,
  CheckCircle2,
  FileText,
  Link2,
  Megaphone,
  MessageCircle,
  Minus,
  Percent,
  Phone,
  PhoneMissed,
  Play,
  Plus,
  Radio,
  Search,
  Target,
  Trash2,
  XCircle,
} from "lucide-react";
import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import { useSearchParams } from "next/navigation";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { formatDateAthens } from "@/lib/date-format";
import { lux } from "@/lib/luxury-styles";
import type { CampaignTypeRow } from "@/lib/campaign-types";
import {
  clampConcurrentLines,
  CONCURRENT_LINES_MAX,
  CONCURRENT_LINES_MIN,
} from "@/lib/campaign-concurrent-lines";
import { CONTACT_CALL_STATUS_OPTIONS } from "@/lib/call-status-options";
import { getMunicipalitiesCached, peekMunicipalities } from "@/lib/geo-lists-cache";
import { dedupeContactGroupsById, type ContactGroupRow } from "@/lib/contact-groups";
import { CenteredModal } from "@/components/ui/centered-modal";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { HqSelect } from "@/components/ui/hq-select";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
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

type NewFilter = {
  call_status: string;
  area: string;
  municipality: string;
  priority: string;
  tag: string;
  group_ids: string[];
};

const CAMPAIGN_CREATE_IDS_KEY = "campaign_create_contact_ids";

const statusBadge =
  "inline-flex min-h-7 min-w-0 max-w-full shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide";

const goldCta =
  "no-mobile-scale inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-full border-2 border-[#8B6914] bg-gradient-to-b from-[#E8C96B] to-[#8B6914] px-4 text-xs font-bold text-[#0A1628] shadow-sm transition duration-200 hover:brightness-110 sm:text-sm";

const sectionLabel =
  "mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[#D4AF37]";

const emptyFilter = (): NewFilter => ({
  call_status: "",
  area: "",
  municipality: "",
  priority: "",
  tag: "",
  group_ids: [],
});

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
  const [filter, setFilter] = useState<NewFilter>(emptyFilter);
  const [areas, setAreas] = useState<string[]>([]);
  const [municipalities, setMunicipalities] = useState<string[]>(() => peekMunicipalities() ?? []);
  const [muniLoading, setMuniLoading] = useState(false);
  const [groups, setGroups] = useState<ContactGroupRow[]>([]);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewWithPhone, setPreviewWithPhone] = useState<number | null>(null);
  const [previewWithoutPhone, setPreviewWithoutPhone] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [dialingId, setDialingId] = useState<string | null>(null);
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
    let cancelled = false;
    setMuniLoading(!(peekMunicipalities()?.length));

    void Promise.all([
      fetchWithTimeout("/api/contacts/field-options").then(async (r) => {
        const d = (await r.json()) as { areas?: string[] };
        return d.areas ?? [];
      }),
      getMunicipalitiesCached(),
      fetchWithTimeout("/api/campaign-types").then(async (r) => {
        const d = (await r.json()) as { types?: CampaignTypeRow[] };
        return d.types ?? [];
      }),
      fetchWithTimeout("/api/groups").then(async (r) => {
        const d = (await r.json()) as { groups?: ContactGroupRow[] };
        return dedupeContactGroupsById(d.groups ?? []);
      }),
    ])
      .then(([areaList, muniList, types, groupList]) => {
        if (cancelled) return;
        setAreas(areaList);
        setMunicipalities(muniList);
        setMuniLoading(false);
        setCampaignTypes(types);
        setGroups(groupList);
      })
      .catch(() => {
        if (cancelled) return;
        setAreas([]);
        setMunicipalities([]);
        setMuniLoading(false);
        setCampaignTypes([]);
        setGroups([]);
      });

    return () => {
      cancelled = true;
    };
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
      }, 500);
      return () => clearTimeout(t);
    }

    const q = new URLSearchParams();
    if (filter.call_status) q.set("call_status", filter.call_status);
    if (filter.area) q.set("area", filter.area);
    if (filter.municipality) q.set("municipality", filter.municipality);
    if (filter.priority) q.set("priority", filter.priority);
    if (filter.tag) q.set("tag", filter.tag);
    if (filter.group_ids.length) q.set("group_ids", filter.group_ids.join(","));
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
    }, 500);
    return () => clearTimeout(t);
  }, [modal, filter, selectedContactIds]);

  const selectedType = campaignTypes.find((x) => x.id === campaignTypeId);
  const agentLabel =
    selectedType?.retell_agent_name?.trim() ||
    (selectedType?.retell_agent_id ? selectedType.retell_agent_id : null);

  const groupOptions = useMemo(
    () =>
      groups.map((g) => ({
        value: g.id,
        label: g.year != null ? `${g.name} (${g.year})` : g.name,
        group: g.category ?? "Άλλο",
        color: g.color,
      })),
    [groups],
  );

  const areaOptions = useMemo(
    () => areas.map((a) => ({ value: a, label: a })),
    [areas],
  );

  const municipalityOptions = useMemo(
    () => municipalities.map((m) => ({ value: m, label: m })),
    [municipalities],
  );

  const nameFilled = name.trim().length > 0;

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
          group_ids: filter.group_ids.length ? filter.group_ids : undefined,
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
      setFilter(emptyFilter());
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
  const totalCalls = campaigns.reduce((a, c) => a + (c.stats?.total ?? 0), 0);
  const totalConnected = campaigns.reduce((a, c) => a + (c.stats?.positive ?? 0), 0);
  const rates = campaigns
    .map((c) => {
      const t = c.stats?.total ?? 0;
      if (t <= 0) return null;
      return ((c.stats?.positive ?? 0) / t) * 100;
    })
    .filter((x): x is number => x != null);
  const avgSuccess =
    rates.length > 0
      ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10
      : 0;

  const previewText = (() => {
    if (previewing) return "Υπολογισμός…";
    if (previewWithPhone == null) return "Επιλέξτε φίλτρα για προεπισκόπηση";
    const withN = previewWithPhone;
    const withoutN = previewWithoutPhone ?? 0;
    return `${withN} επαφές με αριθμό · ${withoutN} χωρίς αριθμό (εξαιρούνται)`;
  })();

  return (
    <div className="space-y-8 max-md:space-y-6">
      <section className="data-hq-card relative overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm hover:shadow-md transition-shadow [data-theme='light']:bg-white [data-theme='light']:shadow-[0_2px_20px_rgba(0,0,0,0.06)] sm:p-6">
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <TopMetric label="Σύνολο Καμπανιών" value={totalN} icon={BarChart3} />
            <TopMetric label="Ενεργές" value={activeN} icon={Radio} />
            <TopMetric label="Ολοκληρώθηκαν" value={doneN} icon={CheckCircle2} />
            <TopMetric label="Συνολικές Κλήσεις" value={totalCalls} icon={Phone} />
            <TopMetric label="Συνδέθηκε με ΚΚ" value={totalConnected} icon={Link2} />
            <TopMetric
              label="Μέσο Ποσοστό Επιτυχίας"
              value={avgSuccess}
              suffix="%"
              icon={Percent}
            />
          </div>
        </div>
      </section>

      {loading && <p className="text-sm text-[var(--text-muted)]">Φόρτωση καμπανιών…</p>}

      {!loading && campaigns.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-card)] px-6 py-16 text-center shadow-sm">
          <Target className="h-10 w-10 text-[#D4AF37]/70" aria-hidden />
          <p className="text-sm font-medium text-[var(--text-primary)]">Δεν υπάρχουν καμπάνιες ακόμα</p>
          <p className="max-w-sm text-xs text-[var(--text-secondary)]">
            Δημιουργήστε την πρώτη σας καμπάνια για να ξεκινήσετε κλήσεις προς επιλεγμένες επαφές.
          </p>
          <button
            type="button"
            className={goldCta}
            onClick={() => {
              setFormErr(null);
              setSelectedContactIds([]);
              setConcurrentLines(3);
              setModal(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Νέα Καμπάνια
          </button>
        </div>
      )}

      <ul className="flex flex-col gap-4">
        {campaigns.map((c) => {
          const isActive = c.status === "active";
          const isDone = c.status === "completed";
          const s = c.stats;
          const dialable = c.withPhone ?? c.contactTotal;
          const hasPool = dialable > 0;
          const barPct = hasPool ? Math.min(100, c.progress) : s.total > 0 ? 100 : 0;
          const isWhatsApp = c.channel === "whatsapp";
          const agentLabel = c.retell_agent_name?.trim() || null;
          const successRate =
            s.total > 0 ? Math.round((s.positive / s.total) * 1000) / 10 : 0;
          return (
            <li
              key={c.id}
              className="relative flex w-full max-w-full flex-col overflow-hidden rounded-xl border border-slate-200/80 border-l-4 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
              style={{ borderLeftColor: isActive ? "#D4AF37" : isDone ? "#94A3B8" : "#CBD5E1" }}
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                    <h2 className="min-w-0 text-xl font-bold leading-tight text-[#0A1628]">
                      {c.name}
                    </h2>
                    <span
                      className={
                        statusBadge +
                        (isActive
                          ? " border-[#D4AF37]/50 bg-[#D4AF37]/15 text-[#6B5210]"
                          : isDone
                            ? " border-slate-300 bg-slate-100 text-slate-700"
                            : " border-slate-200 bg-slate-50 text-slate-600")
                      }
                    >
                      {isActive ? "ΕΝΕΡΓΗ" : isDone ? "ΟΛΟΚΛΗΡΩΘΗΚΕ" : (c.status ?? "—").toUpperCase()}
                    </span>
                    {isWhatsApp ? (
                      <span
                        className={
                          statusBadge +
                          " inline-flex items-center gap-1 border-emerald-700/30 bg-emerald-700 text-white"
                        }
                      >
                        <MessageCircle className="h-3 w-3" />
                        WHATSAPP
                      </span>
                    ) : (
                      <span
                        className={
                          statusBadge +
                          " inline-flex items-center gap-1 border-sky-700/30 bg-sky-700 text-white"
                        }
                      >
                        <Phone className="h-3 w-3" />
                        ΚΛΗΣΕΙΣ
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500">
                    {c.created_at
                      ? formatDateAthens(c.created_at, {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        })
                      : "—"}
                    {agentLabel ? (
                      <>
                        {" · "}
                        Agent: <span className="font-medium text-slate-700">{agentLabel}</span>
                      </>
                    ) : null}
                  </p>
                </div>
                {isWhatsApp ? (
                  <MessageCircle className="h-5 w-5 shrink-0 text-emerald-600 opacity-90" strokeWidth={2} aria-hidden />
                ) : (
                  <Megaphone className="h-5 w-5 shrink-0 text-[#D4AF37] opacity-90" strokeWidth={2} aria-hidden />
                )}
              </div>

              {c.description ? (
                <p className="mt-2 line-clamp-2 text-sm text-slate-600">{c.description}</p>
              ) : null}

              <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center justify-between text-[10px] font-medium uppercase tracking-wider text-slate-500">
                    <span>Πρόοδος</span>
                    <span className="normal-case tracking-normal text-slate-700">
                      {hasPool
                        ? `${c.callsMade} / ${dialable} με αριθμό`
                        : s.total
                          ? `${s.total} κλήση/εις`
                          : "0 / 0 με αριθμό"}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${barPct}%`,
                        backgroundColor: "#D4AF37",
                        transition: "width 0.25s ease",
                      }}
                    />
                  </div>
                </div>
                <SuccessRateDonut rate={successRate} />
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2.5">
                <CampaignStatCard
                  icon={Link2}
                  label="Συνδέθηκε με ΚΚ"
                  value={s.positive}
                  tone="emerald"
                />
                <CampaignStatCard
                  icon={XCircle}
                  label="Δεν ήθελε"
                  value={s.negative}
                  tone="rose"
                />
                <CampaignStatCard
                  icon={PhoneMissed}
                  label="Δεν απάντησε"
                  value={s.noAnswer}
                  tone="orange"
                />
              </div>

              {c.sentiment && c.sentiment.trendDelta != null && (
                <p className="mt-3 text-xs text-slate-500">
                  Συνδέθηκε με ΚΚ {c.sentiment.positiveRate}%
                  {c.sentiment.trendDelta >= 0 ? (
                    <span className="ml-1 font-semibold text-emerald-700">+{c.sentiment.trendDelta}%</span>
                  ) : (
                    <span className="ml-1 font-semibold text-red-700">{c.sentiment.trendDelta}%</span>
                  )}{" "}
                  <span>έναντι προηγούμενης</span>
                </p>
              )}

              <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
                <Link
                  href={`/campaigns/${c.id}`}
                  className="inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-[#0A1628] transition hover:border-[#D4AF37]/50 hover:bg-[#FDFAF5] sm:min-w-[6.5rem] sm:flex-none"
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
                {isActive ? (
                  <button
                    type="button"
                    className="h-10 min-w-0 flex-1 rounded-xl border-2 border-emerald-700/50 bg-transparent px-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50 sm:min-w-[7rem] sm:flex-none"
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
                    className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-transparent px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 sm:min-w-[7rem] sm:flex-none"
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
                  className="group inline-flex h-10 w-10 shrink-0 items-center justify-center self-center rounded-xl border-2 border-red-600 bg-transparent text-red-700 transition hover:bg-red-50 sm:ml-0.5"
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
        className="w-full max-w-[720px] rounded-2xl bg-white shadow-2xl [&>header]:border-b-2 [&>header]:border-[#D4AF37]"
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
              disabled={!nameFilled}
              variant="gold"
              className={
                goldCta +
                " !h-12 !min-w-0 !w-full !rounded-xl sm:!w-auto sm:!px-6 disabled:opacity-50"
              }
            >
              Αποθήκευση
            </FormSubmitButton>
          </>
        }
      >
        <form id="campaign-create-form" className="flex min-h-0 w-full flex-col" onSubmit={createCampaign}>
          <div className="space-y-6">
            {formErr && (
              <p className="rounded-lg border border-red-500/40 bg-red-50 px-3 py-2 text-sm text-red-700">
                {formErr}
              </p>
            )}

            {selectedContactIds.length > 0 && (
              <div className="rounded-xl border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-3 py-2 text-sm text-slate-800">
                Επιλεγμένες επαφές από αναζήτηση:{" "}
                <strong className="tabular-nums">{selectedContactIds.length}</strong>
                <button
                  type="button"
                  className="ml-2 text-xs text-[#D4AF37] underline"
                  onClick={() => setSelectedContactIds([])}
                >
                  Καθαρισμός — χρήση φίλτρων
                </button>
              </div>
            )}

            {/* Section 1 — Βασικά */}
            <section>
              <p className={sectionLabel}>Βασικά στοιχεία</p>
              <div className="space-y-3">
                <div>
                  <label className={lux.label} htmlFor="c-name">
                    Όνομα<span className="ml-0.5 text-red-500" aria-hidden>*</span>
                  </label>
                  <input
                    id="c-name"
                    className={[
                      lux.input,
                      "!h-12 !text-base font-medium",
                      nameFieldErr ? lux.inputError : "",
                    ]
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
                    placeholder="π.χ. Θερινή εξόρμηση 2026"
                    aria-invalid={nameFieldErr ? true : undefined}
                  />
                  {nameFieldErr && (
                    <p className="mt-1 text-xs text-red-500" role="alert">
                      {nameFieldErr}
                    </p>
                  )}
                </div>
                <div>
                  <label className={lux.label} htmlFor="c-desc">
                    Περιγραφή
                  </label>
                  <textarea
                    id="c-desc"
                    className={lux.textarea + " !min-h-0 !resize-none !text-base"}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    placeholder="Προαιρετική περιγραφή…"
                  />
                </div>
              </div>
            </section>

            {/* Section 2 — Ρυθμίσεις κλήσεων */}
            <section>
              <p className={sectionLabel}>Ρυθμίσεις κλήσεων</p>
              <div className="space-y-4">
                <div>
                  <label className={lux.label} htmlFor="c-ctype">
                    Τύπος καμπάνιας
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
                        {t.retell_agent_name ? ` · ${t.retell_agent_name}` : ""}
                      </option>
                    ))}
                  </HqSelect>
                  {agentLabel ? (
                    <p className="mt-1.5 text-sm font-medium text-[#D4AF37]">
                      Agent: {agentLabel}
                    </p>
                  ) : (
                    <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                      Agent: προεπιλογή περιβάλλοντος (RETELL_AGENT_ID)
                    </p>
                  )}
                </div>

                <div>
                  <span className={lux.label}>Κανάλι</span>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setCampaignChannel("call")}
                      className={
                        "inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border-2 px-3 text-sm font-semibold transition sm:flex-none " +
                        (campaignChannel === "call"
                          ? "border-[#D4AF37] bg-[#D4AF37]/15 text-slate-900"
                          : "border-[var(--border)] bg-transparent text-[var(--text-secondary)] hover:border-[#D4AF37]/50")
                      }
                    >
                      <Phone className="h-4 w-4" aria-hidden />
                      Κλήσεις (Retell)
                    </button>
                    <button
                      type="button"
                      onClick={() => setCampaignChannel("whatsapp")}
                      className={
                        "inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border-2 px-3 text-sm font-semibold transition sm:flex-none " +
                        (campaignChannel === "whatsapp"
                          ? "border-[#D4AF37] bg-[#D4AF37]/15 text-slate-900"
                          : "border-[var(--border)] bg-transparent text-[var(--text-secondary)] hover:border-[#D4AF37]/50")
                      }
                    >
                      <MessageCircle className="h-4 w-4" aria-hidden />
                      WhatsApp
                    </button>
                  </div>
                </div>

                <div>
                  <span className={lux.label}>Παράλληλες γραμμές</span>
                  <div className="mt-1 flex flex-wrap items-center gap-3">
                    <div className="inline-flex items-center overflow-hidden rounded-xl border border-[var(--border)]">
                      <button
                        type="button"
                        className="flex h-11 w-11 items-center justify-center text-[var(--text-secondary)] transition hover:bg-[var(--bg-elevated)] disabled:opacity-40"
                        disabled={concurrentLines <= CONCURRENT_LINES_MIN}
                        onClick={() =>
                          setConcurrentLines((n) => clampConcurrentLines(n - 1))
                        }
                        aria-label="Μείωση γραμμών"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="min-w-[2.5rem] text-center text-base font-bold tabular-nums text-[var(--text-primary)]">
                        {concurrentLines}
                      </span>
                      <button
                        type="button"
                        className="flex h-11 w-11 items-center justify-center text-[var(--text-secondary)] transition hover:bg-[var(--bg-elevated)] disabled:opacity-40"
                        disabled={concurrentLines >= CONCURRENT_LINES_MAX}
                        onClick={() =>
                          setConcurrentLines((n) => clampConcurrentLines(n + 1))
                        }
                        aria-label="Αύξηση γραμμών"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="text-sm text-[var(--text-muted)]">
                      {concurrentLines} ταυτόχρονες κλήσεις
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 3 — Φίλτρα */}
            {selectedContactIds.length === 0 && (
              <section>
                <p className={sectionLabel}>Φιλτράρισμα επαφών</p>
                <p className="mb-3 text-[11px] text-[var(--text-muted)]">
                  Τουλάχιστον ένα κριτήριο — ή επιλέξτε από{" "}
                  <Link href="/contacts/search" className="text-[#D4AF37] underline">
                    προηγμένη αναζήτηση
                  </Link>
                  .
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
                      {CONTACT_CALL_STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
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
                    <SearchableSelect
                      id="c-area"
                      options={areaOptions}
                      value={filter.area}
                      onChange={(area) => setFilter((f) => ({ ...f, area }))}
                      placeholder="Όλες οι περιοχές"
                      emptyText="Δεν βρέθηκαν περιοχές"
                      searchPlaceholder="Αναζήτηση περιοχής…"
                    />
                  </div>
                  <div>
                    <label className={lux.label} htmlFor="c-mun">
                      Δήμος που ψηφίζει
                    </label>
                    <SearchableSelect
                      id="c-mun"
                      options={municipalityOptions}
                      value={filter.municipality}
                      onChange={(municipality) => setFilter((f) => ({ ...f, municipality }))}
                      placeholder="Όλοι οι δήμοι"
                      emptyText="Δεν βρέθηκαν δήμοι"
                      loading={muniLoading}
                      loadingText="Φόρτωση δήμων…"
                      searchPlaceholder="Αναζήτηση δήμου…"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={lux.label} htmlFor="c-tag">
                      Ετικέτα
                    </label>
                    <input
                      id="c-tag"
                      className={lux.input + " !text-base"}
                      value={filter.tag}
                      onChange={(e) => setFilter((f) => ({ ...f, tag: e.target.value }))}
                      placeholder="Ακριβές tag…"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={lux.label}>Ομάδα</label>
                    <SearchableMultiSelect
                      options={groupOptions}
                      values={filter.group_ids}
                      onToggle={(id) =>
                        setFilter((f) => ({
                          ...f,
                          group_ids: f.group_ids.includes(id)
                            ? f.group_ids.filter((x) => x !== id)
                            : [...f.group_ids, id],
                        }))
                      }
                      placeholder="Επιλέξτε ομάδες…"
                      emptyText="Δεν βρέθηκαν ομάδες"
                      countSummaryWhenMultiple
                    />
                  </div>
                </div>
              </section>
            )}

            <div
              className="rounded-xl border border-[#D4AF37]/35 bg-[#D4AF37]/15 px-4 py-3"
              role="status"
              aria-live="polite"
            >
              <p className="text-sm font-medium text-slate-900 inline-flex items-center gap-2">
                <Search className="h-4 w-4 shrink-0 text-[#8B6914]" aria-hidden />
                {previewText}
                {previewCount != null && !previewing ? (
                  <span className="tabular-nums text-[#8B6914]">({previewCount} σύνολο)</span>
                ) : null}
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
  suffix,
  icon: Icon,
}: {
  label: string;
  value: number;
  suffix?: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border-2 border-[#D4AF37]/45 bg-white p-3 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#D4AF37]/25 bg-[#FDFAF5] text-[#8B6914]">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p
          className="text-xl font-bold tabular-nums text-[#0A1628] sm:text-2xl"
          style={{ fontFeatureSettings: '"tnum"' }}
        >
          {value}
          {suffix ?? ""}
        </p>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">{label}</p>
      </div>
    </div>
  );
}

function SuccessRateDonut({ rate }: { rate: number }) {
  const data = [
    { name: "ok", value: Math.max(0, Math.min(100, rate)) },
    { name: "rest", value: Math.max(0, 100 - rate) },
  ];
  return (
    <div className="relative mx-auto h-[72px] w-[72px] shrink-0" title={`Επιτυχία ${rate}%`}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            cx="50%"
            cy="50%"
            innerRadius={22}
            outerRadius={32}
            startAngle={90}
            endAngle={-270}
            strokeWidth={0}
            isAnimationActive={false}
          >
            <Cell fill="#16A34A" />
            <Cell fill="#E5E7EB" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] font-bold tabular-nums text-[#0A1628]">
        {rate}%
      </span>
    </div>
  );
}

function CampaignStatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: "emerald" | "rose" | "orange";
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-800 border-emerald-200 bg-emerald-50"
      : tone === "rose"
        ? "text-red-800 border-red-200 bg-red-50"
        : "text-orange-800 border-orange-200 bg-orange-50";
  return (
    <div className={`flex flex-col justify-center rounded-xl border p-2.5 ${toneClass}`}>
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide">
        <Icon className="h-3 w-3 shrink-0" aria-hidden />
        {label}
      </span>
      <span
        className="mt-0.5 text-lg font-bold tabular-nums sm:text-xl"
        style={{ fontFeatureSettings: '"tnum"' }}
      >
        {value}
      </span>
    </div>
  );
}
