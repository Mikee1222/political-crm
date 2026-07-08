"use client";

import { Filter, Maximize2, Printer, Search, SlidersHorizontal, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CrmErrorBoundary } from "@/components/crm-error-boundary";
import {
  buildContactSearchFilterChips,
  ContactSearchFilterChips,
} from "@/components/contacts/search/contact-search-filter-chips";
import { ContactSearchFiltersPanel } from "@/components/contacts/search/contact-search-filters-panel";
import {
  ContactSearchResultCard,
  type ContactSearchResult,
} from "@/components/contacts/search/contact-search-result-card";
import { CenteredModal } from "@/components/ui/centered-modal";
import { FilterSidebarToggle } from "@/components/search/filter-sidebar-toggle";
import { RestoredSearchBanner } from "@/components/search/restored-search-banner";
import { SearchPagination } from "@/components/search/search-pagination";
import { SearchResultsHeader } from "@/components/search/search-results-header";
import { SearchResultsOverlay } from "@/components/search/search-results-overlay";
import { EmptyState } from "@/components/ui/empty-state";
import { MobileFilterFab } from "@/components/mobile/mobile-filter-fab";
import { PageHeader } from "@/components/ui/page-header";
import { useContactTabs } from "@/contexts/contact-tabs-context";
import { useFormToast } from "@/contexts/form-toast-context";
import { useProfile } from "@/contexts/profile-context";
import { CONTACT_LIST_FETCH_TIMEOUT_MS, fetchWithTimeout } from "@/lib/client-fetch";
import type { ContactGroupRow } from "@/lib/contact-groups";
import {
  cloneContactListFilters,
  contactFiltersToExportParams,
  contactFiltersToSearchParams,
  getDefaultContactFilters,
  listSearchParamsToExportParams,
  searchParamsToFilters,
  type ContactListFilters,
} from "@/lib/contacts-filters";
import { dedupeContactGroupsById } from "@/lib/contact-groups";
import { lux } from "@/lib/luxury-styles";
import { hasMinRole } from "@/lib/roles";
import {
  clearSearchSessionState,
  CONTACTS_SEARCH_FRESH_KEY,
  CONTACTS_SEARCH_STATE_KEY,
  consumeSearchFreshIntent,
  loadSearchSessionState,
  saveSearchSessionState,
  SEARCH_FRESH_EVENT,
} from "@/lib/search-session-state";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;
const FILTERS_WIDTH = 320;
const STORAGE_FILTERS_OPEN = "crm-contact-search-filters-open";
const PRINT_FETCH_TIMEOUT_MS = 60_000;
const PRINT_HEADERS = ["Επώνυμο", "Όνομα", "Πατρώνυμο", "Τηλέφωνο", "Δήμος που ψηφίζει", "Ομάδες", "Πολιτική στάση"] as const;

type PrintableContactRow = {
  id: string;
  first_name: string;
  last_name: string;
  father_name: string | null;
  phone: string | null;
  municipality: string | null;
  groups: string[];
  political_stance: string | null;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function ContactSearchPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openTab } = useContactTabs();
  const { profile } = useProfile();
  const isAdmin = profile?.role === "admin";
  const { showToast } = useFormToast();

  const [draftFilters, setDraftFilters] = useState<ContactListFilters>(getDefaultContactFilters);
  const [appliedFilters, setAppliedFilters] = useState<ContactListFilters | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [contacts, setContacts] = useState<ContactSearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [slowSearch, setSlowSearch] = useState(false);
  const [groups, setGroups] = useState<ContactGroupRow[]>([]);
  const [sources, setSources] = useState<{ id: string; name: string }[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [savingFilters, setSavingFilters] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [restoredFromCache, setRestoredFromCache] = useState(false);
  const loadSeqRef = useRef(0);
  /** Exact `/api/contacts` query used for the last successful results (export/print must match). */
  const lastListParamsRef = useRef<URLSearchParams | null>(null);
  const sessionInitRef = useRef(false);
  const skipUrlSyncOnceRef = useRef(false);
  /** When set, matching filters+page skip network fetch (session restore). */
  const restoredFingerprintRef = useRef<string | null>(null);
  const resultsScrollRef = useRef<HTMLDivElement | null>(null);
  const stateSnapshotRef = useRef({
    hasSearched: false,
    appliedFilters: null as ContactListFilters | null,
    page: 1,
    contacts: [] as ContactSearchResult[],
    total: 0,
  });

  const contactSearchFingerprint = useCallback((f: ContactListFilters, pageNum: number) => {
    return contactFiltersToSearchParams({
      ...cloneContactListFilters(f),
      page: String(pageNum),
    }).toString();
  }, []);

  const applyFocusModeDom = useCallback((val: boolean) => {
    if (val) document.body.classList.add("focus-mode");
    else document.body.classList.remove("focus-mode");
  }, []);

  const handleSetFocusMode = useCallback(
    (val: boolean) => {
      setFocusMode(val);
      applyFocusModeDom(val);
      const params = new URLSearchParams(window.location.search);
      if (val) params.set("focus", "1");
      else params.delete("focus");
      const q = params.toString();
      const path = window.location.pathname;
      window.history.replaceState(null, "", q ? `${path}?${q}` : path);
    },
    [applyFocusModeDom],
  );

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_FILTERS_OPEN);
      if (stored === "0") setFiltersOpen(false);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void Promise.all([
      fetchWithTimeout("/api/groups").then(async (r) => {
        const d = (await r.json()) as { groups?: ContactGroupRow[] };
        return dedupeContactGroupsById(d.groups ?? []);
      }),
      fetchWithTimeout("/api/contact-sources").then(async (r) => {
        const d = (await r.json()) as { sources?: { id: string; name: string }[] };
        return d.sources ?? [];
      }),
    ]).then(([g, s]) => {
      setGroups(g);
      setSources(s);
    });
  }, []);

  const groupNames = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);
  const sourceNames = useMemo(() => new Map(sources.map((s) => [s.id, s.name])), [sources]);

  stateSnapshotRef.current = {
    hasSearched,
    appliedFilters,
    page,
    contacts,
    total,
  };

  const persistSearchState = useCallback((scrollY?: number) => {
    const snap = stateSnapshotRef.current;
    if (!snap.hasSearched || !snap.appliedFilters) return;
    const urlQuery =
      typeof window !== "undefined" ? window.location.search.replace(/^\?/, "") : undefined;
    saveSearchSessionState(CONTACTS_SEARCH_STATE_KEY, {
      filters: cloneContactListFilters(snap.appliedFilters),
      page: snap.page,
      results: snap.contacts,
      total: snap.total,
      scrollY:
        typeof scrollY === "number"
          ? scrollY
          : (resultsScrollRef.current?.scrollTop ?? 0),
      urlQuery,
    });
  }, []);

  const applyCachedResults = useCallback((cached: {
    results: ContactSearchResult[];
    total: number;
    scrollY: number;
    filters: ContactListFilters;
    page: number;
  }) => {
    restoredFingerprintRef.current = contactSearchFingerprint(cached.filters, cached.page);
    setContacts(cached.results);
    setTotal(cached.total);
    setRestoredFromCache(true);
    const params = contactFiltersToSearchParams({
      ...cloneContactListFilters(cached.filters),
      page: String(cached.page),
    });
    params.set("page_size", String(PAGE_SIZE));
    params.set("partial_location", "1");
    lastListParamsRef.current = params;
    const scrollTarget = cached.scrollY;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resultsScrollRef.current?.scrollTo({ top: scrollTarget });
      });
    });
  }, [contactSearchFingerprint]);

  // One-shot restore from sessionStorage (or fresh-nav clear) before URL sync.
  useEffect(() => {
    if (sessionInitRef.current) return;
    sessionInitRef.current = true;

    if (consumeSearchFreshIntent(CONTACTS_SEARCH_FRESH_KEY)) {
      clearSearchSessionState(CONTACTS_SEARCH_STATE_KEY);
      return;
    }

    const cached = loadSearchSessionState<ContactListFilters, ContactSearchResult>(
      CONTACTS_SEARCH_STATE_KEY,
    );
    if (!cached?.filters) return;

    const urlRan = searchParams.get("ran") === "1";
    const f = cloneContactListFilters(cached.filters);
    const pageNum = Math.max(1, cached.page || 1);

    skipUrlSyncOnceRef.current = !urlRan;
    setDraftFilters(f);
    setAppliedFilters(f);
    setHasSearched(true);
    setPage(pageNum);
    applyCachedResults({
      results: cached.results,
      total: cached.total,
      scrollY: cached.scrollY,
      filters: f,
      page: pageNum,
    });

    if (!urlRan) {
      const params =
        cached.urlQuery != null && cached.urlQuery.length > 0
          ? new URLSearchParams(cached.urlQuery)
          : contactFiltersToSearchParams({ ...f, page: String(pageNum) });
      if (!params.get("ran")) params.set("ran", "1");
      if (searchParams.get("focus") === "1") params.set("focus", "1");
      router.replace(`/contacts/search?${params.toString()}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only restore
  }, []);

  // Same-page nav click: clear without remount.
  useEffect(() => {
    const onFresh = (ev: Event) => {
      const detail = (ev as CustomEvent<{ freshKey?: string }>).detail;
      if (detail?.freshKey !== CONTACTS_SEARCH_FRESH_KEY) return;
      consumeSearchFreshIntent(CONTACTS_SEARCH_FRESH_KEY);
      clearSearchSessionState(CONTACTS_SEARCH_STATE_KEY);
      restoredFingerprintRef.current = null;
      setRestoredFromCache(false);
      const d = getDefaultContactFilters();
      setDraftFilters(d);
      setAppliedFilters(null);
      lastListParamsRef.current = null;
      setHasSearched(false);
      setContacts([]);
      setTotal(0);
      setPage(1);
      router.replace("/contacts/search", { scroll: false });
    };
    window.addEventListener(SEARCH_FRESH_EVENT, onFresh);
    return () => window.removeEventListener(SEARCH_FRESH_EVENT, onFresh);
  }, [router]);

  const syncFromUrl = useCallback(() => {
    const sp = new URLSearchParams(searchParams.toString());
    const ran = sp.get("ran") === "1";
    const f = cloneContactListFilters(searchParamsToFilters(sp, getDefaultContactFilters()));
    setDraftFilters(f);
    if (ran) {
      setAppliedFilters(f);
      setHasSearched(true);
      setPage(Math.max(1, parseInt(f.page || "1", 10) || 1));
    }
  }, [searchParams]);

  useEffect(() => {
    if (skipUrlSyncOnceRef.current) {
      skipUrlSyncOnceRef.current = false;
      return;
    }
    syncFromUrl();
  }, [syncFromUrl]);

  useEffect(() => {
    const enabled = searchParams.get("focus") === "1";
    setFocusMode(enabled);
    applyFocusModeDom(enabled);
  }, [searchParams, applyFocusModeDom]);

  useEffect(() => {
    return () => document.body.classList.remove("focus-mode");
  }, []);

  useEffect(() => {
    if (!focusMode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleSetFocusMode(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [focusMode, handleSetFocusMode]);

  const loadResults = useCallback(async (f: ContactListFilters, pageNum: number) => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    try {
      const params = contactFiltersToSearchParams({ ...cloneContactListFilters(f), page: String(pageNum) });
      params.set("page_size", String(PAGE_SIZE));
      params.set("partial_location", "1");
      const res = await fetchWithTimeout(`/api/contacts?${params.toString()}`, {
        timeoutMs: CONTACT_LIST_FETCH_TIMEOUT_MS,
      });
      const data = (await res.json().catch(() => ({}))) as {
        contacts?: ContactSearchResult[];
        total?: number;
      };
      if (seq !== loadSeqRef.current) return;
      if (!res.ok) {
        setContacts([]);
        setTotal(0);
        return;
      }
      lastListParamsRef.current = new URLSearchParams(params.toString());
      const list = (data.contacts ?? []).map((c) => {
        const g = c.contact_groups;
        const contact_groups = Array.isArray(g) ? g[0] ?? null : g ?? null;
        return { ...c, contact_groups } as ContactSearchResult;
      });
      setContacts(list);
      setTotal(typeof data.total === "number" ? data.total : list.length);
      setRestoredFromCache(false);
    } catch {
      if (seq !== loadSeqRef.current) return;
      setContacts([]);
      setTotal(0);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loading) {
      setSlowSearch(false);
      return;
    }
    const t = window.setTimeout(() => setSlowSearch(true), 500);
    return () => window.clearTimeout(t);
  }, [loading]);

  useEffect(() => {
    if (!hasSearched || !appliedFilters) return;
    if (
      restoredFingerprintRef.current != null &&
      restoredFingerprintRef.current === contactSearchFingerprint(appliedFilters, page)
    ) {
      return;
    }
    restoredFingerprintRef.current = null;
    void loadResults(appliedFilters, page);
  }, [hasSearched, appliedFilters, page, loadResults, contactSearchFingerprint]);

  const runSearch = useCallback(
    (f: ContactListFilters) => {
      clearSearchSessionState(CONTACTS_SEARCH_STATE_KEY);
      restoredFingerprintRef.current = null;
      setRestoredFromCache(false);
      const next = { ...cloneContactListFilters(f), page: "1" };
      setDraftFilters(next);
      setAppliedFilters(next);
      setHasSearched(true);
      setPage(1);
      const params = contactFiltersToSearchParams(next);
      params.set("ran", "1");
      if (focusMode) params.set("focus", "1");
      router.replace(`/contacts/search?${params.toString()}`, { scroll: false });
    },
    [router, focusMode],
  );

  const toggleFiltersOpen = () => {
    setFiltersOpen((v) => {
      const next = !v;
      try {
        localStorage.setItem(STORAGE_FILTERS_OPEN, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const clearFilters = () => {
    clearSearchSessionState(CONTACTS_SEARCH_STATE_KEY);
    restoredFingerprintRef.current = null;
    setRestoredFromCache(false);
    const d = getDefaultContactFilters();
    setDraftFilters(d);
    setAppliedFilters(null);
    lastListParamsRef.current = null;
    setHasSearched(false);
    setContacts([]);
    setTotal(0);
    setPage(1);
    router.replace("/contacts/search", { scroll: false });
  };

  const buildExportParams = useCallback(() => {
    if (lastListParamsRef.current) {
      return listSearchParamsToExportParams(lastListParamsRef.current);
    }
    if (!appliedFilters) return null;
    return contactFiltersToExportParams(appliedFilters);
  }, [appliedFilters]);

  const chips = useMemo(
    () => (appliedFilters ? buildContactSearchFilterChips(appliedFilters, groupNames, sourceNames) : []),
    [appliedFilters, groupNames, sourceNames],
  );

  const dismissChip = (key: string) => {
    if (!appliedFilters) return;
    const f = cloneContactListFilters(appliedFilters);
    if (key === "first_name") f.first_name = "";
    else if (key === "last_name") f.last_name = "";
    else if (key === "father_name") f.father_name = "";
    else if (key === "gender") f.gender = "";
    else if (key === "age") {
      f.age_min = "";
      f.age_max = "";
    } else if (key === "birthday_today") f.birthday_today = false;
    else if (key === "nameday_today") f.nameday_today = false;
    else if (key.startsWith("muni:")) {
      const name = key.slice(5);
      f.municipalities = f.municipalities.filter((x) => x !== name);
    } else if (key.startsWith("top:")) {
      const name = key.slice(4);
      f.toponyms = f.toponyms.filter((x) => x !== name);
    }
    else if (key === "phone") f.phone = "";
    else if (key === "mobile_presence") f.mobile_presence = "";
    else if (key === "landline_presence") f.landline_presence = "";
    else if (key === "email_presence") f.email_presence = "";
    else if (key === "group_match") f.group_match = "or";
    else if (key === "ekl_ar") f.ekl_ar = "";
    else if (key === "electoral_district") f.electoral_district = "";
    else if (key === "has_request") f.has_request = "";
    else if (key === "request_status") f.request_status = "";
    else if (key === "search") f.search = "";
    else if (key.startsWith("group:")) {
      const id = key.slice(6);
      f.group_ids = f.group_ids.filter((x) => x !== id);
    } else if (key.startsWith("exgroup:")) {
      const id = key.slice(8);
      f.exclude_group_ids = f.exclude_group_ids.filter((x) => x !== id);
    } else if (key.startsWith("src:")) {
      const id = key.slice(4);
      f.source_ids = f.source_ids.filter((x) => x !== id);
    } else if (key.startsWith("exsrc:")) {
      const id = key.slice(6);
      f.exclude_source_ids = f.exclude_source_ids.filter((x) => x !== id);
    }
    setDraftFilters(f);
    runSearch(f);
  };

  const contactHref = useCallback(
    (id: string) => (focusMode ? `/contacts/${id}?focus=1` : `/contacts/${id}`),
    [focusMode],
  );
  const navigateToContact = useCallback(
    (id: string) => {
      persistSearchState();
      router.push(contactHref(id));
    },
    [persistSearchState, router, contactHref],
  );
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleExport = useCallback(async () => {
    const params = buildExportParams();
    if (!params) return;
    setExporting(true);
    try {
      const res = await fetchWithTimeout(`/api/contacts/export?${params.toString()}`, {
        timeoutMs: PRINT_FETCH_TIMEOUT_MS,
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        showToast(err.error ?? "Αποτυχία εξαγωγής Excel.", "error");
        return;
      }

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const contentDisposition = res.headers.get("content-disposition") ?? "";
      const fileNameMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
      const fileName = fileNameMatch?.[1] ?? "contacts-export.xlsx";
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      showToast("Αποτυχία εξαγωγής Excel.", "error");
    } finally {
      setExporting(false);
    }
  }, [buildExportParams, showToast]);

  const handlePrint = useCallback(async () => {
    const params = buildExportParams();
    if (!params) return;
    setPrinting(true);
    try {
      params.set("format", "json");
      const res = await fetchWithTimeout(`/api/contacts/export?${params.toString()}`, {
        timeoutMs: PRINT_FETCH_TIMEOUT_MS,
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        showToast(err.error ?? "Αποτυχία εκτύπωσης.", "error");
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { contacts?: PrintableContactRow[] };
      const printRows = data.contacts ?? [];
      const printDate = new Intl.DateTimeFormat("el-GR", {
        dateStyle: "short",
      }).format(new Date());
      const filterSummary = chips.length > 0 ? chips.map((chip) => chip.label).join(" | ") : "Χωρίς φίλτρα";
      const tableRows = printRows
        .map((row) => {
          const cells = [
            row.last_name || "",
            row.first_name || "",
            row.father_name || "",
            row.phone || "",
            row.municipality || "",
            row.groups.join(", "),
            row.political_stance || "",
          ];
          return `<tr>${cells.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`;
        })
        .join("");

      const printWindow = window.open("", "_blank", "noopener,noreferrer");
      if (!printWindow) {
        showToast("Το παράθυρο εκτύπωσης μπλοκαρίστηκε από τον browser.", "error");
        return;
      }
      const html = `<!doctype html>
<html lang="el">
<head>
  <meta charset="utf-8" />
  <title>Αποτελέσματα Αναζήτησης Επαφών</title>
  <style>
    :root { color-scheme: light; }
    body { font-family: Inter, Arial, sans-serif; margin: 0; color: #111827; background: #fff; }
    .print-root { padding: 20px 24px; }
    h1 { margin: 0 0 8px; font-size: 20px; }
    .print-meta { margin: 0 0 12px; font-size: 12px; color: #374151; }
    .print-count { margin: 0 0 12px; font-size: 12px; color: #374151; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; vertical-align: top; font-size: 12px; word-break: break-word; }
    thead th { background: #f3f4f6; font-weight: 700; }
    @media print {
      html, body { margin: 0; padding: 0; }
      body * { visibility: hidden; }
      .print-root, .print-root * { visibility: visible; }
      .print-root { position: absolute; inset: 0; padding: 16mm 12mm; }
      @page { size: A4 landscape; margin: 10mm; }
    }
  </style>
</head>
<body>
  <div class="print-root">
    <h1>${escapeHtml(`Αποτελέσματα Αναζήτησης Επαφών — ${printDate}`)}</h1>
    <p class="print-meta">${escapeHtml(filterSummary)}</p>
    <p class="print-count">${escapeHtml(`Σύνολο αποτελεσμάτων: ${printRows.length.toLocaleString("el-GR")}`)}</p>
    <table>
      <thead>
        <tr>${PRINT_HEADERS.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${tableRows || '<tr><td colspan="7">Δεν βρέθηκαν επαφές.</td></tr>'}
      </tbody>
    </table>
  </div>
  <script>
    window.addEventListener("load", () => {
      window.print();
    });
    window.addEventListener("afterprint", () => {
      window.close();
    });
  </script>
</body>
</html>`;
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
    } catch {
      showToast("Αποτυχία εκτύπωσης.", "error");
    } finally {
      setPrinting(false);
    }
  }, [buildExportParams, chips, showToast]);

  const [filtersToSave, setFiltersToSave] = useState<ContactListFilters | null>(null);

  const handleSaveFilters = (f: ContactListFilters) => {
    if (!isAdmin) {
      showToast("Η αποθήκευση φίλτρων απαιτεί δικαιώματα διαχειριστή.", "error");
      return;
    }
    setFiltersToSave(f);
    setSaveModalOpen(true);
  };

  const submitSaveFilter = async () => {
    const name = saveName.trim();
    if (!name || !filtersToSave) return;
    setSavingFilters(true);
    try {
      const res = await fetchWithTimeout("/api/saved-filters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, filters: filtersToSave }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        showToast(data.error ?? "Αποτυχία αποθήκευσης", "error");
        return;
      }
      showToast("Τα φίλτρα αποθηκεύτηκαν.", "success");
      setSaveModalOpen(false);
      setSaveName("");
    } catch {
      showToast("Αποτυχία αποθήκευσης", "error");
    } finally {
      setSavingFilters(false);
    }
  };

  const filtersPanel = (
    <ContactSearchFiltersPanel
      filters={draftFilters}
      onChange={setDraftFilters}
      onSearch={runSearch}
      onClear={clearFilters}
      onSaveFilters={handleSaveFilters}
      savingFilters={savingFilters}
    />
  );

  const replaceSearchUrl = useCallback(
    (params: URLSearchParams) => {
      if (focusMode) params.set("focus", "1");
      router.replace(`/contacts/search?${params.toString()}`, { scroll: false });
    },
    [router, focusMode],
  );

  return (
    <div
      className={cn(
        "transition-all duration-300",
        focusMode && "fixed inset-0 z-[200] flex flex-col overflow-hidden bg-background",
      )}
    >
      {focusMode && (
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-6 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Search className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            <span className="font-semibold text-foreground">Αναζήτηση Επαφών</span>
            {hasSearched ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {total.toLocaleString("el-GR")} επαφές
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:inline">ESC για έξοδο</span>
            <button
              type="button"
              onClick={() => handleSetFocusMode(false)}
              className="hidden items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm transition-colors hover:bg-muted sm:flex"
            >
              Έξοδος Εστίασης
            </button>
            <button
              type="button"
              onClick={() => handleSetFocusMode(false)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border transition-colors hover:bg-muted"
              aria-label="Έξοδος από λειτουργία εστίασης"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      <div className={cn(focusMode && "flex min-h-0 flex-1 flex-col overflow-auto")}>
        <div className={cn(lux.pageBg, lux.pageAnimated, "flex min-h-0 flex-1 flex-col", focusMode && "px-6 py-4")}>
          {!focusMode ? (
            <PageHeader title="Αναζήτηση Επαφών" subtitle="Προχωρημένα φίλτρα και στοχευμένη λίστα" />
          ) : null}

          <div className="relative flex min-h-0 flex-1 gap-0">
            {/* Desktop filters */}
            {!focusMode ? (
        <aside
          className={cn(
            "relative hidden h-screen shrink-0 flex-col overflow-hidden border-r border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-elevated)_92%,var(--bg-primary))] transition-[width] duration-300 ease-in-out lg:flex",
            filtersOpen ? "w-[320px]" : "w-0 overflow-hidden border-r-0",
          )}
          style={{ width: filtersOpen ? FILTERS_WIDTH : 0 }}
        >
          <div className="flex h-full w-[320px] flex-col p-4">{filtersPanel}</div>
          <FilterSidebarToggle open={filtersOpen} onClick={toggleFiltersOpen} className="hidden lg:flex" />
        </aside>
            ) : null}

            {!focusMode && !filtersOpen ? (
          <FilterSidebarToggle open={false} onClick={toggleFiltersOpen} className="left-0 hidden lg:flex" />
            ) : null}

            {/* Results */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col p-3 pb-20 sm:p-4 lg:p-5">
          <SearchResultsHeader
            count={total}
            countLabel="αποτελέσματα"
            hasSearched={hasSearched}
            idleTitle="Αναζήτηση Επαφών"
            leadingActions={
              <>
                {!focusMode ? (
                  <button
                    type="button"
                    className={cn(lux.btnSecondary, "inline-flex lg:hidden !h-9 !min-h-9 !rounded-lg !px-3 !py-0 text-xs")}
                    onClick={() => setMobileFiltersOpen(true)}
                  >
                    <Filter className="h-3.5 w-3.5" />
                    Φίλτρα
                  </button>
                ) : null}
                {!focusMode ? (
                  <button
                    type="button"
                    onClick={() => handleSetFocusMode(true)}
                    title="Λειτουργία εστίασης"
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[var(--border)] px-3 text-xs transition-colors hover:bg-[var(--bg-elevated)]"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Εστίαση</span>
                  </button>
                ) : null}
              </>
            }
            exportButton={
              hasSearched && hasMinRole(profile?.role, "manager")
                ? { onClick: () => void handleExport(), disabled: !total || exporting || printing }
                : undefined
            }
            trailingActions={
              hasSearched && hasMinRole(profile?.role, "manager") ? (
                <button
                  type="button"
                  className={cn(lux.btnSecondary, "inline-flex !h-9 !min-h-9 !rounded-lg !px-3 !py-0 text-xs")}
                  onClick={() => void handlePrint()}
                  disabled={!total || printing || exporting}
                >
                  <Printer className="h-3.5 w-3.5" aria-hidden />
                  Εκτύπωση
                </button>
              ) : undefined
            }
          />

          {chips.length > 0 ? (
            <ContactSearchFilterChips chips={chips} onDismiss={dismissChip} onClearAll={clearFilters} />
          ) : null}

          {restoredFromCache && hasSearched ? (
            <RestoredSearchBanner onDismiss={clearFilters} />
          ) : null}

          <div ref={resultsScrollRef} className="min-h-0 flex-1 overflow-y-auto">
            {!hasSearched ? (
              <EmptyState
                icon={<SlidersHorizontal className="h-12 w-12 text-[var(--text-muted)]" aria-hidden />}
                title="Εφαρμόστε φίλτρα για αναζήτηση"
                subtitle="Ρυθμίστε τα κριτήρια στα αριστερά και πατήστε «Αναζήτηση»."
                className="border border-dashed border-[var(--border)] bg-transparent"
              />
            ) : loading && contacts.length === 0 ? (
              <p className="py-12 text-center text-sm text-[var(--text-muted)]">Φόρτωση...</p>
            ) : contacts.length === 0 ? (
              <EmptyState title="Δεν βρέθηκαν επαφές" subtitle="Δοκιμάστε πιο ευρύ φίλτρο." />
            ) : (
              <SearchResultsOverlay active={loading} slow={slowSearch}>
                <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--card-shadow)]">
                  <ul>
                    {contacts.map((c) => (
                      <li key={c.id}>
                        <ContactSearchResultCard
                          contact={c}
                          onNavigate={() => navigateToContact(c.id)}
                          onOpenInTab={() =>
                            openTab(c.id, `${c.first_name} ${c.last_name}`.trim())
                          }
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              </SearchResultsOverlay>
            )}
          </div>

          {hasSearched ? (
            <SearchPagination
              page={page}
              totalPages={totalPages}
              disabled={loading}
              className="mt-4"
              onPageChange={(next) => {
                restoredFingerprintRef.current = null;
                setRestoredFromCache(false);
                setPage(next);
                if (appliedFilters) {
                  const params = contactFiltersToSearchParams({ ...appliedFilters, page: String(next) });
                  params.set("ran", "1");
                  replaceSearchUrl(params);
                }
              }}
            />
          ) : null}
        </div>
      </div>

      <MobileFilterFab onClick={() => setMobileFiltersOpen(true)} />

      {/* Mobile bottom sheet */}
      {mobileFiltersOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 [background:var(--overlay-scrim)] backdrop-blur-[2px] lg:hidden"
            aria-label="Κλείσιμο φίλτρων"
            onClick={() => setMobileFiltersOpen(false)}
          />
          <div
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[min(88vh,720px)] flex-col rounded-t-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl lg:hidden"
            role="dialog"
            aria-modal
            aria-label="Φίλτρα αναζήτησης"
          >
            <div className="flex justify-center pt-2" aria-hidden>
              <div className="h-1 w-10 rounded-full bg-[var(--border)]" />
            </div>
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <span className="font-semibold text-[var(--text-primary)]">Φίλτρα αναζήτησης</span>
              <button
                type="button"
                className={lux.btnIcon}
                onClick={() => setMobileFiltersOpen(false)}
                aria-label="Κλείσιμο"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden p-3">{filtersPanel}</div>
          </div>
        </>
      ) : null}

      <CenteredModal open={saveModalOpen} onClose={() => setSaveModalOpen(false)} title="Αποθήκευση φίλτρων">
        <div className="space-y-3 p-1">
          <div>
            <label className={lux.label} htmlFor="sf-name">
              Όνομα
            </label>
            <input
              id="sf-name"
              className={lux.input}
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="π.χ. Ενεργοί ψηφοφόροι Αστακού"
            />
          </div>
          <button
            type="button"
            className={lux.btnPrimary + " w-full"}
            disabled={savingFilters || !saveName.trim()}
            onClick={() => void submitSaveFilter()}
          >
            Αποθήκευση
          </button>
        </div>
      </CenteredModal>
        </div>
      </div>
    </div>
  );
}

export default function ContactSearchPage() {
  return (
    <CrmErrorBoundary>
      <Suspense fallback={<p className="p-6 text-sm text-[var(--text-muted)]">Φόρτωση...</p>}>
        <ContactSearchPageInner />
      </Suspense>
    </CrmErrorBoundary>
  );
}
