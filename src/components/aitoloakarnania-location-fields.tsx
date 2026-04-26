"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { MUNICIPALITIES, getDistrictsForMuni, getMuniByName, getSettlements } from "@/lib/aitoloakarnania-data";
import { lux } from "@/lib/luxury-styles";
import { fetchWithTimeout } from "@/lib/client-fetch";
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
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const t = norm(q.trim());
    if (!t) return options;
    return options.filter((o) => norm(o).includes(t));
  }, [options, q]);

  const inList = Boolean(value && options.includes(value));
  const displayLabel = value;

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQ("");
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (open) {
      setQ(inList ? value : "");
      const t = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(t);
    }
  }, [open, value, inList]);

  return (
    <div ref={ref} className="relative min-w-0">
      <label htmlFor={id} className={lux.label}>
        {label}
        {required && <span className="ml-0.5 text-[var(--danger)]">*</span>}
      </label>
      <div className="relative">
        <button
          type="button"
          id={id}
          disabled={disabled}
          onClick={() => !disabled && setOpen((o) => !o)}
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
        {open && !disabled && (
          <div
            className="absolute left-0 right-0 z-[60] mt-1 overflow-hidden rounded-lg border-2 border-[var(--accent-gold)]/40 bg-[var(--bg-card)] shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
            role="listbox"
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
            <ul className="max-h-44 overflow-y-auto p-0.5">
              {filtered.length === 0 && <li className="px-2 py-2.5 text-xs text-[var(--text-muted)]">{emptyMessage}</li>}
              {filtered.map((opt) => (
                <li key={opt}>
                  <button
                    type="button"
                    className="w-full rounded-md px-2.5 py-2 text-left text-sm text-[var(--text-primary)] transition-colors hover:bg-[rgba(201,168,76,0.12)]"
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
          </div>
        )}
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
  const muniData = getMuniByName(muni);

  const distList = useMemo(() => {
    return withLegacyOption(
      getDistrictsForMuni(muni).map((x) => x.name),
      dist,
    );
  }, [muni, dist]);

  const settlements = useMemo(() => getSettlements(muni, dist), [muni, dist]);
  const inSettlementList = Boolean(top && settlements.includes(top));
  const settlementList = useMemo(
    () => (settlements.length > 0 ? [...settlements, OTHER_SETTLEMENT_LABEL] : []),
    [settlements],
  );

  const [otherPicked, setOtherPicked] = useState(false);
  useEffect(() => {
    if (muniData && dist && top && !settlements.includes(top)) {
      setOtherPicked(true);
    }
    if (inSettlementList) {
      setOtherPicked(false);
    }
  }, [muniData, dist, top, settlements, inSettlementList]);

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
    if (!muniData || !dist) return "";
    if (inSettlementList) return top;
    if (otherPicked && !top) return OTHER_SETTLEMENT_LABEL;
    if (top && !inSettlementList) return top;
    if (otherPicked) return OTHER_SETTLEMENT_LABEL;
    return "";
  }, [muniData, dist, top, inSettlementList, otherPicked]);

  const showToponymCustomInput = Boolean(
    muniData && dist && settlementList.length > 0 && (otherPicked || (top.length > 0 && !inSettlementList)),
  );

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <SearchableSelect
        id="ait-muni"
        label="Δήμος"
        required
        value={muni}
        onChange={(v) => onChange({ municipality: v, electoral_district: null, toponym: null })}
        options={muniList}
        error={errorMunicipality}
        placeholder="Επιλέξτε δήμο"
        emptyMessage="Δοκιμάστε άλλο κείμενο αναζήτησης"
      />
      {muni && !muniData && (
        <p className="text-xs text-amber-200/90">Η αποθηκευμένη τιμή δημου· επιλέξτε τυπικό δήμο από τη λίστα.</p>
      )}

      <SearchableSelect
        id="ait-dist"
        label="Εκλογικό διαμέρισμα"
        value={dist}
        onChange={(v) => onChange({ ...values, electoral_district: v, toponym: null })}
        options={distList}
        disabled={!muni}
        placeholder={muni ? "Επιλέξτε ενότητα" : "Πρώτα δήμος"}
        emptyMessage="Καμία ενότητα"
      />

      {muniData && dist && settlements.length > 0 && (
        <SearchableSelect
          id="ait-top"
          label="Τοπωνύμιο / χωριό"
          value={toponymSelectValue}
          onChange={handleSettlementPick}
          options={settlementList}
          disabled={!muni || !dist}
          placeholder={dist ? "Επιλέξτε οικισμό" : "Πρώτα διαμέρισμα"}
          emptyMessage="Δοκιμάστε φίλτρο"
        />
      )}

      {muniData && dist && settlements.length === 0 && (
        <div>
          <label htmlFor="ait-top-fallback" className={lux.label}>
            Τοπωνύμιο / χωριό
          </label>
          <input
            id="ait-top-fallback"
            className={lux.input}
            value={top}
            onChange={(e) => onChange({ ...values, toponym: e.target.value || null })}
            placeholder="Χειροκίνητα (ασυνήθιστο εκλ. διαμέρισμα)"
          />
        </div>
      )}

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

  const [municipalities, setMunicipalities] = useState<MunicipalityRow[]>([]);
  const [districts, setDistricts] = useState<ElectoralDistrictRow[]>([]);
  const [toponymRows, setToponymRows] = useState<ToponymRow[]>([]);

  const muniId = useMemo(() => municipalities.find((x) => x.name === muni)?.id ?? null, [municipalities, muni]);
  const distId = useMemo(() => districts.find((x) => x.name === dist)?.id ?? null, [districts, dist]);

  useEffect(() => {
    void (async () => {
      const r = await fetchWithTimeout("/api/geo/municipalities");
      if (r.ok) {
        const d = (await r.json()) as { municipalities?: MunicipalityRow[] };
        setMunicipalities(d.municipalities ?? []);
      } else {
        setMunicipalities([]);
      }
    })();
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
      setToponymRows([]);
      return;
    }
    void (async () => {
      const q = new URLSearchParams({ municipality_id: muniId });
      if (distId) q.set("electoral_district_id", distId);
      const r = await fetchWithTimeout(`/api/geo/toponyms?${q.toString()}`);
      if (r.ok) {
        const d = (await r.json()) as { toponyms?: ToponymRow[] };
        setToponymRows(d.toponyms ?? []);
      } else {
        setToponymRows([]);
      }
    })();
  }, [muniId, distId]);

  const muniList = useMemo(
    () => withLegacyOption(municipalities.map((x) => x.name), muni),
    [municipalities, muni],
  );
  const muniInDb = Boolean(muniId);

  const distNameList = useMemo(() => withLegacyOption(districts.map((d) => d.name), dist), [districts, dist]);

  const settlementNames = useMemo(() => toponymRows.map((t) => t.name), [toponymRows]);
  const inTopList = Boolean(top && settlementNames.includes(top));
  const settlementList = useMemo(
    () => (muniInDb && dist && settlementNames.length > 0 ? [...settlementNames, OTHER_SETTLEMENT_LABEL] : []),
    [muniInDb, dist, settlementNames],
  );

  const [otherPicked, setOtherPicked] = useState(false);
  useEffect(() => {
    if (muniInDb && dist && top && !settlementNames.includes(top)) {
      setOtherPicked(true);
    }
    if (inTopList) setOtherPicked(false);
  }, [muniInDb, dist, top, settlementNames, inTopList]);

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
    if (!muniInDb || !dist) return "";
    if (inTopList) return top;
    if (otherPicked && !top) return OTHER_SETTLEMENT_LABEL;
    if (top && !inTopList) return top;
    if (otherPicked) return OTHER_SETTLEMENT_LABEL;
    return "";
  }, [muniInDb, dist, top, inTopList, otherPicked]);

  const showToponymCustom = Boolean(
    muniInDb && dist && settlementList.length > 0 && (otherPicked || (top.length > 0 && !inTopList)),
  );
  const showDistFree = muniInDb && districts.length === 0;
  const showTopFree = muniInDb && dist && toponymRows.length === 0;

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <SearchableSelect
        id="ait-muni-api"
        label="Δήμος"
        required
        value={muni}
        onChange={(v) => onChange({ municipality: v, electoral_district: null, toponym: null })}
        options={muniList}
        error={errorMunicipality}
        placeholder="Επιλέξτε δήμο"
        emptyMessage="Προσθέστε δεδομένα στις ρυθμίσεις ή αλλάξτε αναζήτηση"
      />
      {muni && !muniInDb && (
        <p className="text-xs text-amber-200/90">Η τιμή δήμου δεν ταιριάζει στη βάση· επιλέξτε από τη λίστα (Ρυθμίσεις → Γεωγραφικά δεδομένα).</p>
      )}

      {showDistFree ? (
        <div>
          <label htmlFor="ait-dist-free" className={lux.label}>
            Εκλογικό διαμέρισμα
          </label>
          <input
            id="ait-dist-free"
            className={lux.input}
            value={dist}
            onChange={(e) => onChange({ ...values, electoral_district: e.target.value || null, toponym: null })}
            disabled={!muni}
            placeholder="Χειροκίνητα (χωρίς εγγεγραμμένα τμήματα)"
          />
        </div>
      ) : (
        <SearchableSelect
          id="ait-dist-api"
          label="Εκλογικό διαμέρισμα"
          value={dist}
          onChange={(v) => onChange({ ...values, electoral_district: v, toponym: null })}
          options={distNameList}
          disabled={!muni}
          placeholder={muni ? "Επιλέξτε τμήμα" : "Πρώτα δήμος"}
          emptyMessage="Καμία ενότητα"
        />
      )}

      {muniInDb && dist && settlementList.length > 0 && !showDistFree && (
        <SearchableSelect
          id="ait-top-api"
          label="Τοπωνύμιο / χωριό"
          value={toponymSelectValue}
          onChange={handleTopPick}
          options={settlementList}
          disabled={!muni || !dist}
          placeholder="Επιλέξτε οικισμό"
          emptyMessage="Δοκιμάστε φίλτρο"
        />
      )}

      {muniInDb && dist && showTopFree && !showDistFree && (
        <div>
          <label htmlFor="ait-top-api-f" className={lux.label}>
            Τοπωνύμιο / χωριό
          </label>
          <input
            id="ait-top-api-f"
            className={lux.input}
            value={top}
            onChange={(e) => onChange({ ...values, toponym: e.target.value || null })}
            placeholder="Χειροκίνητα (αδιάθετα τοπωνύμια στη βάση)"
          />
        </div>
      )}

      {showToponymCustom && !showTopFree && (
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
  const [mode, setMode] = useState<"loading" | "static" | "api">("loading");

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetchWithTimeout("/api/geo/municipalities");
        if (r.ok) {
          const d = (await r.json()) as { municipalities?: unknown[] };
          if (d.municipalities && d.municipalities.length > 0) {
            setMode("api");
            return;
          }
        }
      } catch {
        /* fallback */
      }
      setMode("static");
    })();
  }, []);

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
