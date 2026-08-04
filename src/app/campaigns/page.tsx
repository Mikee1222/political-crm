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
import {
  FormEvent,
  Suspense,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import {
  CONTACT_SEARCH_AGE_GROUPS,
  GENDER_OPTIONS,
  PRESENCE_OPTIONS,
} from "@/lib/contact-search-constants";
import {
  getMunicipalitiesCached,
  getToponymsCached,
  peekMunicipalities,
  peekToponyms,
} from "@/lib/geo-lists-cache";
import { dedupeContactGroupsById, type ContactGroupRow } from "@/lib/contact-groups";
import { formatGreekContactName } from "@/lib/contact-display-name";
import { cn } from "@/lib/utils";
import { CenteredModal } from "@/components/ui/centered-modal";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { HqSelect } from "@/components/ui/hq-select";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ContactSearchCombobox } from "@/components/requests/contact-search-combobox";
import { SegmentedControl } from "@/components/search/segmented-control";
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
  toponym: string;
  priority: string;
  tag: string;
  group_ids: string[];
  exclude_group_ids: string[];
  gender: string;
  political_stance: string;
  age_groups: string[];
  /** has | not | "" (Αδιάφορο) — default has for dialable pool */
  has_phone: "" | "has" | "not";
};

type SelectedContactChip = { id: string; label: string };

const POLITICAL_STANCE_OPTIONS = [
  "Κεντροδεξιός",
  "Αριστερός",
  "Ακροδεξιός",
  "Αναποφάσιστος",
  "Άλλο",
] as const;

const CAMPAIGN_CREATE_IDS_KEY = "campaign_create_contact_ids";
const PAGE_SIZE = 5;
const SEARCH_DEBOUNCE_MS = 300;

type ListStatusFilter = "" | "active" | "completed";
type ListChannelFilter = "" | "call" | "whatsapp";
type ListSort = "newest" | "oldest" | "alphabetical" | "success";

const STATUS_FILTER_OPTIONS: { value: ListStatusFilter; label: string }[] = [
  { value: "", label: "Όλες" },
  { value: "active", label: "Ενεργές" },
  { value: "completed", label: "Ολοκληρώθηκαν" },
];

const CHANNEL_FILTER_OPTIONS: { value: ListChannelFilter; label: string }[] = [
  { value: "", label: "Όλα" },
  { value: "call", label: "Κλήσεις" },
  { value: "whatsapp", label: "WhatsApp" },
];

const SORT_OPTIONS: { value: ListSort; label: string }[] = [
  { value: "newest", label: "Νεότερες πρώτα" },
  { value: "oldest", label: "Παλαιότερες πρώτα" },
  { value: "alphabetical", label: "Αλφαβητικά" },
  { value: "success", label: "Υψηλότερο ποσοστό επιτυχίας" },
];

function parseListStatus(raw: string | null): ListStatusFilter {
  if (raw === "active" || raw === "completed") return raw;
  return "";
}

function parseListChannel(raw: string | null): ListChannelFilter {
  if (raw === "call" || raw === "whatsapp") return raw;
  return "";
}

function parseListSort(raw: string | null): ListSort {
  if (raw === "oldest" || raw === "alphabetical" || raw === "success") return raw;
  return "newest";
}

function pageNumbers(current: number, total: number): number[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set<number>([1, total, current]);
  for (let i = current - 1; i <= current + 1; i++) {
    if (i >= 1 && i <= total) pages.add(i);
  }
  return [...pages].sort((a, b) => a - b);
}

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
  toponym: "",
  priority: "",
  tag: "",
  group_ids: [],
  exclude_group_ids: [],
  gender: "",
  political_stance: "",
  age_groups: [],
  has_phone: "has",
});

function filterHasCriteria(f: NewFilter): boolean {
  return Boolean(
    f.call_status ||
      f.area ||
      f.municipality ||
      f.toponym ||
      f.priority ||
      f.tag ||
      f.group_ids.length ||
      f.exclude_group_ids.length ||
      f.gender ||
      f.political_stance ||
      f.age_groups.length,
  );
}

function ageBoundsFromGroups(groups: string[]): { age_min?: string; age_max?: string } {
  const keys = groups.filter((k) => k in CONTACT_SEARCH_AGE_GROUPS);
  if (!keys.length) return {};
  const mins = keys.map((k) => CONTACT_SEARCH_AGE_GROUPS[k]!.min);
  const maxs = keys.map((k) => CONTACT_SEARCH_AGE_GROUPS[k]!.max);
  return { age_min: String(Math.min(...mins)), age_max: String(Math.max(...maxs)) };
}

function buildFilterPayload(f: NewFilter): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    has_phone: f.has_phone || "any",
  };
  if (f.call_status) payload.call_status = f.call_status;
  if (f.area) payload.area = f.area;
  if (f.municipality) payload.municipality = f.municipality;
  if (f.toponym) payload.toponym = f.toponym;
  if (f.priority) payload.priority = f.priority;
  if (f.tag) payload.tag = f.tag;
  if (f.group_ids.length) payload.group_ids = f.group_ids;
  if (f.exclude_group_ids.length) payload.exclude_group_ids = f.exclude_group_ids;
  if (f.gender) payload.gender = f.gender;
  if (f.political_stance) payload.political_stance = f.political_stance;
  if (f.age_groups.length) {
    payload.age_groups = f.age_groups;
    Object.assign(payload, ageBoundsFromGroups(f.age_groups));
  }
  return payload;
}

function CampaignsPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [listTotal, setListTotal] = useState(0);
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
  const [toponyms, setToponyms] = useState<string[]>(() => {
    const cached = peekToponyms();
    return cached ? cached.map((t) => t.name).filter(Boolean) : [];
  });
  const [toponymsLoading, setToponymsLoading] = useState(false);
  const [groups, setGroups] = useState<ContactGroupRow[]>([]);
  const [previewWithPhone, setPreviewWithPhone] = useState<number | null>(null);
  const [previewWithoutPhone, setPreviewWithoutPhone] = useState<number | null>(null);
  const [previewManualCount, setPreviewManualCount] = useState<number>(0);
  const [previewing, setPreviewing] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<SelectedContactChip[]>([]);
  const selectedContactIds = useMemo(() => selectedContacts.map((c) => c.id), [selectedContacts]);
  const [dialingId, setDialingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [nameFieldErr, setNameFieldErr] = useState<string | null>(null);
  const { showToast } = useFormToast();

  const listPage = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const listStatus = parseListStatus(searchParams.get("status"));
  const listChannel = parseListChannel(searchParams.get("channel"));
  const listSort = parseListSort(searchParams.get("sort"));
  const listQ = searchParams.get("q") ?? "";
  const [searchInput, setSearchInput] = useState(listQ);

  const patchListParams = useCallback(
    (updates: Record<string, string | null>, resetPage = false) => {
      const p = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value == null || value === "") p.delete(key);
        else p.set(key, value);
      }
      if (resetPage) p.delete("page");
      const qs = p.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [searchParams, router, pathname],
  );

  useEffect(() => {
    setSearchInput(listQ);
  }, [listQ]);

  useEffect(() => {
    if (searchInput === listQ) return;
    const t = window.setTimeout(() => {
      patchListParams({ q: searchInput.trim() || null }, true);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [searchInput, listQ, patchListParams]);

  const listQueryKey = useMemo(() => {
    const p = new URLSearchParams();
    p.set("page", String(listPage));
    p.set("page_size", String(PAGE_SIZE));
    if (listStatus) p.set("status", listStatus);
    if (listChannel) p.set("channel", listChannel);
    if (listQ.trim()) p.set("q", listQ.trim());
    if (listSort !== "newest") p.set("sort", listSort);
    return p.toString();
  }, [listPage, listStatus, listChannel, listQ, listSort]);

  const hasListFilters = Boolean(listStatus || listChannel || listQ.trim());

  const load = useCallback(async () => {
    const res = await fetchWithTimeout(`/api/campaigns?${listQueryKey}`);
    const data = (await res.json().catch(() => ({}))) as {
      campaigns?: Campaign[];
      total?: number;
    };
    if (!res.ok) return;
    setCampaigns((data.campaigns ?? []) as Campaign[]);
    setListTotal(typeof data.total === "number" ? data.total : (data.campaigns ?? []).length);
  }, [listQueryKey]);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  const totalPages = listTotal === 0 ? 0 : Math.ceil(listTotal / PAGE_SIZE);
  const rangeFrom = listTotal === 0 ? 0 : (listPage - 1) * PAGE_SIZE + 1;
  const rangeTo = Math.min(listPage * PAGE_SIZE, listTotal);
  const pageList = totalPages > 0 ? pageNumbers(listPage, totalPages) : [];

  useEffect(() => {
    if (loading || totalPages === 0) return;
    if (listPage > totalPages) {
      patchListParams({ page: totalPages <= 1 ? null : String(totalPages) });
    }
  }, [loading, listPage, totalPages, patchListParams]);

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
      if (ids.length > 0) {
        setSelectedContacts(ids.map((id) => ({ id, label: id })));
        void (async () => {
          const labels = await Promise.all(
            ids.map(async (id) => {
              try {
                const res = await fetchWithTimeout(`/api/contacts/${id}`);
                if (!res.ok) return { id, label: id };
                const j = (await res.json()) as {
                  contact?: { first_name?: string; last_name?: string; father_name?: string | null };
                };
                const c = j.contact;
                if (!c) return { id, label: id };
                return {
                  id,
                  label: formatGreekContactName(c.last_name, c.first_name, c.father_name) || id,
                };
              } catch {
                return { id, label: id };
              }
            }),
          );
          setSelectedContacts(labels);
        })();
      }
      setConcurrentLines(3);
      setModal(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!modal) return;
    let cancelled = false;
    setMuniLoading(!(peekMunicipalities()?.length));
    setToponymsLoading(!(peekToponyms()?.length));

    void Promise.all([
      fetchWithTimeout("/api/contacts/field-options").then(async (r) => {
        const d = (await r.json()) as { areas?: string[] };
        return d.areas ?? [];
      }),
      getMunicipalitiesCached(),
      getToponymsCached(),
      fetchWithTimeout("/api/campaign-types").then(async (r) => {
        const d = (await r.json()) as { types?: CampaignTypeRow[] };
        return d.types ?? [];
      }),
      fetchWithTimeout("/api/groups").then(async (r) => {
        const d = (await r.json()) as { groups?: ContactGroupRow[] };
        return dedupeContactGroupsById(d.groups ?? []);
      }),
    ])
      .then(([areaList, muniList, topRows, types, groupList]) => {
        if (cancelled) return;
        setAreas(areaList);
        setMunicipalities(muniList);
        setMuniLoading(false);
        setToponyms(topRows.map((t) => t.name).filter(Boolean));
        setToponymsLoading(false);
        setCampaignTypes(types);
        setGroups(groupList);
      })
      .catch(() => {
        if (cancelled) return;
        setAreas([]);
        setMunicipalities([]);
        setMuniLoading(false);
        setToponyms([]);
        setToponymsLoading(false);
        setCampaignTypes([]);
        setGroups([]);
      });

    return () => {
      cancelled = true;
    };
  }, [modal]);

  useEffect(() => {
    if (!modal) return;

    const q = new URLSearchParams();
    if (selectedContactIds.length) q.set("contact_ids", selectedContactIds.join(","));
    if (filter.call_status) q.set("call_status", filter.call_status);
    if (filter.area) q.set("area", filter.area);
    if (filter.municipality) q.set("municipality", filter.municipality);
    if (filter.toponym) q.set("toponym", filter.toponym);
    if (filter.priority) q.set("priority", filter.priority);
    if (filter.tag) q.set("tag", filter.tag);
    if (filter.group_ids.length) q.set("group_ids", filter.group_ids.join(","));
    if (filter.exclude_group_ids.length) {
      q.set("exclude_group_ids", filter.exclude_group_ids.join(","));
    }
    if (filter.gender) q.set("gender", filter.gender);
    if (filter.political_stance) q.set("political_stance", filter.political_stance);
    if (filter.age_groups.length) q.set("age_groups", filter.age_groups.join(","));
    const ages = ageBoundsFromGroups(filter.age_groups);
    if (ages.age_min) q.set("age_min", ages.age_min);
    if (ages.age_max) q.set("age_max", ages.age_max);

    const hasAnything = selectedContactIds.length > 0 || filterHasCriteria(filter);
    if (!hasAnything) {
      setPreviewWithPhone(null);
      setPreviewWithoutPhone(null);
      setPreviewManualCount(0);
      return;
    }

    setPreviewing(true);
    const t = setTimeout(() => {
      fetchWithTimeout(`/api/campaigns/preview?${q.toString()}`)
        .then((r) => r.json())
        .then((d) => {
          setPreviewWithPhone(typeof d.with_phone === "number" ? d.with_phone : null);
          setPreviewWithoutPhone(typeof d.without_phone === "number" ? d.without_phone : null);
          setPreviewManualCount(typeof d.manual_count === "number" ? d.manual_count : selectedContactIds.length);
        })
        .catch(() => {
          setPreviewWithPhone(null);
          setPreviewWithoutPhone(null);
          setPreviewManualCount(0);
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

  const toponymOptions = useMemo(
    () => toponyms.map((t) => ({ value: t, label: t })),
    [toponyms],
  );

  const politicalStanceOptions = useMemo(
    () => POLITICAL_STANCE_OPTIONS.map((s) => ({ value: s, label: s })),
    [],
  );

  const nameFilled = name.trim().length > 0;

  const addSelectedContact = (id: string, displayName?: string) => {
    setSelectedContacts((prev) => {
      if (prev.some((c) => c.id === id)) return prev;
      return [...prev, { id, label: (displayName ?? id).toUpperCase() }];
    });
  };

  const removeSelectedContact = (id: string) => {
    setSelectedContacts((prev) => prev.filter((c) => c.id !== id));
  };

  const createCampaign = async (e: FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    setNameFieldErr(null);
    if (!name.trim()) {
      setNameFieldErr("Υποχρεωτικό όνομα");
      showToast("Συμπληρώστε το όνομα της καμπάνιας.", "error");
      return;
    }
    if (!selectedContactIds.length && !filterHasCriteria(filter)) {
      setFormErr("Επιλέξτε επαφές ή τουλάχιστον ένα κριτήριο φίλτρου.");
      showToast("Επιλέξτε επαφές ή φίλτρα.", "error");
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
      }
      if (filterHasCriteria(filter)) {
        body.filter = buildFilterPayload(filter);
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
      setSelectedContacts([]);
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

  const totalN = listTotal;
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
    if (previewWithPhone == null) return "Επιλέξτε φίλτρα ή επαφές για προεπισκόπηση";
    const withN = previewWithPhone;
    const withoutN = previewWithoutPhone ?? 0;
    const manualN = previewManualCount;
    let text = `${withN} επαφές με αριθμό · ${withoutN} χωρίς (εξαιρούνται)`;
    if (manualN > 0) text += ` · ${manualN} επιλεγμένες χειροκίνητα`;
    return text;
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
                setSelectedContacts([]);
                setFilter(emptyFilter());
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

      <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm [data-theme='light']:bg-white sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
          <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Κατάσταση
              </p>
              <SegmentedControl
                options={STATUS_FILTER_OPTIONS}
                value={listStatus}
                onChange={(status) =>
                  patchListParams({ status: status || null }, true)
                }
              />
            </div>
            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Κανάλι
              </p>
              <SegmentedControl
                options={CHANNEL_FILTER_OPTIONS}
                value={listChannel}
                onChange={(channel) =>
                  patchListParams({ channel: channel || null }, true)
                }
              />
            </div>
            <div className="sm:col-span-2 xl:col-span-1">
              <label
                className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]"
                htmlFor="campaigns-search"
              >
                Αναζήτηση
              </label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
                  aria-hidden
                />
                <input
                  id="campaigns-search"
                  type="search"
                  className={lux.input + " !h-10 !pl-9 !text-sm"}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Όνομα καμπάνιας…"
                  autoComplete="off"
                />
              </div>
            </div>
          </div>
          <div className="w-full shrink-0 lg:w-56">
            <label
              className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]"
              htmlFor="campaigns-sort"
            >
              Ταξινόμηση
            </label>
            <HqSelect
              id="campaigns-sort"
              className="!min-h-10 !text-sm"
              value={listSort}
              onChange={(e) => {
                const next = parseListSort(e.target.value);
                patchListParams(
                  { sort: next === "newest" ? null : next },
                  true,
                );
              }}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </HqSelect>
          </div>
        </div>
      </section>

      {!loading && campaigns.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-card)] px-6 py-16 text-center shadow-sm">
          <Target className="h-10 w-10 text-[#D4AF37]/70" aria-hidden />
          <p className="text-sm font-medium text-[var(--text-primary)]">
            {hasListFilters ? "Δεν βρέθηκαν καμπάνιες" : "Δεν υπάρχουν καμπάνιες ακόμα"}
          </p>
          <p className="max-w-sm text-xs text-[var(--text-secondary)]">
            {hasListFilters
              ? "Δοκιμάστε διαφορετικά φίλτρα ή καθαρίστε την αναζήτηση."
              : "Δημιουργήστε την πρώτη σας καμπάνια για να ξεκινήσετε κλήσεις προς επιλεγμένες επαφές."}
          </p>
          {hasListFilters ? (
            <button
              type="button"
              className={lux.btnSecondary}
              onClick={() =>
                patchListParams(
                  { status: null, channel: null, q: null, sort: null, page: null },
                  true,
                )
              }
            >
              Καθαρισμός φίλτρων
            </button>
          ) : (
            <button
              type="button"
              className={goldCta}
              onClick={() => {
                setFormErr(null);
                setSelectedContacts([]);
                setFilter(emptyFilter());
                setConcurrentLines(3);
                setModal(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Νέα Καμπάνια
            </button>
          )}
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

      {!loading && listTotal > 0 && (
        <div className="flex w-full min-w-0 flex-col items-stretch justify-between gap-3 border-t border-[var(--border)]/60 pt-4 sm:flex-row sm:items-center">
          <p
            className="w-full min-w-0 text-center text-sm text-[var(--text-secondary)] sm:max-w-[50%] sm:text-left"
            aria-live="polite"
          >
            Εμφάνιση {rangeFrom}-{rangeTo} από {listTotal} καμπάνιες
          </p>
          {totalPages > 1 && (
            <div className="flex min-w-0 flex-wrap items-center justify-center gap-1 sm:justify-end">
              <button
                type="button"
                className={lux.btnSecondary + " !px-3 !py-2 text-xs sm:text-sm"}
                disabled={listPage <= 1}
                onClick={() =>
                  patchListParams({
                    page: listPage <= 2 ? null : String(listPage - 1),
                  })
                }
              >
                ← Προηγούμενη
              </button>
              {pageList.map((pn, i) => {
                const prev = pageList[i - 1];
                const showEllipsis = prev != null && pn - prev > 1;
                return (
                  <span key={pn} className="inline-flex items-center gap-1">
                    {showEllipsis ? (
                      <span className="px-1 text-sm text-[var(--text-muted)]">…</span>
                    ) : null}
                    <button
                      type="button"
                      className={
                        lux.btnSecondary +
                        (pn === listPage ? " !ring-1 !ring-[var(--accent-gold)]" : "") +
                        " !min-w-[2.5rem] !px-2 !py-2 text-xs sm:text-sm"
                      }
                      onClick={() =>
                        patchListParams({ page: pn === 1 ? null : String(pn) })
                      }
                      aria-current={pn === listPage ? "page" : undefined}
                    >
                      {pn}
                    </button>
                  </span>
                );
              })}
              <button
                type="button"
                className={lux.btnSecondary + " !px-3 !py-2 text-xs sm:text-sm"}
                disabled={listPage >= totalPages}
                onClick={() => patchListParams({ page: String(listPage + 1) })}
              >
                Επόμενη →
              </button>
            </div>
          )}
        </div>
      )}

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

            {selectedContacts.length > 0 && (
              <div className="rounded-xl border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-3 py-2 text-sm text-slate-800">
                Χειροκίνητες επιλογές:{" "}
                <strong className="tabular-nums">{selectedContacts.length}</strong>
                {" "}— ενώνονται με τα αποτελέσματα φίλτρων
                <button
                  type="button"
                  className="ml-2 text-xs text-[#D4AF37] underline"
                  onClick={() => setSelectedContacts([])}
                >
                  Καθαρισμός επιλογών
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

            {/* Section 3 — Επαφές & φίλτρα */}
            <section>
              <p className={sectionLabel}>Φιλτράρισμα επαφών</p>
              <p className="mb-3 text-[11px] text-[var(--text-muted)]">
                Αναζητήστε μεμονωμένες επαφές και/ή ορίστε κριτήρια. Οι χειροκίνητες επιλογές
                ενώνονται με τα αποτελέσματα φίλτρων. Μπορείτε επίσης από{" "}
                <Link href="/contacts/search" className="text-[#D4AF37] underline">
                  προηγμένη αναζήτηση
                </Link>
                .
              </p>

              <div className="mb-4 space-y-2">
                <ContactSearchCombobox
                  label="Αναζήτηση επαφής"
                  valueId=""
                  onChange={() => {}}
                  onSelect={(id, displayName) => addSelectedContact(id, displayName)}
                  placeholder="Όνομα ή τηλέφωνο…"
                />
                {selectedContacts.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                      Επιλεγμένες επαφές
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedContacts.map((c) => (
                        <span
                          key={c.id}
                          className="inline-flex max-w-full items-center gap-1 rounded-full border border-[#D4AF37]/40 bg-[#D4AF37]/15 py-1 pl-2.5 pr-1 text-[11px] font-semibold uppercase tracking-wide text-slate-900"
                        >
                          <span className="truncate">{c.label}</span>
                          <button
                            type="button"
                            className="rounded-full p-0.5 text-slate-600 transition hover:bg-[#D4AF37]/25 hover:text-slate-900"
                            onClick={() => removeSelectedContact(c.id)}
                            aria-label={`Αφαίρεση ${c.label}`}
                          >
                            <XCircle className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

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
                <div>
                  <label className={lux.label} htmlFor="c-topo">
                    Τοπωνύμιο
                  </label>
                  <SearchableSelect
                    id="c-topo"
                    options={toponymOptions}
                    value={filter.toponym}
                    onChange={(toponym) => setFilter((f) => ({ ...f, toponym }))}
                    placeholder="Όλα τα τοπωνύμια"
                    emptyText="Δεν βρέθηκαν τοπωνύμια"
                    loading={toponymsLoading}
                    loadingText="Φόρτωση τοπωνυμίων…"
                    searchPlaceholder="Αναζήτηση τοπωνυμίου…"
                  />
                </div>
                <div>
                  <label className={lux.label} htmlFor="c-stance">
                    Πολιτική στάση
                  </label>
                  <SearchableSelect
                    id="c-stance"
                    options={politicalStanceOptions}
                    value={filter.political_stance}
                    onChange={(political_stance) => setFilter((f) => ({ ...f, political_stance }))}
                    placeholder="Όλες"
                    emptyText="—"
                    searchPlaceholder="Αναζήτηση…"
                  />
                </div>
                <div className="sm:col-span-2">
                  <span className={lux.label}>Φύλο</span>
                  <SegmentedControl
                    options={GENDER_OPTIONS}
                    value={filter.gender}
                    onChange={(gender) => setFilter((f) => ({ ...f, gender }))}
                  />
                </div>
                <div className="sm:col-span-2">
                  <span className={lux.label}>Ηλικιακή ομάδα</span>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {Object.entries(CONTACT_SEARCH_AGE_GROUPS).map(([key, g]) => {
                      const active = filter.age_groups.includes(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          aria-pressed={active}
                          onClick={() =>
                            setFilter((f) => ({
                              ...f,
                              age_groups: active
                                ? f.age_groups.filter((x) => x !== key)
                                : [...f.age_groups, key],
                            }))
                          }
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                            active
                              ? "border-[#D4AF37] bg-[#D4AF37]/20 text-slate-900"
                              : "border-[var(--border)] text-[var(--text-muted)] hover:border-[#D4AF37]/50",
                          )}
                        >
                          {g.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <span className={lux.label}>Έχει τηλέφωνο</span>
                  <SegmentedControl
                    options={PRESENCE_OPTIONS}
                    value={filter.has_phone}
                    onChange={(has_phone) =>
                      setFilter((f) => ({
                        ...f,
                        has_phone: has_phone as NewFilter["has_phone"],
                      }))
                    }
                  />
                  <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                    Προεπιλογή «Έχει» — εξαιρεί επαφές χωρίς αριθμό από το σύνολο κλήσεων.
                  </p>
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
                  <label className={lux.label}>Ομάδα (συμπερίληψη)</label>
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
                <div className="sm:col-span-2">
                  <label className={lux.label}>Εξαίρεση ομάδας</label>
                  <SearchableMultiSelect
                    options={groupOptions}
                    values={filter.exclude_group_ids}
                    onToggle={(id) =>
                      setFilter((f) => ({
                        ...f,
                        exclude_group_ids: f.exclude_group_ids.includes(id)
                          ? f.exclude_group_ids.filter((x) => x !== id)
                          : [...f.exclude_group_ids, id],
                      }))
                    }
                    placeholder="Εξαίρεση ομάδων…"
                    emptyText="Δεν βρέθηκαν ομάδες"
                    countSummaryWhenMultiple
                  />
                </div>
              </div>
            </section>

            <div
              className="rounded-xl border border-[#D4AF37]/35 bg-[#D4AF37]/15 px-4 py-3"
              role="status"
              aria-live="polite"
            >
              <p className="text-sm font-medium text-slate-900 inline-flex flex-wrap items-center gap-2">
                <Search className="h-4 w-4 shrink-0 text-[#8B6914]" aria-hidden />
                {previewText}
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
