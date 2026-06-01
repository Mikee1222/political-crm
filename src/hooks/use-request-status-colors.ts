"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithTimeout } from "@/lib/client-fetch";
import {
  getDefaultRequestStatusColors,
  type RequestStatusColorsMap,
} from "@/lib/request-status-colors";

let cachedColors: RequestStatusColorsMap | null = null;
let inflight: Promise<RequestStatusColorsMap> | null = null;

async function fetchRequestStatusColors(): Promise<RequestStatusColorsMap> {
  if (cachedColors) return cachedColors;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetchWithTimeout("/api/crm-settings");
      if (!res.ok) return getDefaultRequestStatusColors();
      const j = (await res.json()) as { settings?: { request_status_colors?: RequestStatusColorsMap } };
      const colors = j.settings?.request_status_colors ?? getDefaultRequestStatusColors();
      cachedColors = colors;
      return colors;
    } catch {
      return getDefaultRequestStatusColors();
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function invalidateRequestStatusColorsCache() {
  cachedColors = null;
  inflight = null;
}

export function useRequestStatusColors() {
  const [colors, setColors] = useState<RequestStatusColorsMap>(
    () => cachedColors ?? getDefaultRequestStatusColors(),
  );
  const [loading, setLoading] = useState(!cachedColors);

  const reload = useCallback(async () => {
    invalidateRequestStatusColorsCache();
    setLoading(true);
    try {
      const next = await fetchRequestStatusColors();
      setColors(next);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (cachedColors) {
      setColors(cachedColors);
      setLoading(false);
      return;
    }
    let cancelled = false;
    void fetchRequestStatusColors().then((next) => {
      if (!cancelled) {
        setColors(next);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { colors, loading, reload };
}
