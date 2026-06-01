"use client";

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
import { FilterFieldChips } from "@/components/contacts/search/filter-field-chips";
import { HqSelect } from "@/components/ui/hq-select";
import { fetchWithTimeout } from "@/lib/client-fetch";
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

function RadioRow({
  name,
  options,
  value,
  onChange,
}: {
  name: string;
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {options.map((o) => (
        <label key={o.value || "any"} className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-[var(--text-secondary)]">
          <input
            type="radio"
            name={name}
            className="accent-[var(--accent-gold)]"
            checked={value === o.value}
            onChange={() => onChange(o.value)}
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

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
        const d = (await r.json()) as { toponyms?: { name: string }[] };
        return (d.toponyms ?? []).map((t) => t.name).filter(Boolean);
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

  const patch = (p: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...p }));

  const toggleAgeGroup = (key: string) => {
    setDraft((prev) => {
      const has = prev.ageGroups.includes(key);
      const ageGroups = has ? prev.ageGroups.filter((k) => k !== key) : [...prev.ageGroups, key];
      return { ...prev, ageGroups };
    });
  };

  const applyDraft = () => onChange(filtersFromDraft(draft));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1 pb-3">
        <FilterSection title="Προσωπικά Στοιχεία">
          <div>
            <label className={lux.label} htmlFor="cs-first">Όνομα</label>
            <input id="cs-first" className={lux.input} value={draft.first_name} onChange={(e) => patch({ first_name: e.target.value })} />
          </div>
          <div>
            <label className={lux.label} htmlFor="cs-last">Επώνυμο</label>
            <input id="cs-last" className={lux.input} value={draft.last_name} onChange={(e) => patch({ last_name: e.target.value })} />
          </div>
          <div>
            <label className={lux.label} htmlFor="cs-father">Πατρώνυμο</label>
            <input id="cs-father" className={lux.input} value={draft.father_name} onChange={(e) => patch({ father_name: e.target.value })} />
          </div>
          <div>
            <span className={lux.label}>Φύλο</span>
            <RadioRow name="gender" options={GENDER_OPTIONS} value={draft.gender} onChange={(gender) => patch({ gender })} />
          </div>
          <div>
            <span className={lux.label}>Ηλικιακές ομάδες</span>
            <div className="mt-1 flex flex-wrap gap-2">
              {Object.entries(CONTACT_SEARCH_AGE_GROUPS).map(([key, g]) => (
                <label key={key} className="inline-flex cursor-pointer items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    className="accent-[var(--accent-gold)]"
                    checked={draft.ageGroups.includes(key)}
                    onChange={() => toggleAgeGroup(key)}
                  />
                  {g.label}
                </label>
              ))}
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-secondary)]">
            <input
              type="checkbox"
              className="accent-[var(--accent-gold)]"
              checked={draft.birthday_today}
              onChange={(e) => patch({ birthday_today: e.target.checked })}
            />
            Γενέθλια σήμερα
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-secondary)]">
            <input
              type="checkbox"
              className="accent-[var(--accent-gold)]"
              checked={draft.nameday_today}
              onChange={(e) => patch({ nameday_today: e.target.checked })}
            />
            Ονομαστική σήμερα
          </label>
        </FilterSection>

        <FilterSection title="Τοπωνύμιο & Δήμος">
          <div>
            <label className={lux.label}>Δήμος</label>
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
            <label className={lux.label}>Τοπωνύμιο</label>
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

        <FilterSection title="Επικοινωνία">
          <div>
            <label className={lux.label} htmlFor="cs-phone">Τηλέφωνο</label>
            <input id="cs-phone" className={lux.input} value={draft.phone} onChange={(e) => patch({ phone: e.target.value })} />
          </div>
          <div>
            <span className={lux.label}>Κινητό</span>
            <RadioRow
              name="mobile"
              options={PRESENCE_OPTIONS}
              value={draft.mobile_presence}
              onChange={(mobile_presence) => patch({ mobile_presence: mobile_presence as Draft["mobile_presence"] })}
            />
          </div>
          <div>
            <span className={lux.label}>Σταθερό</span>
            <RadioRow
              name="landline"
              options={PRESENCE_OPTIONS}
              value={draft.landline_presence}
              onChange={(landline_presence) => patch({ landline_presence: landline_presence as Draft["landline_presence"] })}
            />
          </div>
          <div>
            <span className={lux.label}>Email</span>
            <RadioRow
              name="email"
              options={PRESENCE_OPTIONS}
              value={draft.email_presence}
              onChange={(email_presence) => patch({ email_presence: email_presence as Draft["email_presence"] })}
            />
          </div>
        </FilterSection>

        <FilterSection title="Ομάδες">
          <div>
            <label className={lux.label}>Συμπερίληψη ομάδων</label>
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
          </div>
          <div>
            <label className={lux.label}>Εξαίρεση ομάδων</label>
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
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--text-muted)]">Σύνδεση ομάδων:</span>
            <button
              type="button"
              className={cn(
                "rounded-md border px-2 py-0.5 text-xs font-semibold",
                draft.group_match === "or"
                  ? "border-[var(--accent-gold)] bg-[color-mix(in_srgb,var(--accent-gold)_15%,transparent)] text-[var(--accent-gold)]"
                  : "border-[var(--border)] text-[var(--text-muted)]",
              )}
              onClick={() => patch({ group_match: "or" })}
            >
              Ή (OR)
            </button>
            <button
              type="button"
              className={cn(
                "rounded-md border px-2 py-0.5 text-xs font-semibold",
                draft.group_match === "and"
                  ? "border-[var(--accent-gold)] bg-[color-mix(in_srgb,var(--accent-gold)_15%,transparent)] text-[var(--accent-gold)]"
                  : "border-[var(--border)] text-[var(--text-muted)]",
              )}
              onClick={() => patch({ group_match: "and" })}
            >
              Και (AND)
            </button>
          </div>
        </FilterSection>

        <FilterSection title="Πηγές">
          <div>
            <label className={lux.label}>Να έχει</label>
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
            <label className={lux.label}>Να ΜΗΝ έχει</label>
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

        <FilterSection title="Εκλογικά">
          <div>
            <span className={lux.label}>Εκλ. περιφέρεια (ekl_ar)</span>
            <RadioRow
              name="ekl"
              options={EKL_AR_OPTIONS}
              value={draft.ekl_ar}
              onChange={(ekl_ar) => patch({ ekl_ar: ekl_ar as Draft["ekl_ar"] })}
            />
          </div>
          <div>
            <label className={lux.label} htmlFor="cs-ed">Εκλ. διαμέρισμα</label>
            <input
              id="cs-ed"
              className={lux.input}
              value={draft.electoral_district}
              onChange={(e) => patch({ electoral_district: e.target.value })}
            />
          </div>
        </FilterSection>

        <FilterSection title="Αιτήματα">
          <div>
            <span className={lux.label}>Έχει αίτημα</span>
            <RadioRow
              name="has_req"
              options={HAS_REQUEST_OPTIONS}
              value={draft.has_request}
              onChange={(has_request) => patch({ has_request: has_request as Draft["has_request"] })}
            />
          </div>
          <div>
            <label className={lux.label} htmlFor="cs-req-st">Κατάσταση αιτήματος</label>
            <HqSelect
              id="cs-req-st"
              value={draft.request_status}
              onChange={(e) => patch({ request_status: e.target.value })}
            >
              <option value="">— όλες —</option>
              {REQUEST_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </HqSelect>
          </div>
        </FilterSection>
      </div>

      <div className="shrink-0 space-y-2 border-t border-[var(--border)] bg-[var(--bg-elevated)]/80 pt-3">
        <button
          type="button"
          className={lux.btnPrimary + " w-full !rounded-xl !py-3"}
          onClick={() => {
            const f = filtersFromDraft(draft);
            applyDraft();
            onSearch(f);
          }}
        >
          Αναζήτηση
        </button>
        <button type="button" className={lux.btnSecondary + " w-full"} onClick={onClear}>
          Καθαρισμός φίλτρων
        </button>
        <button
          type="button"
          className={lux.btnSecondary + " w-full"}
          onClick={() => {
            const f = filtersFromDraft(draft);
            applyDraft();
            onSaveFilters(f);
          }}
          disabled={savingFilters}
        >
          Αποθήκευση φίλτρων
        </button>
      </div>
    </div>
  );
}
