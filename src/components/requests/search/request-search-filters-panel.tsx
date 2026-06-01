"use client";

import { useEffect, useMemo, useState } from "react";
import { FilterSection } from "@/components/contacts/search/filter-section";
import { FilterFieldChips } from "@/components/contacts/search/filter-field-chips";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { HqSelect } from "@/components/ui/hq-select";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { lux } from "@/lib/luxury-styles";
import type { RequestCategoryRow } from "@/lib/request-categories";
import type { RequestListFilters } from "@/lib/requests-filters";
import { REQUEST_STATUSES } from "@/lib/request-statuses";

type Assignee = { id: string; full_name: string | null; role: string };

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
    ]).then(([cats, team]) => {
      setCategories(cats);
      setAssignees(team.filter((a) => a.full_name?.trim()));
    });
  }, []);

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c.name, label: c.name })),
    [categories],
  );

  const patch = (p: Partial<RequestListFilters>) => setDraft((prev) => ({ ...prev, ...p }));

  const applyAndSearch = () => {
    onChange(draft);
    onSearch(draft);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1 pb-3">
        <FilterSection title="Πρόσωπα Αιτήματος">
          <div>
            <label className={lux.label} htmlFor="rs-requester">
              Αιτών (επαφή)
            </label>
            <input
              id="rs-requester"
              className={lux.input}
              value={draft.requester_name}
              onChange={(e) => patch({ requester_name: e.target.value })}
              placeholder="Όνομα ή επώνυμο..."
            />
          </div>
          <div>
            <label className={lux.label} htmlFor="rs-affected">
              Επηρεαζόμενος
            </label>
            <input
              id="rs-affected"
              className={lux.input}
              value={draft.affected_name}
              onChange={(e) => patch({ affected_name: e.target.value })}
              placeholder="Όνομα ή επώνυμο..."
            />
          </div>
          <div>
            <label className={lux.label} htmlFor="rs-helper">
              Βοηθός
            </label>
            <input
              id="rs-helper"
              className={lux.input}
              value={draft.helper_name}
              onChange={(e) => patch({ helper_name: e.target.value })}
              placeholder="Όνομα ή επώνυμο..."
            />
          </div>
        </FilterSection>

        <FilterSection title="Κατηγορίες Αιτήματος">
          <div>
            <label className={lux.label}>Συμπερίληψη κατηγοριών</label>
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
            <label className={lux.label}>Εξαίρεση κατηγοριών</label>
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

        <FilterSection title="Στοιχεία Αιτήματος">
          <div>
            <label className={lux.label} htmlFor="rs-code">
              Κωδικός αιτήματος
            </label>
            <input
              id="rs-code"
              className={lux.input}
              value={draft.request_code}
              onChange={(e) => patch({ request_code: e.target.value })}
              placeholder="π.χ. AIT-00042"
            />
          </div>
          <div>
            <label className={lux.label} htmlFor="rs-status">
              Κατάσταση
            </label>
            <HqSelect
              id="rs-status"
              value={draft.status}
              onChange={(e) => patch({ status: e.target.value })}
            >
              <option value="">— όλες —</option>
              {REQUEST_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </HqSelect>
          </div>
          <div>
            <label className={lux.label} htmlFor="rs-handler">
              Υπεύθυνος
            </label>
            <HqSelect
              id="rs-handler"
              value={draft.handler_id}
              onChange={(e) => patch({ handler_id: e.target.value })}
            >
              <option value="">— όλοι —</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.full_name}
                </option>
              ))}
            </HqSelect>
          </div>
          <div>
            <label className={lux.label} htmlFor="rs-search">
              Γενική αναζήτηση
            </label>
            <input
              id="rs-search"
              className={lux.input}
              value={draft.search}
              onChange={(e) => patch({ search: e.target.value })}
              placeholder="Τίτλος, περιγραφή..."
            />
          </div>
          <div>
            <label className={lux.label} htmlFor="rs-notes">
              Σημειώσεις
            </label>
            <input
              id="rs-notes"
              className={lux.input}
              value={draft.notes}
              onChange={(e) => patch({ notes: e.target.value })}
              placeholder="Κείμενο σημείωσης..."
            />
          </div>
        </FilterSection>

        <FilterSection title="Ημερομηνίες">
          <div>
            <label className={lux.label} htmlFor="rs-from">
              Δημιουργία από
            </label>
            <input
              id="rs-from"
              type="date"
              className={lux.input}
              value={draft.created_from}
              onChange={(e) => patch({ created_from: e.target.value })}
            />
          </div>
          <div>
            <label className={lux.label} htmlFor="rs-to">
              Δημιουργία έως
            </label>
            <input
              id="rs-to"
              type="date"
              className={lux.input}
              value={draft.created_to}
              onChange={(e) => patch({ created_to: e.target.value })}
            />
          </div>
        </FilterSection>
      </div>

      <div className="shrink-0 space-y-2 border-t border-[var(--border)] bg-[var(--bg-elevated)]/80 pt-3">
        <button type="button" className={lux.btnPrimary + " w-full !rounded-xl !py-3"} onClick={applyAndSearch}>
          Αναζήτηση
        </button>
        <button type="button" className={lux.btnSecondary + " w-full"} onClick={onClear}>
          Καθαρισμός
        </button>
      </div>
    </div>
  );
}
