"use client";

import { useEffect, useState } from "react";

export function useMediaQuery(query: string, defaultValue = true) {
  const [matches, setMatches] = useState(defaultValue);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const m = window.matchMedia(query);
    setMatches(m.matches);
    const fn = (e: MediaQueryListEvent) => setMatches(e.matches);
    m.addEventListener("change", fn);
    return () => m.removeEventListener("change", fn);
  }, [query]);
  return matches;
}
