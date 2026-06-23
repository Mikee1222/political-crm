"use client";

import { Filter, Maximize2, Search, SlidersHorizontal, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
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
import { SearchPagination } from "@/components/search/search-pagination";
import { SearchResultsHeader } from "@/components/search/search-results-header";
import { EmptyState } from "@/components/ui/empty-state";
import { MobileFilterFab } from "@/components/mobile/mobile-filter-fab";
import { PageHeader } from "@/components/ui/page-header";
import { useContactTabs } from "@/contexts/contact-tabs-context";
import { useFormToast } from "@/contexts/form-toast-context";
import { useProfile } from "@/contexts/profile-context";
import { fetchWithTimeout } from "@/lib/client-fetch";
import type { ContactGroupRow } from "@/lib/contact-groups";
import {
  contactFiltersToExportParams,
  contactFiltersToSearchParams,
  getDefaultContactFilters,
  searchParamsToFilters,
  type ContactListFilters,
} from "@/lib/contacts-filters";
import { dedupeContactGroupsById } from "@/lib/contact-groups";
import { lux } from "@/lib/luxury-styles";
import { hasMinRole } from "@/lib/roles";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;
const FILTERS_WIDTH = 320;
const STORAGE_FILTERS_OPEN = "crm-contact-search-filters-open";

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
  const [groups, setGroups] = useState<ContactGroupRow[]>([]);
  const [sources, setSources] = useState<{ id: string; name: string }[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [savingFilters, setSavingFilters] = useState(false);
  const [focusMode, setFocusMode] = useState(false);

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
  const syncFromUrl = useCallback(() => {
    const sp = new URLSearchParams(searchParams.toString());
    const ran = sp.get("ran") === "1";
    const f = searchParamsToFilters(sp, getDefaultContactFilters());
    setDraftFilters(f);
    if (ran) {
      setAppliedFilters(f);
      setHasSearched(true);
      setPage(Math.max(1, parseInt(f.page || "1", 10) || 1));
    }
  }, [searchParams]);

  useEffect(() => {
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
    setLoading(true);
    try {
      const params = contactFiltersToSearchParams({ ...f, page: String(pageNum) });
      params.set("page_size", String(PAGE_SIZE));
      const res = await fetchWithTimeout(`/api/contacts?${params.toString()}`);
      const data = (await res.json().catch(() => ({}))) as {
        contacts?: ContactSearchResult[];
        total?: number;
      };
      if (!res.ok) {
        setContacts([]);
        setTotal(0);
        return;
      }
      const list = (data.contacts ?? []).map((c) => {
        const g = c.contact_groups;
        const contact_groups = Array.isArray(g) ? g[0] ?? null : g ?? null;
        return { ...c, contact_groups } as ContactSearchResult;
      });
      setContacts(list);
      setTotal(typeof data.total === "number" ? data.total : list.length);
    } catch {
      setContacts([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasSearched || !appliedFilters) return;
    void loadResults(appliedFilters, page);
  }, [hasSearched, appliedFilters, page, loadResults]);

  const runSearch = useCallback(
    (f: ContactListFilters) => {
      const next = { ...f, page: "1" };
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
    const d = getDefaultContactFilters();
    setDraftFilters(d);
    setAppliedFilters(null);
    setHasSearched(false);
    setContacts([]);
    setTotal(0);
    setPage(1);
    router.replace("/contacts/search", { scroll: false });
  };

  const chips = useMemo(
    () => (appliedFilters ? buildContactSearchFilterChips(appliedFilters, groupNames, sourceNames) : []),
    [appliedFilters, groupNames, sourceNames],
  );

  const dismissChip = (key: string) => {
    if (!appliedFilters) return;
    const f = { ...appliedFilters };
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

  const contactHref = (id: string) => (focusMode ? `/contacts/${id}?focus=1` : `/contacts/${id}`);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleExport = () => {
    if (!appliedFilters) return;
    const p = contactFiltersToExportParams(appliedFilters);
    window.open(`/api/contacts/export?${p.toString()}`, "_blank", "noopener,noreferrer");
  };

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
            "relative hidden shrink-0 flex-col border-r border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-elevated)_92%,var(--bg-primary))] transition-[width] duration-300 ease-in-out lg:flex",
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
                ? { onClick: handleExport, disabled: !total }
                : undefined
            }
          />

          {chips.length > 0 ? (
            <ContactSearchFilterChips chips={chips} onDismiss={dismissChip} onClearAll={clearFilters} />
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {!hasSearched ? (
              <EmptyState
                icon={<SlidersHorizontal className="h-12 w-12 text-[var(--text-muted)]" aria-hidden />}
                title="Εφαρμόστε φίλτρα για αναζήτηση"
                subtitle="Ρυθμίστε τα κριτήρια στα αριστερά και πατήστε «Αναζήτηση»."
                className="border border-dashed border-[var(--border)] bg-transparent"
              />
            ) : loading ? (
              <p className="py-12 text-center text-sm text-[var(--text-muted)]">Φόρτωση...</p>
            ) : contacts.length === 0 ? (
              <EmptyState title="Δεν βρέθηκαν επαφές" subtitle="Δοκιμάστε πιο ευρύ φίλτρο." />
            ) : (
              <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--card-shadow)]">
                <ul>
                  {contacts.map((c) => (
                    <li key={c.id}>
                      <ContactSearchResultCard
                        contact={c}
                        onNavigate={() => router.push(contactHref(c.id))}
                        onOpenInTab={() =>
                          openTab(c.id, `${c.first_name} ${c.last_name}`.trim())
                        }
                      />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {hasSearched ? (
            <SearchPagination
              page={page}
              totalPages={totalPages}
              disabled={loading}
              className="mt-4"
              onPageChange={(next) => {
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
