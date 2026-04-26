import nextDynamic from "next/dynamic";

/** Avoid prerender: leaflet touches `window` during import. */
export const dynamic = "force-dynamic";

const HeatmapClient = nextDynamic(
  () => import("./heatmap-client").then((m) => m.HeatmapClient),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-full bg-[var(--bg-primary)] p-6">
        <p className="text-sm text-[var(--text-secondary)]">Φόρτωση χάρτη…</p>
      </div>
    ),
  },
);

export default function HeatmapPage() {
  return <HeatmapClient />;
}
