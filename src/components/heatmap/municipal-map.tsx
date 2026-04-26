"use client";

import { useMemo } from "react";
import type { PathOptions } from "leaflet";
import { MapContainer, TileLayer, Circle, Tooltip } from "react-leaflet";
import { MAP_REGION } from "@/lib/aitoloakarnania-map-centroids";
import "leaflet/dist/leaflet.css";

const GOLD = "#C9A84C";
const GOLD_LIGHT = "#E8C96B";

export type MapMode = "contacts" | "positive" | "negative";

export type ForMapRow = {
  muni: string;
  total: number;
  positive: number;
  negative: number;
  pending: number;
  noAnswer: number;
  heat: number;
  lat: number;
  lng: number;
  radius: number;
};

function pathOptionsForHeat(heat: number) {
  if (heat === 0) {
    return {
      fillColor: "transparent",
      fillOpacity: 0,
      color: "rgba(201, 168, 76, 0.15)",
      weight: 1,
      opacity: 0.35,
    };
  }
  if (heat <= 10) {
    return {
      fillColor: GOLD,
      fillOpacity: 0.3,
      color: "rgba(201, 168, 76, 0.5)",
      weight: 1,
    };
  }
  if (heat <= 50) {
    return {
      fillColor: GOLD,
      fillOpacity: 0.6,
      color: "rgba(232, 201, 107, 0.65)",
      weight: 1,
    };
  }
  if (heat <= 100) {
    return {
      fillColor: GOLD_LIGHT,
      fillOpacity: 0.8,
      color: "rgba(245, 215, 138, 0.85)",
      weight: 1.5,
    };
  }
  return {
    className: "leaflet-heatmap-glow",
    fillColor: GOLD_LIGHT,
    fillOpacity: 0.98,
    color: "#F5D78A",
    weight: 2,
  };
}

function BreakdownBars({
  p,
  neg,
  pen,
  na,
}: {
  p: number;
  neg: number;
  pen: number;
  na: number;
}) {
  const sum = p + neg + pen + na;
  const base = sum > 0 ? sum : 1;
  const h = (n: number) => `${Math.max(2, (n / base) * 100)}%`;
  return (
    <div className="mt-2 flex h-9 gap-1" aria-hidden>
      {(
        [
          { n: p, bg: "bg-[#10B981]/85", key: "pos" },
          { n: neg, bg: "bg-[#EF4444]/85", key: "neg" },
          { n: pen, bg: "bg-slate-500/80", key: "pen" },
          { n: na, bg: "bg-[#F59E0B]/85", key: "na" },
        ] as const
      ).map((row) => (
        <div key={row.key} className="flex min-w-0 flex-1 flex-col items-stretch justify-end">
          <div
            className={`w-full min-h-[2px] rounded-t ${row.bg}`}
            style={{ height: h(row.n) }}
          />
        </div>
      ))}
    </div>
  );
}

type MunicipalMapProps = {
  forMap: ForMapRow[];
  onSelect: (muni: string) => void;
};

export function MunicipalMap({ forMap, onSelect }: MunicipalMapProps) {
  const bounds = useMemo(
    () =>
      [MAP_REGION.maxBounds[0], MAP_REGION.maxBounds[1]] as [[number, number], [number, number]],
    [],
  );
  return (
    <MapContainer
      className="heatmap-leaflet z-0 h-full min-h-[320px] w-full overflow-hidden rounded-2xl border border-[var(--border)]"
      center={MAP_REGION.center}
      zoom={MAP_REGION.zoom}
      minZoom={8}
      maxZoom={12}
      maxBounds={bounds}
      maxBoundsViscosity={0.65}
      scrollWheelZoom
      style={{ width: "100%" }}
    >
      <TileLayer
        url="https://cartodb-basemaps-a.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png"
        attribution="&copy; <a href='https://www.openstreetmap.org/copyright'>OSM</a> &copy; <a href='https://carto.com/attributions'>CARTO</a>"
      />
      {forMap.map((m) => (
        <Circle
          key={m.muni}
          center={[m.lat, m.lng]}
          radius={m.radius}
          pathOptions={pathOptionsForHeat(m.heat) as PathOptions}
          eventHandlers={{
            click: () => onSelect(m.muni),
          }}
        >
          <Tooltip
            className="heatmap-tt"
            direction="top"
            sticky
            offset={[0, -8]}
            opacity={1}
          >
            <div className="max-w-[min(100vw,260px)] px-0.5 text-[12px] leading-tight text-[#f0f4ff]">
              <p className="font-semibold text-[var(--accent-gold-light)]">{m.muni.replace(/^Δήμος /, "Δ. ")}</p>
              <p className="mt-1 text-[#8fa3bf]">
                Σύνολο: <span className="text-[#f0f4ff]">{m.total}</span> επαφές
              </p>
              <p className="mb-0.5 mt-1.5 text-[9px] uppercase tracking-wide text-[#4a6080]">Θετικοί / Αρνητικοί / Αναμονή / Δεν απάντησε</p>
              <BreakdownBars p={m.positive} neg={m.negative} pen={m.pending} na={m.noAnswer} />
              <p className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] text-[#8fa3bf]">
                <span>Θετικοί: {m.positive}</span>
                <span>Αρνητικοί: {m.negative}</span>
                <span>Αναμονή: {m.pending}</span>
                <span>Δεν απάντησε: {m.noAnswer}</span>
              </p>
            </div>
          </Tooltip>
        </Circle>
      ))}
    </MapContainer>
  );
}
