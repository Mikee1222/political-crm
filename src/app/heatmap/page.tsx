"use client";

import dynamic from "next/dynamic";
import { HeatmapClient } from "./heatmap-client";

const DynamicMap = dynamic(() => import("@/components/map/DynamicMap"), {
  ssr: false,
  loading: () => (
    <div style={{ height: "500px", width: "100%" }} className="animate-pulse rounded-xl bg-gray-100 dark:bg-[var(--bg-elevated)]" />
  ),
});

export default function HeatmapPage() {
  return <HeatmapClient DynamicMap={DynamicMap} />;
}
