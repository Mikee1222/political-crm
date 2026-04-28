"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";

const CENTER: [number, number] = [38.7, 21.4];
const ZOOM = 9;
const TILE = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export type HeatmapMarker = {
  lat: number;
  lng: number;
  muni: string;
  total: number;
  heat?: number;
};

function MapResize() {
  const map = useMap();
  const resize = useCallback(() => {
    try {
      map.invalidateSize();
    } catch {
      /* ignore */
    }
  }, [map]);
  useEffect(() => {
    resize();
    const t0 = window.setTimeout(resize, 0);
    const t1 = window.setTimeout(resize, 200);
    window.addEventListener("resize", resize);
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      window.removeEventListener("resize", resize);
    };
  }, [resize]);
  return null;
}

export type DynamicMapProps = {
  markers: HeatmapMarker[];
  /** Scale fill/radius (defaults from markers heat/total) */
  maxHeat?: number;
};

export default function DynamicMap({ markers, maxHeat }: DynamicMapProps) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("leaflet/dist/leaflet.css");
    void import("leaflet").then(() => setReady(true));
  }, []);

  const max = Math.max(1, maxHeat ?? 1, ...markers.map((m) => m.heat ?? m.total));

  if (!ready) {
    return (
      <div
        style={{ height: 500, width: "100%" }}
        className="animate-pulse rounded-xl bg-[var(--bg-elevated)]"
        aria-hidden
      />
    );
  }

  return (
    <div style={{ height: 500, width: "100%" }} className="relative z-0 overflow-hidden rounded-xl border border-[var(--border)]">
      <MapContainer
        center={CENTER}
        zoom={ZOOM}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
        className="z-0 [&_.leaflet-container]:h-full [&_.leaflet-container]:w-full [&_.leaflet-container]:font-sans"
      >
        <MapResize />
        <TileLayer attribution={ATTR} url={TILE} maxZoom={19} />
        {markers.map((m) => {
          const val = m.heat ?? m.total;
          const t = Math.min(1, val / max);
          const radius = Math.max(6, Math.min(28, 5 + Math.sqrt(Math.max(1, val)) * 2));
          const label = m.muni.replace(/^Δήμος /, "Δ. ");
          return (
            <CircleMarker
              key={m.muni}
              center={[m.lat, m.lng]}
              radius={radius}
              pathOptions={{
                fillColor: "#c9a84c",
                fillOpacity: 0.35 + t * 0.55,
                color: "#1e5fa8",
                weight: 2,
              }}
            >
              <Popup>
                <span className="text-sm">
                  <strong>{label}</strong>
                  <br />
                  Επαφές: <b>{m.total}</b>
                </span>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
