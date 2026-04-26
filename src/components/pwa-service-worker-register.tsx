"use client";

import { useEffect } from "react";

/**
 * Registers /public/sw.js. Safe to call in development (may 404; ignored).
 */
export function PwaServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    const w = window as Window & { __swRegistered?: boolean };
    if (w.__swRegistered) {
      return;
    }
    w.__swRegistered = true;
    void (async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        if (process.env.NODE_ENV === "development") {
          console.log("[PWA] service worker", reg?.scope);
        }
      } catch (e) {
        void e;
      }
    })();
  }, []);
  return null;
}
