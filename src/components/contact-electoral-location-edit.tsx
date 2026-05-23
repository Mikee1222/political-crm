"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MUNICIPALITIES,
  getAllSettlementsForMuni,
  getDistrictsForMuni,
  getSettlements,
} from "@/lib/aitoloakarnania-data";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { HqSelect } from "@/components/ui/hq-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type { MunicipalityRow } from "@/app/api/geo/municipalities/route";
import type { ElectoralDistrictRow } from "@/app/api/geo/electoral-districts/route";
import type { ToponymRow } from "@/app/api/geo/toponyms/route";

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

/** Municipality / electoral district / toponym — native selects + text fallback for contact edit. */
export function ContactElectoralLocationEdit({
  values,
  onChange,
  inputClassName,
  labelClassName = "text-[11px] font-medium uppercase tracking-[0.05em] text-[var(--text-muted)]",
}: Props) {
  const muni = values.municipality?.trim() ?? "";
  const dist = values.electoral_district?.trim() ?? "";
  const top = values.toponym ?? "";

  const [useApi, setUseApi] = useState(false);
  const [municipalities, setMunicipalities] = useState<MunicipalityRow[]>([]);
  const [districts, setDistricts] = useState<ElectoralDistrictRow[]>([]);
  const [toponymNames, setToponymNames] = useState<string[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetchWithTimeout("/api/geo/municipalities");
        if (!r.ok) return;
        const d = (await r.json()) as { municipalities?: MunicipalityRow[] };
        if (d.municipalities?.length) {
          setMunicipalities(d.municipalities);
          setUseApi(true);
        }
      } catch {
        /* static fallback */
      }
    })();
  }, []);

  const muniId = useMemo(
    () => (useApi ? municipalities.find((x) => x.name === muni)?.id ?? null : null),
    [useApi, municipalities, muni],
  );

  useEffect(() => {
    if (!useApi || !muniId) {
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
  }, [useApi, muniId]);

  const distId = useMemo(
    () => districts.find((x) => x.name === dist)?.id ?? null,
    [districts, dist],
  );

  useEffect(() => {
    if (!muni) {
      setToponymNames([]);
      return;
    }
    if (useApi && muniId) {
      void (async () => {
        const q = new URLSearchParams({ municipality_id: muniId });
        if (distId) q.set("electoral_district_id", distId);
        const r = await fetchWithTimeout(`/api/geo/toponyms?${q.toString()}`);
        if (r.ok) {
          const d = (await r.json()) as { toponyms?: ToponymRow[] };
          setToponymNames((d.toponyms ?? []).map((t) => t.name).filter(Boolean));
        } else {
          setToponymNames([]);
        }
      })();
      return;
    }
    const staticNames = dist ? getSettlements(muni, dist) : getAllSettlementsForMuni(muni);
    setToponymNames([...staticNames]);
  }, [useApi, muniId, distId, muni, dist]);

  const municipalityOptions = useMemo(() => {
    const base = useApi
      ? municipalities.map((x) => x.name)
      : MUNICIPALITIES.map((x) => x.name);
    return withLegacyOption(base, muni);
  }, [useApi, municipalities, muni]);

  const districtOptions = useMemo(() => {
    const base = useApi
      ? districts.map((d) => d.name)
      : getDistrictsForMuni(muni).map((d) => d.name);
    return withLegacyOption(base, dist);
  }, [useApi, districts, muni, dist]);

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
        {toponymOptions.length > 0 ? (
          <HqSelect
            className={inputClassName + " !pr-9"}
            value={top}
            disabled={!muni}
            onChange={(e) => patch({ toponym: e.target.value || null })}
          >
            <option value="">Επιλέξτε τοπωνύμιο</option>
            {toponymOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </HqSelect>
        ) : (
          <input
            type="text"
            className={inputClassName}
            value={top}
            disabled={!muni}
            placeholder={muni ? "Πληκτρολογήστε τοπωνύμιο" : "Πρώτα επιλέξτε δήμο"}
            onChange={(e) => patch({ toponym: e.target.value || null })}
          />
        )}
        {toponymOptions.length > 0 && top && !toponymNames.includes(top.trim()) ? (
          <p className="text-[11px] text-[var(--text-muted)]">
            Τρέχουσα τιμή εκτός λίστας — επιλέξτε από τη λίστα ή αλλάξτε δήμο/διαμέρισμα.
          </p>
        ) : null}
      </div>
    </div>
  );
}
