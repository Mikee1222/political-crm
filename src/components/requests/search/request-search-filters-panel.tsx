"use client";

import { Calendar, FileText, FolderOpen, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { FilterSection } from "@/components/contacts/search/filter-section";
import { FilterFieldChips } from "@/components/contacts/search/filter-field-chips";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { SearchFilterActions } from "@/components/search/search-filter-actions";
import { SearchFilterInput, searchFilterInputClass } from "@/components/search/search-filter-input";
import { fetchWithTimeout } from "@/lib/client-fetch";
import type { RequestCategoryRow } from "@/lib/request-categories";
import type { RequestListFilters } from "@/lib/requests-filters";
import { REQUEST_STATUSES } from "@/lib/request-statuses";
import type { UnlinkedLegacyName } from "@/lib/staff-aliases";
import { cn } from "@/lib/utils";

type Assignee = { id: string; full_name: string | null; role: string };

const filterLabelClass = "mb-1.5 block text-xs font-medium text-[var(--text-secondary)]";

export function RequestSearchFiltersPanel({
  filters,
  onChange,
  onSearch,
  onClear,
}: {
  filters: RequestListFilters;
  onChange: (f: RequestListFilters) => void;
  onSearch: (f: RequestListFilters) => void;
  onClear: () => void;
}) {
  const [draft, setDraft] = useState<RequestListFilters>(filters);
  const [categories, setCategories] = useState<RequestCategoryRow[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [unlinkedHandlers, setUnlinkedHandlers] = useState<UnlinkedLegacyName[]>([]);

  useEffect(() => {
    setDraft(filters);
  }, [filters]);

  useEffect(() => {
    void Promise.all([
      fetchWithTimeout("/api/request-categories").then(async (r) => {
        const d = (await r.json()) as { items?: RequestCategoryRow[] };
        return d.items ?? [];
      }),
      fetchWithTimeout("/api/team/assignees").then(async (r) => {
        const d = (await r.json()) as { assignees?: Assignee[] };
        return d.assignees ?? [];
      }),
      fetchWithTimeout("/api/admin/staff-aliases/unlinked").then(async (r) => {
        if (!r.ok) return [];
        const d = (await r.json()) as { unlinked?: UnlinkedLegacyName[] };
        return d.unlinked ?? [];
      }),
    ]).then(([cats, team, unlinked]) => {
      setCategories(cats);
      setAssignees(team.filter((a) => a.full_name?.trim()));
      setUnlinkedHandlers(unlinked);
    });
  }, []);

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c.name, label: c.name })),
    [categories],
  );

  const statusOptions = useMemo(
    () => REQUEST_STATUSES.map((s) => ({ value: s, label: s })),
    [],
  );

  const assigneeOptions = useMemo(() => {
    const options = assignees.map((a) => ({
      value: a.id,
      label: a.full_name ?? a.id,
    }));
    for (const row of unlinkedHandlers) {
      const name = row.name.trim();
      if (!name) continue;
      options.push({ value: name, label: name });
    }
    return options.sort((a, b) => a.label.localeCompare(b.label, "el"));
  }, [assignees, unlinkedHandlers]);

  const patch = (p: Partial<RequestListFilters>) => setDraft((prev) => ({ ...prev, ...p }));

  const applyAndSearch = () => {
    onChange(draft);
    onSearch(draft);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1 pb-4">
        <FilterSection title="Πρόσωπα Αιτήματος" icon={Users}>
          <div>
            <label className={filterLabelClass} htmlFor="rs-requester">
              Αιτών (επαφή)
            </label>
            <SearchFilterInput
              id="rs-requester"
              withSearchIcon
              value={draft.requester_name}
              onChange={(e) => patch({ requester_name: e.target.value })}
              placeholder="Όνομα ή επώνυμο..."
            />
          </div>
          <div>
            <label className={filterLabelClass} htmlFor="rs-affected">
              Επηρεαζόμενος
            </label>
            <SearchFilterInput
              id="rs-affected"
              withSearchIcon
              value={draft.affected_name}
              onChange={(e) => patch({ affected_name: e.target.value })}
              placeholder="Όνομα ή επώνυμο..."
            />
          </div>
          <div>
            <label className={filterLabelClass} htmlFor="rs-helper">
              Βοηθός
            </label>
            <SearchFilterInput
              id="rs-helper"
              withSearchIcon
              value={draft.helper_name}
              onChange={(e) => patch({ helper_name: e.target.value })}
              placeholder="Όνομα ή επώνυμο..."
            />
          </div>
        </FilterSection>

        <FilterSection title="Κατηγορίες Αιτήματος" icon={FolderOpen}>
          <div>
            <label className={filterLabelClass}>Συμπερίληψη κατηγοριών</label>
            <SearchableMultiSelect
              options={categoryOptions}
              values={draft.category_ids}
              onToggle={(name) =>
                patch({
                  category_ids: draft.category_ids.includes(name)
                    ? draft.category_ids.filter((x) => x !== name)
                    : [...draft.category_ids, name],
                })
              }
              placeholder="Επιλέξτε κατηγορίες..."
            />
            <FilterFieldChips
              items={draft.category_ids.map((name) => ({
                key: name,
                label: name,
              }))}
              onRemove={(name) => patch({ category_ids: draft.category_ids.filter((x) => x !== name) })}
            />
          </div>
          <div>
            <label className={filterLabelClass}>Εξαίρεση κατηγοριών</label>
            <SearchableMultiSelect
              options={categoryOptions}
              values={draft.exclude_category_ids}
              onToggle={(name) =>
                patch({
                  exclude_category_ids: draft.exclude_category_ids.includes(name)
                    ? draft.exclude_category_ids.filter((x) => x !== name)
                    : [...draft.exclude_category_ids, name],
                })
              }
              placeholder="Εξαίρεση..."
            />
            <FilterFieldChips
              items={draft.exclude_category_ids.map((name) => ({
                key: name,
                label: name,
              }))}
              onRemove={(name) =>
                patch({ exclude_category_ids: draft.exclude_category_ids.filter((x) => x !== name) })
              }
            />
          </div>
        </FilterSection>

        <FilterSection title="Στοιχεία Αιτήματος" icon={FileText}>
          <div>
            <label className={filterLabelClass} htmlFor="rs-code">
              Κωδικός αιτήματος
            </label>
            <SearchFilterInput
              id="rs-code"
              value={draft.request_code}
              onChange={(e) => patch({ request_code: e.target.value })}
              placeholder="π.χ. AIT-00042"
            />
          </div>
          <div>
            <label className={filterLabelClass} htmlFor="rs-status">
              Κατάσταση
            </label>
            <SearchableSelect
              id="rs-status"
              options={statusOptions}
              value={draft.status}
              onChange={(status) => patch({ status })}
              placeholder="— όλες —"
            />
          </div>
          <div>
            <label className={filterLabelClass} htmlFor="rs-handler">
              Υπεύθυνος
            </label>
            <SearchableSelect
              id="rs-handler"
              options={assigneeOptions}
              value={draft.handler_id}
              onChange={(handler_id) => patch({ handler_id })}
              placeholder="— όλοι —"
            />
          </div>
          <div>
            <label className={filterLabelClass} htmlFor="rs-search">
              Γενική αναζήτηση
            </label>
            <SearchFilterInput
              id="rs-search"
              withSearchIcon
              value={draft.search}
              onChange={(e) => patch({ search: e.target.value })}
              placeholder="Τίτλος, περιγραφή..."
            />
          </div>
          <div>
            <label className={filterLabelClass} htmlFor="rs-notes">
              Σημειώσεις
            </label>
            <SearchFilterInput
              id="rs-notes"
              value={draft.notes}
              onChange={(e) => patch({ notes: e.target.value })}
              placeholder="Κείμενο σημείωσης..."
            />
          </div>
        </FilterSection>

        <FilterSection title="Ημερομηνίες" icon={Calendar}>
          <div>
            <label className={filterLabelClass} htmlFor="rs-from">
              Δημιουργία από
            </label>
            <input
              id="rs-from"
              type="date"
              className={cn(searchFilterInputClass, "px-3 [color-scheme:dark]")}
              value={draft.created_from}
              onChange={(e) => patch({ created_from: e.target.value })}
            />
          </div>
          <div>
            <label className={filterLabelClass} htmlFor="rs-to">
              Δημιουργία έως
            </label>
            <input
              id="rs-to"
              type="date"
              className={cn(searchFilterInputClass, "px-3 [color-scheme:dark]")}
              value={draft.created_to}
              onChange={(e) => patch({ created_to: e.target.value })}
            />
          </div>
        </FilterSection>
      </div>

      <SearchFilterActions onSearch={applyAndSearch} onClear={onClear} />
    </div>
  );
}
