"use client";

import { Filter, SlidersHorizontal, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { CrmErrorBoundary } from "@/components/crm-error-boundary";
import {
  buildRequestSearchFilterChips,
  RequestSearchFilterChips,
} from "@/components/requests/search/request-search-filter-chips";
import { RequestSearchFiltersPanel } from "@/components/requests/search/request-search-filters-panel";
import {
  RequestSearchResultCard,
  type RequestSearchResult,
} from "@/components/requests/search/request-search-result-card";
import { FilterSidebarToggle } from "@/components/search/filter-sidebar-toggle";
import { SearchPagination } from "@/components/search/search-pagination";
import { SearchResultsHeader } from "@/components/search/search-results-header";
import { MobileFilterFab } from "@/components/mobile/mobile-filter-fab";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { fetchWithTimeout } from "@/lib/client-fetch";
import type { RequestCategoryRow } from "@/lib/request-categories";
import {
  getDefaultRequestFilters,
  requestFiltersToSearchParams,
  searchParamsToRequestFilters,
  type RequestListFilters,
} from "@/lib/requests-filters";
import { useRequestStatusColors } from "@/hooks/use-request-status-colors";
import { lux } from "@/lib/luxury-styles";
import type { UnlinkedLegacyName } from "@/lib/staff-aliases";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;
const FILTERS_WIDTH = 320;
const STORAGE_FILTERS_OPEN = "crm-request-search-filters-open";

function RequestSearchPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { colors: statusColors } = useRequestStatusColors();

  const [draftFilters, setDraftFilters] = useState<RequestListFilters>(getDefaultRequestFilters);
  const [appliedFilters, setAppliedFilters] = useState<RequestListFilters | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [requests, setRequests] = useState<RequestSearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<RequestCategoryRow[]>([]);
  const [assignees, setAssignees] = useState<{ id: string; full_name: string | null }[]>([]);
  const [unlinkedHandlers, setUnlinkedHandlers] = useState<UnlinkedLegacyName[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

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
      fetchWithTimeout("/api/request-categories").then(async (r) => {
        const d = (await r.json()) as { items?: RequestCategoryRow[] };
        return d.items ?? [];
      }),
      fetchWithTimeout("/api/team/assignees").then(async (r) => {
        const d = (await r.json()) as { assignees?: { id: string; full_name: string | null }[] };
        return d.assignees ?? [];
      }),
      fetchWithTimeout("/api/staff-aliases/unlinked").then(async (r) => {
        if (!r.ok) return [];
        const d = (await r.json()) as { unlinked?: UnlinkedLegacyName[] };
        return d.unlinked ?? [];
      }),
    ]).then(([cats, team, unlinked]) => {
      setCategories(cats);
      setAssignees(team);
      setUnlinkedHandlers(unlinked);
    });
  }, []);

  const categoryNames = useMemo(() => new Map(categories.map((c) => [c.name, c.name])), [categories]);
  const handlerNames = useMemo(() => {
    const map = new Map(assignees.map((a) => [a.id, a.full_name ?? a.id]));
    for (const row of unlinkedHandlers) {
      const name = row.name.trim();
      if (name) map.set(name, name);
    }
    return map;
  }, [assignees, unlinkedHandlers]);

  const syncFromUrl = useCallback(() => {
    const sp = new URLSearchParams(searchParams.toString());
    const ran = sp.get("ran") === "1";
    const f = searchParamsToRequestFilters(sp, getDefaultRequestFilters());
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

  const loadResults = useCallback(async (f: RequestListFilters, pageNum: number) => {
    setLoading(true);
    try {
      const params = requestFiltersToSearchParams({ ...f, page: String(pageNum) });
      params.set("page_size", String(PAGE_SIZE));
      const res = await fetchWithTimeout(`/api/requests?${params.toString()}`);
      const data = (await res.json().catch(() => ({}))) as {
        data?: RequestSearchResult[];
        requests?: RequestSearchResult[];
        count?: number;
      };
      if (!res.ok) {
        setRequests([]);
        setTotal(0);
        return;
      }
      const list = data.data ?? data.requests ?? [];
      setRequests(list);
      setTotal(typeof data.count === "number" ? data.count : list.length);
    } catch {
      setRequests([]);
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
    (f: RequestListFilters) => {
      const next = { ...f, page: "1" };
      setDraftFilters(next);
      setAppliedFilters(next);
      setHasSearched(true);
      setPage(1);
      const params = requestFiltersToSearchParams(next);
      params.set("ran", "1");
      router.replace(`/requests/search?${params.toString()}`, { scroll: false });
    },
    [router],
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
    const d = getDefaultRequestFilters();
    setDraftFilters(d);
    setAppliedFilters(null);
    setHasSearched(false);
    setRequests([]);
    setTotal(0);
    setPage(1);
    router.replace("/requests/search", { scroll: false });
  };

  const chips = useMemo(
    () =>
      appliedFilters ? buildRequestSearchFilterChips(appliedFilters, categoryNames, handlerNames) : [],
    [appliedFilters, categoryNames, handlerNames],
  );

  const dismissChip = (key: string) => {
    if (!appliedFilters) return;
    const f = { ...appliedFilters };
    if (key === "search") f.search = "";
    else if (key === "status") f.status = "";
    else if (key === "requester_contact_id") {
      f.requester_contact_id = "";
      f.requester_name = "";
    } else if (key === "affected_contact_id") {
      f.affected_contact_id = "";
      f.affected_name = "";
    } else if (key === "helper_contact_id") {
      f.helper_contact_id = "";
      f.helper_name = "";
    }
    else if (key === "request_code") f.request_code = "";
    else if (key === "handler_id") f.handler_id = "";
    else if (key === "notes") f.notes = "";
    else if (key === "created_from") f.created_from = "";
    else if (key === "created_to") f.created_to = "";
    else if (key.startsWith("cat:")) {
      const id = key.slice(4);
      f.category_ids = f.category_ids.filter((x) => x !== id);
    } else if (key.startsWith("excat:")) {
      const id = key.slice(6);
      f.exclude_category_ids = f.exclude_category_ids.filter((x) => x !== id);
    }
    setDraftFilters(f);
    runSearch(f);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const filtersPanel = (
    <RequestSearchFiltersPanel
      filters={draftFilters}
      onChange={setDraftFilters}
      onSearch={runSearch}
      onClear={clearFilters}
    />
  );

  return (
    <div className={cn(lux.pageBg, lux.pageAnimated, "flex min-h-0 flex-1 flex-col")}>
      <PageHeader title="Αναζήτηση Αιτημάτων" subtitle="Προχωρημένα φίλτρα και στοχευμένη λίστα" />

      <div className="relative flex min-h-0 flex-1 gap-0">
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

        {!filtersOpen ? (
          <FilterSidebarToggle open={false} onClick={toggleFiltersOpen} className="left-0 hidden lg:flex" />
        ) : null}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col p-3 pb-20 sm:p-4 lg:p-5">
          <SearchResultsHeader
            count={total}
            countLabel="αποτελέσματα"
            hasSearched={hasSearched}
            idleTitle="Αναζήτηση Αιτημάτων"
            leadingActions={
              <button
                type="button"
                className={cn(lux.btnSecondary, "inline-flex lg:hidden !h-9 !min-h-9 !rounded-lg !px-3 !py-0 text-xs")}
                onClick={() => setMobileFiltersOpen(true)}
              >
                <Filter className="h-3.5 w-3.5" />
                Φίλτρα
              </button>
            }
          />

          {chips.length > 0 ? (
            <RequestSearchFilterChips chips={chips} onDismiss={dismissChip} onClearAll={clearFilters} />
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
            ) : requests.length === 0 ? (
              <EmptyState title="Δεν βρέθηκαν αιτήματα" subtitle="Δοκιμάστε πιο ευρύ φίλτρο." />
            ) : (
              <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--card-shadow)]">
                <ul>
                  {requests.map((r) => (
                    <li key={r.id}>
                      <RequestSearchResultCard
                        request={r}
                        statusColors={statusColors}
                        onNavigate={() => router.push(`/requests/${r.id}`)}
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
                  const params = requestFiltersToSearchParams({ ...appliedFilters, page: String(next) });
                  params.set("ran", "1");
                  router.replace(`/requests/search?${params.toString()}`, { scroll: false });
                }
              }}
            />
          ) : null}
        </div>
      </div>

      <MobileFilterFab onClick={() => setMobileFiltersOpen(true)} />

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
    </div>
  );
}

export default function RequestSearchPage() {
  return (
    <CrmErrorBoundary>
      <Suspense fallback={<p className="p-6 text-sm text-[var(--text-muted)]">Φόρτωση...</p>}>
        <RequestSearchPageInner />
      </Suspense>
    </CrmErrorBoundary>
  );
}
