"use client";

import {
  FileText,
  MapPin,
  Phone,
  User,
  Users,
  Vote,
  Database,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { lux } from "@/lib/luxury-styles";
import type { ContactListFilters } from "@/lib/contacts-filters";
import {
  CONTACT_SEARCH_AGE_GROUPS,
  EKL_AR_OPTIONS,
  GENDER_OPTIONS,
  HAS_REQUEST_OPTIONS,
  PRESENCE_OPTIONS,
} from "@/lib/contact-search-constants";
import { REQUEST_STATUSES } from "@/lib/request-statuses";
import { FilterSection } from "@/components/contacts/search/filter-section";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { FilterFieldChips } from "@/components/contacts/search/filter-field-chips";
import { SearchFilterActions } from "@/components/search/search-filter-actions";
import { SearchFilterInput } from "@/components/search/search-filter-input";
import { SegmentedControl } from "@/components/search/segmented-control";
import { fetchWithTimeout } from "@/lib/client-fetch";
import type { ToponymListRow } from "@/app/api/toponyms/route";
import { dedupeContactGroupsById, type ContactGroupRow } from "@/lib/contact-groups";
import { cn } from "@/lib/utils";

type Draft = ContactListFilters & { ageGroups: string[] };

function draftFromFilters(f: ContactListFilters): Draft {
  const ageGroups = Object.entries(CONTACT_SEARCH_AGE_GROUPS)
    .filter(([, r]) => f.age_min === String(r.min) && f.age_max === String(r.max))
    .map(([k]) => k);
  return { ...f, ageGroups };
}

export function filtersFromDraft(d: Draft): ContactListFilters {
  const next = { ...d };
  delete (next as { ageGroups?: string[] }).ageGroups;
  if (d.ageGroups.length === 1) {
    const g = CONTACT_SEARCH_AGE_GROUPS[d.ageGroups[0]!]!;
    next.age_min = String(g.min);
    next.age_max = String(g.max);
  } else if (d.ageGroups.length > 1) {
    const mins = d.ageGroups.map((k) => CONTACT_SEARCH_AGE_GROUPS[k]!.min);
    const maxs = d.ageGroups.map((k) => CONTACT_SEARCH_AGE_GROUPS[k]!.max);
    next.age_min = String(Math.min(...mins));
    next.age_max = String(Math.max(...maxs));
  } else {
    next.age_min = "";
    next.age_max = "";
  }
  return next;
}

const filterLabelClass = "mb-1.5 block text-xs font-medium text-[var(--text-secondary)]";

export function ContactSearchFiltersPanel({
  filters,
  onChange,
  onSearch,
  onClear,
  onSaveFilters,
  savingFilters,
}: {
  filters: ContactListFilters;
  onChange: (f: ContactListFilters) => void;
  onSearch: (f: ContactListFilters) => void;
  onClear: () => void;
  onSaveFilters: (f: ContactListFilters) => void;
  savingFilters?: boolean;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFromFilters(filters));
  const [municipalities, setMunicipalities] = useState<string[]>([]);
  const [toponyms, setToponyms] = useState<string[]>([]);
  const [groups, setGroups] = useState<ContactGroupRow[]>([]);
  const [sources, setSources] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    setDraft(draftFromFilters(filters));
  }, [filters]);

  useEffect(() => {
    void Promise.all([
      fetchWithTimeout("/api/municipalities").then(async (r) => {
        const d = (await r.json()) as string[] | { municipalities?: string[] };
        return Array.isArray(d) ? d : (d.municipalities ?? []);
      }),
      fetchWithTimeout("/api/toponyms").then(async (r) => {
        const d = (await r.json()) as ToponymListRow[] | { toponyms?: ToponymListRow[] };
        const rows = Array.isArray(d) ? d : (d.toponyms ?? []);
        return rows.map((t) => t.name).filter(Boolean);
      }),
      fetchWithTimeout("/api/groups").then(async (r) => {
        const d = (await r.json()) as { groups?: ContactGroupRow[] };
        return d.groups ?? [];
      }),
      fetchWithTimeout("/api/contact-sources").then(async (r) => {
        const d = (await r.json()) as { sources?: { id: string; name: string }[] };
        return d.sources ?? [];
      }),
    ]).then(([mun, top, gr, src]) => {
      setMunicipalities(mun);
      setToponyms(top);
      setGroups(dedupeContactGroupsById(gr));
      setSources(src);
    });
  }, []);

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

  const sourceOptions = useMemo(
    () => sources.map((s) => ({ value: s.id, label: s.name })),
    [sources],
  );

  const statusOptions = useMemo(
    () => REQUEST_STATUSES.map((s) => ({ value: s, label: s })),
    [],
  );

  const patch = (p: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...p }));

  const toggleAgeGroup = (key: string) => {
    setDraft((prev) => {
      const has = prev.ageGroups.includes(key);
      const ageGroups = has ? prev.ageGroups.filter((k) => k !== key) : [...prev.ageGroups, key];
      return { ...prev, ageGroups };
    });
  };

  const applyDraft = () => onChange(filtersFromDraft(draft));

  const runSearch = () => {
    const f = filtersFromDraft(draft);
    applyDraft();
    onSearch(f);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1 pb-4">
        <FilterSection title="Προσωπικά Στοιχεία" icon={User}>
          <div>
            <label className={filterLabelClass} htmlFor="cs-first">
              Όνομα
            </label>
            <SearchFilterInput
              id="cs-first"
              withSearchIcon
              value={draft.first_name}
              onChange={(e) => patch({ first_name: e.target.value })}
              placeholder="Αναζήτηση ονόματος..."
            />
          </div>
          <div>
            <label className={filterLabelClass} htmlFor="cs-last">
              Επώνυμο
            </label>
            <SearchFilterInput
              id="cs-last"
              withSearchIcon
              value={draft.last_name}
              onChange={(e) => patch({ last_name: e.target.value })}
              placeholder="Αναζήτηση επωνύμου..."
            />
          </div>
          <div>
            <label className={filterLabelClass} htmlFor="cs-father">
              Πατρώνυμο
            </label>
            <SearchFilterInput
              id="cs-father"
              value={draft.father_name}
              onChange={(e) => patch({ father_name: e.target.value })}
              placeholder="Πατρώνυμο..."
            />
          </div>
          <div>
            <span className={filterLabelClass}>Φύλο</span>
            <SegmentedControl
              options={GENDER_OPTIONS}
              value={draft.gender}
              onChange={(gender) => patch({ gender })}
            />
          </div>
          <div>
            <span className={filterLabelClass}>Ηλικιακές ομάδες</span>
            <div className="flex flex-wrap gap-2">
              {Object.entries(CONTACT_SEARCH_AGE_GROUPS).map(([key, g]) => {
                const active = draft.ageGroups.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleAgeGroup(key)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200",
                      active
                        ? "bg-[var(--accent)] text-white shadow-sm"
                        : "border border-[var(--border)] text-[var(--text-muted)] hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))]",
                    )}
                  >
                    {g.label}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)]/50">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-[var(--border)] accent-[var(--accent)]"
              checked={draft.birthday_today}
              onChange={(e) => patch({ birthday_today: e.target.checked })}
            />
            Γενέθλια σήμερα
          </label>
          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)]/50">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-[var(--border)] accent-[var(--accent)]"
              checked={draft.nameday_today}
              onChange={(e) => patch({ nameday_today: e.target.checked })}
            />
            Ονομαστική σήμερα
          </label>
        </FilterSection>

        <FilterSection title="Τοπωνύμιο & Δήμος που μένει" icon={MapPin}>
          <div>
            <label className={filterLabelClass}>Δήμος που μένει</label>
            <SearchableMultiSelect
              options={municipalities.map((name) => ({ value: name, label: name }))}
              values={draft.municipalities}
              onToggle={(name) =>
                patch({
                  municipalities: draft.municipalities.includes(name)
                    ? draft.municipalities.filter((x) => x !== name)
                    : [...draft.municipalities, name],
                })
              }
              placeholder="Επιλέξτε δήμους..."
            />
            <FilterFieldChips
              items={draft.municipalities.map((name) => ({ key: name, label: name }))}
              onRemove={(name) => patch({ municipalities: draft.municipalities.filter((x) => x !== name) })}
            />
          </div>
          <div>
            <label className={filterLabelClass}>Τοπωνύμιο</label>
            <SearchableMultiSelect
              options={toponyms.map((name) => ({ value: name, label: name }))}
              values={draft.toponyms}
              onToggle={(name) =>
                patch({
                  toponyms: draft.toponyms.includes(name)
                    ? draft.toponyms.filter((x) => x !== name)
                    : [...draft.toponyms, name],
                })
              }
              placeholder="Επιλέξτε τοπωνύμια..."
            />
            <FilterFieldChips
              items={draft.toponyms.map((name) => ({ key: name, label: name }))}
              onRemove={(name) => patch({ toponyms: draft.toponyms.filter((x) => x !== name) })}
            />
          </div>
        </FilterSection>

        <FilterSection title="Επικοινωνία" icon={Phone}>
          <div>
            <label className={filterLabelClass} htmlFor="cs-phone">
              Τηλέφωνο
            </label>
            <SearchFilterInput
              id="cs-phone"
              withSearchIcon
              value={draft.phone}
              onChange={(e) => patch({ phone: e.target.value })}
              placeholder="Αριθμός τηλεφώνου..."
            />
          </div>
          <div>
            <span className={filterLabelClass}>Κινητό</span>
            <SegmentedControl
              options={PRESENCE_OPTIONS}
              value={draft.mobile_presence}
              onChange={(mobile_presence) => patch({ mobile_presence: mobile_presence as Draft["mobile_presence"] })}
            />
          </div>
          <div>
            <span className={filterLabelClass}>Σταθερό</span>
            <SegmentedControl
              options={PRESENCE_OPTIONS}
              value={draft.landline_presence}
              onChange={(landline_presence) =>
                patch({ landline_presence: landline_presence as Draft["landline_presence"] })
              }
            />
          </div>
          <div>
            <span className={filterLabelClass}>Email</span>
            <SegmentedControl
              options={PRESENCE_OPTIONS}
              value={draft.email_presence}
              onChange={(email_presence) => patch({ email_presence: email_presence as Draft["email_presence"] })}
            />
          </div>
        </FilterSection>

        <FilterSection title="Ομάδες" icon={Users}>
          <div>
            <label className={filterLabelClass}>Συμπερίληψη ομάδων</label>
            <SearchableMultiSelect
              options={groupOptions}
              values={draft.group_ids}
              onToggle={(id) =>
                patch({
                  group_ids: draft.group_ids.includes(id)
                    ? draft.group_ids.filter((x) => x !== id)
                    : [...draft.group_ids, id],
                })
              }
              placeholder="Επιλέξτε ομάδες..."
            />
            <FilterFieldChips
              items={draft.group_ids.map((id) => {
                const g = groups.find((x) => x.id === id);
                return { key: id, label: g?.name ?? id, color: g?.color ?? undefined };
              })}
              onRemove={(id) => patch({ group_ids: draft.group_ids.filter((x) => x !== id) })}
            />
          </div>
          <div>
            <label className={filterLabelClass}>Εξαίρεση ομάδων</label>
            <SearchableMultiSelect
              options={groupOptions}
              values={draft.exclude_group_ids}
              onToggle={(id) =>
                patch({
                  exclude_group_ids: draft.exclude_group_ids.includes(id)
                    ? draft.exclude_group_ids.filter((x) => x !== id)
                    : [...draft.exclude_group_ids, id],
                })
              }
              placeholder="Εξαίρεση..."
            />
            <FilterFieldChips
              items={draft.exclude_group_ids.map((id) => {
                const g = groups.find((x) => x.id === id);
                return { key: id, label: g?.name ?? id, color: g?.color ?? undefined };
              })}
              onRemove={(id) => patch({ exclude_group_ids: draft.exclude_group_ids.filter((x) => x !== id) })}
            />
          </div>
          <div>
            <span className={filterLabelClass}>Σύνδεση ομάδων</span>
            <SegmentedControl
              options={[
                { value: "or", label: "OR (μία+)" },
                { value: "and", label: "AND (όλες)" },
              ]}
              value={draft.group_match}
              onChange={(group_match) => patch({ group_match: group_match as Draft["group_match"] })}
            />
          </div>
        </FilterSection>

        <FilterSection title="Πηγές" icon={Database}>
          <div>
            <label className={filterLabelClass}>Να έχει</label>
            <SearchableMultiSelect
              options={sourceOptions}
              values={draft.source_ids}
              onToggle={(id) =>
                patch({
                  source_ids: draft.source_ids.includes(id)
                    ? draft.source_ids.filter((x) => x !== id)
                    : [...draft.source_ids, id],
                })
              }
              placeholder="Επιλέξτε πηγές..."
            />
            <FilterFieldChips
              items={draft.source_ids.map((id) => ({
                key: id,
                label: sources.find((s) => s.id === id)?.name ?? id,
              }))}
              onRemove={(id) => patch({ source_ids: draft.source_ids.filter((x) => x !== id) })}
            />
          </div>
          <div>
            <label className={filterLabelClass}>Να ΜΗΝ έχει</label>
            <SearchableMultiSelect
              options={sourceOptions}
              values={draft.exclude_source_ids}
              onToggle={(id) =>
                patch({
                  exclude_source_ids: draft.exclude_source_ids.includes(id)
                    ? draft.exclude_source_ids.filter((x) => x !== id)
                    : [...draft.exclude_source_ids, id],
                })
              }
              placeholder="Εξαίρεση πηγών..."
            />
            <FilterFieldChips
              items={draft.exclude_source_ids.map((id) => ({
                key: id,
                label: sources.find((s) => s.id === id)?.name ?? id,
              }))}
              onRemove={(id) => patch({ exclude_source_ids: draft.exclude_source_ids.filter((x) => x !== id) })}
            />
          </div>
        </FilterSection>

        <FilterSection title="Εκλογικά" icon={Vote}>
          <div>
            <span className={filterLabelClass}>Εκλ. περιφέρεια (ekl_ar)</span>
            <SegmentedControl
              options={EKL_AR_OPTIONS}
              value={draft.ekl_ar}
              onChange={(ekl_ar) => patch({ ekl_ar: ekl_ar as Draft["ekl_ar"] })}
            />
          </div>
          <div>
            <label className={filterLabelClass} htmlFor="cs-ed">
              Εκλ. διαμέρισμα
            </label>
            <SearchFilterInput
              id="cs-ed"
              value={draft.electoral_district}
              onChange={(e) => patch({ electoral_district: e.target.value })}
              placeholder="Διαμέρισμα..."
            />
          </div>
        </FilterSection>

        <FilterSection title="Αιτήματα" icon={FileText}>
          <div>
            <span className={filterLabelClass}>Έχει αίτημα</span>
            <SegmentedControl
              options={HAS_REQUEST_OPTIONS}
              value={draft.has_request}
              onChange={(has_request) => patch({ has_request: has_request as Draft["has_request"] })}
            />
          </div>
          <div>
            <label className={filterLabelClass} htmlFor="cs-req-st">
              Κατάσταση αιτήματος
            </label>
            <SearchableSelect
              id="cs-req-st"
              options={statusOptions}
              value={draft.request_status}
              onChange={(request_status) => patch({ request_status })}
              placeholder="— όλες —"
            />
          </div>
        </FilterSection>
      </div>

      <SearchFilterActions
        onSearch={runSearch}
        onClear={onClear}
        clearLabel="Καθαρισμός φίλτρων"
        extraActions={
          <button
            type="button"
            className={lux.btnSecondary + " w-full !h-10 !rounded-lg !py-0 text-sm"}
            onClick={() => {
              const f = filtersFromDraft(draft);
              applyDraft();
              onSaveFilters(f);
            }}
            disabled={savingFilters}
          >
            Αποθήκευση φίλτρων
          </button>
        }
      />
    </div>
  );
}
