"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

export type LeafletMapPoint = {
  lat: number;
  lng: number;
  label: string;
  count: number;
};

type Props = {
  points: LeafletMapPoint[];
  /** Max count for color scale */
  maxCount?: number;
};

const TILE = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>';

export default function LeafletMap({ points, maxCount = 1 }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    let cancelled = false;
    void (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !hostRef.current) return;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        layerRef.current = null;
      }

      const map = L.map(el, {
        center: [38.7, 21.4],
        zoom: 9,
        scrollWheelZoom: true,
      });
      mapRef.current = map;

      L.tileLayer(TILE, { maxZoom: 19, attribution: ATTR }).addTo(map);

      const group = L.layerGroup().addTo(map);
      layerRef.current = group;

      const max = Math.max(1, maxCount);
      for (const p of points) {
        const t = Math.min(1, p.count / max);
        const fill = `rgba(201, 168, 76, ${0.35 + t * 0.55})`;
        const stroke = "#1e5fa8";
        const m = L.circleMarker([p.lat, p.lng], {
          radius: Math.max(8, Math.min(36, 5 + Math.sqrt(Math.max(1, p.count)) * 2.2)),
          stroke: true,
          weight: 2,
          color: stroke,
          fillColor: fill,
          fillOpacity: 0.85,
        });
        m.bindPopup(`<strong>${escapeHtml(p.label)}</strong><br/>Επαφές: <b>${p.count}</b>`);
        m.addTo(group);
      }

      if (points.length) {
        const b = L.latLngBounds(points.map((x) => [x.lat, x.lng] as [number, number]));
        map.fitBounds(b.pad(0.12));
      }
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        layerRef.current = null;
      }
    };
  }, [points, maxCount]);

  return (
    <div className="space-y-2">
      <div ref={hostRef} className="w-full overflow-hidden rounded-xl border border-[var(--border)]" style={{ height: 500 }} />
      <Legend maxCount={maxCount} />
    </div>
  );
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function Legend({ maxCount }: { maxCount: number }) {
  const max = Math.max(1, maxCount);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/40 px-3 py-2 text-xs text-[var(--text-secondary)]">
      <span className="font-semibold text-[#C9A84C]">Κλίμακα:</span>
      <span className="inline-flex items-center gap-1">
        <span className="h-3 w-3 rounded-full border border-[#1e5fa8]" style={{ background: "rgba(201,168,76,0.4)" }} />
        λίγες
      </span>
      <span>→</span>
      <span className="inline-flex items-center gap-1">
        <span className="h-3 w-3 rounded-full border border-[#1e5fa8]" style={{ background: "rgba(201,168,76,0.95)" }} />
        πολλές (έως {max})
      </span>
    </div>
  );
}
