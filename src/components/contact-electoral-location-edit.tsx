"use client";

import { useEffect, useMemo, useState } from "react";
import { getDistrictsForMuni } from "@/lib/aitoloakarnania-data";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { HqSelect } from "@/components/ui/hq-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type { MunicipalityRow } from "@/app/api/geo/municipalities/route";
import type { ElectoralDistrictRow } from "@/app/api/geo/electoral-districts/route";
import type { ToponymListRow } from "@/app/api/toponyms/route";

export type ElectoralLocationValues = {
  municipality: string | null;
  electoral_district: string | null;
  toponym: string | null;
};

function withLegacyOption(options: string[], current: string): string[] {
  if (!current || options.includes(current)) return options;
  return [current, ...options];
}

type Props = {
  values: ElectoralLocationValues;
  onChange: (v: ElectoralLocationValues) => void;
  inputClassName: string;
  labelClassName?: string;
};

/** Municipality / electoral district / toponym editor with searchable CRM dropdowns. */
export function ContactElectoralLocationEdit({
  values,
  onChange,
  inputClassName,
  labelClassName = "text-[11px] font-medium uppercase tracking-[0.05em] text-[var(--text-muted)]",
}: Props) {
  const muni = values.municipality?.trim() ?? "";
  const dist = values.electoral_district?.trim() ?? "";
  const top = values.toponym ?? "";

  const [municipalities, setMunicipalities] = useState<string[]>([]);
  const [geoMunicipalities, setGeoMunicipalities] = useState<MunicipalityRow[]>([]);
  const [districts, setDistricts] = useState<ElectoralDistrictRow[]>([]);
  const [toponyms, setToponyms] = useState<ToponymListRow[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetchWithTimeout("/api/municipalities");
        if (!r.ok) {
          setMunicipalities([]);
          return;
        }
        const data = (await r.json()) as string[];
        setMunicipalities(Array.isArray(data) ? data : []);
      } catch {
        setMunicipalities([]);
      }
    })();
  }, []);

  useEffect(() => {
    console.log("municipalities loaded:", municipalities.length);
  }, [municipalities]);

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

  const muniId = useMemo(
    () => geoMunicipalities.find((x) => x.name === muni)?.id ?? null,
    [geoMunicipalities, muni],
  );

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
    void (async () => {
      try {
        const r = await fetchWithTimeout("/api/toponyms");
        if (!r.ok) {
          setToponyms([]);
          return;
        }
        const d = (await r.json()) as ToponymListRow[];
        const clean = Array.isArray(d)
          ? d
              .filter((t) => t.name && t.name.trim().length > 2)
              .map((t) => ({ ...t, name: t.name.trim() }))
          : [];
        setToponyms(clean);
      } catch {
        setToponyms([]);
      }
    })();
  }, []);

  const municipalityOptions = useMemo(() => {
    return withLegacyOption(municipalities, muni);
  }, [municipalities, muni]);

  const districtOptions = useMemo(() => {
    const base = districts.length > 0 ? districts.map((d) => d.name) : getDistrictsForMuni(muni).map((d) => d.name);
    return withLegacyOption(base, dist);
  }, [districts, muni, dist]);

  const toponymNames = useMemo(() => toponyms.map((t) => t.name), [toponyms]);

  const toponymOptions = useMemo(() => withLegacyOption(toponymNames, top.trim()), [toponymNames, top]);

  const patch = (partial: Partial<ElectoralLocationValues>) =>
    onChange({ ...values, ...partial });

  return (
    <div className="col-span-1 flex w-full min-w-0 flex-col gap-3 sm:col-span-2">
      <div className="flex flex-col gap-2">
        <span className={labelClassName}>Δήμος</span>
        <SearchableSelect
          className={inputClassName + " !pr-9"}
          value={muni}
          onChange={(v) =>
            patch({
              municipality: v || null,
              electoral_district: null,
              toponym: null,
            })
          }
          options={municipalityOptions.map((name) => ({ value: name, label: name }))}
          placeholder="Επιλέξτε δήμο"
          searchPlaceholder="Αναζήτηση δήμου..."
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className={labelClassName}>Εκλογικό διαμέρισμα</span>
        {districtOptions.length > 0 ? (
          <HqSelect
            className={inputClassName + " !pr-9"}
            value={dist}
            disabled={!muni}
            onChange={(e) =>
              patch({
                electoral_district: e.target.value || null,
                toponym: null,
              })
            }
          >
            <option value="">Επιλέξτε ενότητα</option>
            {districtOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </HqSelect>
        ) : (
          <input
            type="text"
            className={inputClassName}
            value={dist}
            disabled={!muni}
            placeholder={muni ? "Πληκτρολογήστε εκλ. διαμέρισμα" : "Πρώτα επιλέξτε δήμο"}
            onChange={(e) =>
              patch({
                electoral_district: e.target.value || null,
                toponym: null,
              })
            }
          />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className={labelClassName}>Τοπωνύμιο / χωριό</span>
        <SearchableSelect
          className={inputClassName + " !pr-9"}
          value={top}
          disabled={!muni}
          onChange={(v) => patch({ toponym: v || null })}
          options={toponymOptions.map((name) => ({ value: name, label: name }))}
          placeholder={muni ? "Επιλέξτε τοπωνύμιο" : "Πρώτα επιλέξτε δήμο"}
          searchPlaceholder="Αναζήτηση τοπωνυμίου..."
          emptyText="Δεν βρέθηκαν τοπωνύμια"
        />
        {toponymNames.length > 0 && top && !toponymNames.includes(top.trim()) ? (
          <p className="text-[11px] text-[var(--text-muted)]">
            Τρέχουσα τιμή εκτός λίστας - επιλέξτε από τη λίστα ή αλλάξτε δήμο.
          </p>
        ) : null}
      </div>
    </div>
  );
}
