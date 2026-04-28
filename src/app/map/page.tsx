"use client";

import dynamic from "next/dynamic";
import { HeatmapClient } from "../heatmap/heatmap-client";

const MapComponent = dynamic(() => import("@/components/map/DynamicMap"), {
  ssr: false,
  loading: () => (
    <div
      style={{ height: "500px", width: "100%" }}
      className="h-[500px] w-full animate-pulse rounded-xl bg-gray-100 dark:bg-[var(--bg-elevated)]"
    />
  ),
});

export default function MapPage() {
  return <HeatmapClient DynamicMap={MapComponent} />;
}
