"use client";

import { useEffect, useState } from "react";

/** Animates a numeric value 0 → target over `durationMs` (ease-out). */
export function useCountUp(target: number, durationMs = 800, decimals = 0) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!Number.isFinite(target)) {
      setV(0);
      return;
    }
    const start = performance.now();
    const from = 0;
    const to = target;
    let raf: number;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const ease = 1 - (1 - t) * (1 - t);
      setV(from + (to - from) * ease);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  const factor = 10 ** Math.max(0, decimals);
  return Math.round(v * factor) / factor;
}
