"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ChevronDown, Loader2, Search } from "lucide-react";
import {
  MUNICIPALITIES,
  getAllSettlements,
  getAllSettlementsForMuni,
  getDistrictsForMuni,
  getSettlements,
} from "@/lib/aitoloakarnania-data";
import { lux } from "@/lib/luxury-styles";
import { fetchWithTimeout } from "@/lib/client-fetch";
import {
  getMunicipalitiesCached,
  getToponymsCached,
  peekMunicipalities,
  peekToponyms,
} from "@/lib/geo-lists-cache";
import { PortalDropdownPanel, usePortalDropdown } from "@/components/ui/portal-dropdown";
import type { MunicipalityRow } from "@/app/api/geo/municipalities/route";
import type { ElectoralDistrictRow } from "@/app/api/geo/electoral-districts/route";
import type { ToponymRow } from "@/app/api/geo/toponyms/route";

export const OTHER_SETTLEMENT_LABEL = "+ Άλλο (χειροκίνητη εισαγωγή)";

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function withLegacyOption(options: string[], current: string | null | undefined) {
  if (!current?.trim()) return options;
  if (options.includes(current)) return options;
  return [current, ...options];
}

type SearchableSelectProps = {
  id?: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  disabled?: boolean;
  error?: string;
  placeholder?: string;
  required?: boolean;
  emptyMessage?: string;
  loading?: boolean;
  loadingMessage?: string;
};

function SearchableSelect({
  id,
  label,
  value,
  onChange,
  options,
  disabled,
  error,
  placeholder = "Επιλέξτε…",
  required,
  emptyMessage = "Δεν βρέθηκαν",
  loading = false,
  loadingMessage = "Φόρτωση...",
}: SearchableSelectProps) {
  const [q, setQ] = useState("");
  const { triggerRef, panelRef, open, setOpen, pos, toggle } = usePortalDropdown();
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const t = norm(q.trim());
    if (!t) return options;
    return options.filter((o) => norm(o).includes(t));
  }, [options, q]);

  const displayLabel = value;

  useEffect(() => {
    if (open) {
      setQ("");
      const t = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(t);
    }
  }, [open]);

  return (
    <div className="relative min-w-0">
      <label htmlFor={id} className={lux.label}>
        {label}
        {required && <span className="ml-0.5 text-[var(--danger)]">*</span>}
      </label>
      <div className="relative">
        <button
          type="button"
          id={id}
          disabled={disabled}
          ref={triggerRef as RefObject<HTMLButtonElement>}
          onClick={() => !disabled && toggle()}
          className={[
            "flex w-full min-h-[42px] items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-left text-sm",
            "text-[var(--text-primary)] transition-all duration-150",
            "hover:border-[var(--accent-gold)]/50",
            "focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]/25 focus:border-[var(--accent-gold)]",
            error ? "border-red-500/50" : "",
            disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
          ].join(" ")}
          aria-expanded={open}
        >
          <span className={!displayLabel ? "text-[var(--text-muted)]" : "truncate"}>
            {displayLabel || placeholder}
          </span>
          <ChevronDown
            className={["h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform", open ? "rotate-180" : ""].join(" ")}
          />
        </button>
        <PortalDropdownPanel
          open={open && !disabled}
          pos={pos}
          panelRef={panelRef}
          role="listbox"
          className="rounded-lg border-2 border-[color-mix(in_srgb,var(--accent-gold)_40%,var(--border))] bg-background p-0 shadow-[var(--card-shadow)]"
        >
          <div className="flex items-center gap-2 border-b border-[var(--border)] px-2 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
            <input
              ref={inputRef}
              className="m-0 min-w-0 flex-1 border-0 bg-transparent py-1 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-0"
              placeholder="Φιλτράρισμα…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setOpen(false);
                  setQ("");
                }
              }}
              autoComplete="off"
              aria-label={`Αναζήτηση: ${label}`}
            />
          </div>
          <ul className="m-0 max-h-44 list-none overflow-y-auto p-0.5">
            {loading && filtered.length === 0 ? (
              <li className="flex items-center justify-center gap-2 px-2 py-3 text-xs text-[var(--text-muted)]" role="status">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                {loadingMessage}
              </li>
            ) : null}
            {!loading && filtered.length === 0 ? (
              <li className="px-2 py-2.5 text-xs text-[var(--text-muted)]">{emptyMessage}</li>
            ) : null}
            {filtered.map((opt) => (
              <li key={opt}>
                <button
                  type="button"
                  className="w-full rounded-md px-2.5 py-2 text-left text-sm text-[var(--text-primary)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent-gold)_12%,transparent)]"
                  onClick={() => {
                    onChange(opt);
                    setOpen(false);
                    setQ("");
                  }}
                  role="option"
                  aria-selected={value === opt}
                >
                  {opt}
                </button>
              </li>
            ))}
          </ul>
        </PortalDropdownPanel>
      </div>
      {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
    </div>
  );
}

export type AitLocationValues = {
  municipality: string | null;
  electoral_district: string | null;
  toponym: string | null;
};

type AitLocationFieldsProps = {
  values: AitLocationValues;
  onChange: (v: AitLocationValues) => void;
  errorMunicipality?: string;
};

function StaticAitLocationFields({ values, onChange, errorMunicipality }: AitLocationFieldsProps) {
  const muni = values.municipality?.trim() ?? "";
  const dist = values.electoral_district?.trim() ?? "";
  const top = values.toponym?.trim() ?? "";

  const muniList = useMemo(() => withLegacyOption(
    MUNICIPALITIES.map((x) => x.name),
    muni,
  ), [muni]);

  const distList = useMemo(() => {
    return withLegacyOption(
      getDistrictsForMuni(muni).map((x) => x.name),
      dist,
    );
  }, [muni, dist]);

  const preferredSettlements = useMemo(() => {
    if (dist) return getSettlements(muni, dist);
    if (muni) return getAllSettlementsForMuni(muni);
    return [] as string[];
  }, [muni, dist]);
  const allSettlements = useMemo(() => getAllSettlements(), []);
  const settlements = useMemo(() => {
    if (preferredSettlements.length === 0) return allSettlements;
    const preferredSet = new Set(preferredSettlements);
    const rest = allSettlements.filter((s) => !preferredSet.has(s));
    return [...preferredSettlements, ...rest];
  }, [preferredSettlements, allSettlements]);
  const inSettlementList = Boolean(top && settlements.includes(top));
  const settlementList = useMemo(
    () => [...settlements, OTHER_SETTLEMENT_LABEL],
    [settlements],
  );

  const [otherPicked, setOtherPicked] = useState(false);
  useEffect(() => {
    if (top && !settlements.includes(top)) {
      setOtherPicked(true);
    }
    if (inSettlementList) {
      setOtherPicked(false);
    }
  }, [dist, top, settlements, inSettlementList]);

  const handleSettlementPick = useCallback(
    (picked: string) => {
      if (picked === OTHER_SETTLEMENT_LABEL) {
        setOtherPicked(true);
        onChange({ ...values, toponym: null });
        return;
      }
      setOtherPicked(false);
      onChange({ ...values, toponym: picked || null });
    },
    [onChange, values],
  );

  const toponymSelectValue = useMemo(() => {
    if (inSettlementList) return top;
    if (otherPicked && !top) return OTHER_SETTLEMENT_LABEL;
    if (top && !inSettlementList) return top;
    if (otherPicked) return OTHER_SETTLEMENT_LABEL;
    return "";
  }, [top, inSettlementList, otherPicked]);

  const showToponymCustomInput = Boolean(
    otherPicked || (top.length > 0 && !inSettlementList),
  );

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <SearchableSelect
        id="ait-muni"
        label="Δήμος που ψηφίζει"
        value={muni}
        onChange={(v) => onChange({ municipality: v, electoral_district: null, toponym: values.toponym })}
        options={muniList}
        error={errorMunicipality}
        placeholder="Επιλέξτε δήμο"
        emptyMessage="Δοκιμάστε άλλο κείμενο αναζήτησης"
      />

      <SearchableSelect
        id="ait-dist"
        label="Εκλογικό διαμέρισμα"
        value={dist}
        onChange={(v) => onChange({ ...values, electoral_district: v })}
        options={distList}
        disabled={!muni}
        placeholder={muni ? "Επιλέξτε ενότητα" : "Πρώτα δήμος"}
        emptyMessage="Καμία ενότητα"
      />

      <SearchableSelect
        id="ait-top"
        label="Τοπωνύμιο / χωριό"
        value={toponymSelectValue}
        onChange={handleSettlementPick}
        options={settlementList}
        placeholder="Επιλέξτε οικισμό"
        emptyMessage="Δοκιμάστε φίλτρο"
      />

      {showToponymCustomInput && (
        <div>
          <label htmlFor="ait-top-free" className={lux.label}>
            {otherPicked ? "Χειροκίνητη εισαγωγή" : "Τοπωνύμιο (εκτός λίστας)"}
          </label>
          <input
            id="ait-top-free"
            className={lux.input + " !h-10 focus:border-[var(--accent-gold)] focus:ring-2 focus:ring-[var(--accent-gold)]/20"}
            value={top}
            onChange={(e) => onChange({ ...values, toponym: e.target.value || null })}
            placeholder="Πληκτρολογήστε τοπωνύμιο…"
          />
        </div>
      )}
    </div>
  );
}

function ApiAitLocationFields({ values, onChange, errorMunicipality }: AitLocationFieldsProps) {
  const muni = values.municipality?.trim() ?? "";
  const dist = values.electoral_district?.trim() ?? "";
  const top = values.toponym?.trim() ?? "";

  const cachedMunis = peekMunicipalities();
  const cachedTops = peekToponyms();

  const [municipalityNames, setMunicipalityNames] = useState<string[]>(cachedMunis ?? []);
  const [municipalitiesLoading, setMunicipalitiesLoading] = useState(!cachedMunis);
  const [geoMunicipalities, setGeoMunicipalities] = useState<MunicipalityRow[]>([]);
  const [districts, setDistricts] = useState<ElectoralDistrictRow[]>([]);
  const [allToponymNames, setAllToponymNames] = useState<string[]>(() =>
    cachedTops ? [...new Set(cachedTops.map((t) => t.name))].sort((a, b) => a.localeCompare(b, "el")) : [],
  );
  const [toponymsLoading, setToponymsLoading] = useState(!cachedTops);
  const [filteredToponymRows, setFilteredToponymRows] = useState<ToponymRow[]>([]);

  const muniId = useMemo(() => geoMunicipalities.find((x) => x.name === muni)?.id ?? null, [geoMunicipalities, muni]);
  const distId = useMemo(() => districts.find((x) => x.name === dist)?.id ?? null, [districts, dist]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await getMunicipalitiesCached();
        if (!cancelled) {
          setMunicipalityNames(data);
          setMunicipalitiesLoading(false);
        }
      } catch {
        if (!cancelled) {
          setMunicipalityNames([]);
          setMunicipalitiesLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void (async () => {
      const r = await fetchWithTimeout("/api/geo/municipalities");
      if (r.ok) {
        const d = (await r.json()) as { municipalities?: MunicipalityRow[] };
        setGeoMunicipalities(d.municipalities ?? []);
      } else {
        setGeoMunicipalities([]);
      }
    })().catch(() => setGeoMunicipalities([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await getToponymsCached();
        const names = [...new Set(rows.map((t) => t.name))].sort((a, b) => a.localeCompare(b, "el"));
        if (!cancelled) {
          setAllToponymNames(names);
          setToponymsLoading(false);
        }
      } catch {
        if (!cancelled) {
          setAllToponymNames([]);
          setToponymsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!muniId) {
      setDistricts([]);
      return;
    }
    void (async () => {
      const r = await fetchWithTimeout(`/api/geo/electoral-districts?municipality_id=${muniId}`);
      if (r.ok) {
        const d = (await r.json()) as { districts?: ElectoralDistrictRow[] };
        setDistricts(d.districts ?? []);
      } else {
        setDistricts([]);
      }
    })();
  }, [muniId]);

  useEffect(() => {
    if (!muniId) {
      setFilteredToponymRows([]);
      return;
    }
    void (async () => {
      const q = new URLSearchParams({ municipality_id: muniId });
      if (distId) q.set("electoral_district_id", distId);
      const r = await fetchWithTimeout(`/api/geo/toponyms?${q.toString()}`);
      if (r.ok) {
        const d = (await r.json()) as { toponyms?: ToponymRow[] };
        setFilteredToponymRows(d.toponyms ?? []);
      } else {
        setFilteredToponymRows([]);
      }
    })();
  }, [muniId, distId]);

  const muniList = useMemo(
    () => withLegacyOption(municipalityNames, muni),
    [municipalityNames, muni],
  );
  const muniInDb = Boolean(muniId);

  const distNameList = useMemo(() => withLegacyOption(districts.map((d) => d.name), dist), [districts, dist]);

  const settlementNames = useMemo(() => {
    const preferred = filteredToponymRows.map((t) => t.name);
    if (preferred.length === 0) return withLegacyOption(allToponymNames, top);
    const preferredSet = new Set(preferred);
    const rest = allToponymNames.filter((n) => !preferredSet.has(n));
    return withLegacyOption([...preferred, ...rest], top);
  }, [filteredToponymRows, allToponymNames, top]);

  const inTopList = Boolean(top && settlementNames.includes(top));
  const settlementList = useMemo(() => {
    // Avoid showing only "+ Άλλο" while the shared toponym list is still loading.
    if (toponymsLoading && settlementNames.length === 0) return [];
    return [...settlementNames, OTHER_SETTLEMENT_LABEL];
  }, [settlementNames, toponymsLoading]);

  const [otherPicked, setOtherPicked] = useState(false);
  useEffect(() => {
    if (top && !settlementNames.includes(top)) {
      setOtherPicked(true);
    }
    if (inTopList) setOtherPicked(false);
  }, [dist, top, settlementNames, inTopList]);

  const handleTopPick = useCallback(
    (picked: string) => {
      if (picked === OTHER_SETTLEMENT_LABEL) {
        setOtherPicked(true);
        onChange({ ...values, toponym: null });
        return;
      }
      setOtherPicked(false);
      onChange({ ...values, toponym: picked || null });
    },
    [onChange, values],
  );

  const toponymSelectValue = useMemo(() => {
    if (inTopList) return top;
    if (otherPicked && !top) return OTHER_SETTLEMENT_LABEL;
    if (top && !inTopList) return top;
    if (otherPicked) return OTHER_SETTLEMENT_LABEL;
    return "";
  }, [top, inTopList, otherPicked]);

  const showToponymCustom = Boolean(otherPicked || (top.length > 0 && !inTopList));
  const showDistFree = muniInDb && districts.length === 0;

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <SearchableSelect
        id="ait-muni-api"
        label="Δήμος που ψηφίζει"
        value={muni}
        onChange={(v) => onChange({ municipality: v, electoral_district: null, toponym: values.toponym })}
        options={muniList}
        error={errorMunicipality}
        placeholder="Επιλέξτε δήμο"
        loading={municipalitiesLoading}
        loadingMessage="Φόρτωση δήμων…"
        emptyMessage="Προσθέστε δεδομένα στις ρυθμίσεις ή αλλάξτε αναζήτηση"
      />

      {showDistFree ? (
        <div>
          <label htmlFor="ait-dist-free" className={lux.label}>
            Εκλογικό διαμέρισμα
          </label>
          <input
            id="ait-dist-free"
            className={lux.input}
            value={dist}
            onChange={(e) => onChange({ ...values, electoral_district: e.target.value || null })}
            disabled={!muni}
            placeholder="Χειροκίνητα (χωρίς εγγεγραμμένα τμήματα)"
          />
        </div>
      ) : (
        <SearchableSelect
          id="ait-dist-api"
          label="Εκλογικό διαμέρισμα"
          value={dist}
          onChange={(v) => onChange({ ...values, electoral_district: v })}
          options={distNameList}
          disabled={!muni}
          placeholder={muni ? "Επιλέξτε τμήμα" : "Πρώτα δήμος"}
          emptyMessage="Καμία ενότητα"
        />
      )}

      <SearchableSelect
        id="ait-top-api"
        label="Τοπωνύμιο / χωριό"
        value={toponymSelectValue}
        onChange={handleTopPick}
        options={settlementList}
        placeholder="Επιλέξτε οικισμό"
        loading={toponymsLoading}
        loadingMessage="Φόρτωση τοπωνυμίων…"
        emptyMessage="Δοκιμάστε φίλτρο"
      />

      {showToponymCustom && (
        <div>
          <label htmlFor="ait-top-free-api" className={lux.label}>
            {otherPicked ? "Χειροκίνητη εισαγωγή" : "Τοπωνύμιο (εκτός λίστας)"}
          </label>
          <input
            id="ait-top-free-api"
            className={lux.input + " !h-10 focus:border-[var(--accent-gold)] focus:ring-2 focus:ring-[var(--accent-gold)]/20"}
            value={top}
            onChange={(e) => onChange({ ...values, toponym: e.target.value || null })}
            placeholder="Πληκτρολογήστε τοπωνύμιο…"
          />
        </div>
      )}
    </div>
  );
}

export function AitoloakarnaniaLocationFields({ values, onChange, errorMunicipality }: AitLocationFieldsProps) {
  const cached = peekMunicipalities();
  const [mode, setMode] = useState<"loading" | "static" | "api">(() =>
    cached == null ? "loading" : cached.length > 0 ? "api" : "static",
  );

  useEffect(() => {
    if (mode !== "loading") return;
    void (async () => {
      try {
        const data = await getMunicipalitiesCached();
        if (data.length > 0) {
          setMode("api");
          return;
        }
      } catch {
        /* fallback */
      }
      setMode("static");
    })();
  }, [mode]);

  if (mode === "loading") {
    return (
      <p className="text-xs text-[var(--text-muted)]" role="status">
        Φόρτωση τοπωνυμίων…
      </p>
    );
  }
  if (mode === "api") {
    return <ApiAitLocationFields values={values} onChange={onChange} errorMunicipality={errorMunicipality} />;
  }
  return <StaticAitLocationFields values={values} onChange={onChange} errorMunicipality={errorMunicipality} />;
}
