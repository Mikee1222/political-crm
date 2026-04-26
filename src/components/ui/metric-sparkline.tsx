"use client";

/** Simple deterministic pseudo-random walk SVG sparkline (trend “feel” from a seed). */
function seriesFromSeed(seed: number, n = 12): number[] {
  let x = 0.5;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = ((Math.sin(seed * 12.9898 + i * 4.1414) + 1) / 2) * 0.28 - 0.14;
    x = Math.max(0.08, Math.min(0.92, x + r));
    out.push(x);
  }
  return out;
}

type Props = {
  seed: number;
  className?: string;
  /** upward = green-ish stroke; else muted */
  positive?: boolean;
};

export function MetricSparkline({ seed, className = "", positive = true }: Props) {
  const pts = seriesFromSeed(Math.floor(seed) || 1);
  const w = 72;
  const h = 28;
  const pad = 2;
  const d = pts
    .map((p, i) => {
      const x = pad + (i / (pts.length - 1)) * (w - pad * 2);
      const y = pad + (1 - p) * (h - pad * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const stroke = positive
    ? "var(--success, #10b981)"
    : "color-mix(in srgb, var(--text-muted) 75%, var(--text-primary))";
  return (
    <svg
      className={className}
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden
    >
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="opacity-90 [data-theme='light']:opacity-100"
      />
    </svg>
  );
}
