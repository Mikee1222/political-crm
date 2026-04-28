"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const THRESHOLD = 72;

type Props = {
  enabled: boolean;
};

/**
 * Pull down on the main scroll surface to refresh (contacts / requests).
 * Gold spinner; calls `router.refresh()`.
 */
export function MobilePullToRefresh({ enabled }: Props) {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const active = useRef(false);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);

  const finishRefresh = useCallback(() => {
    refreshingRef.current = true;
    setRefreshing(true);
    router.refresh();
    window.setTimeout(() => {
      refreshingRef.current = false;
      setRefreshing(false);
      pullRef.current = 0;
      setPull(0);
    }, 650);
  }, [router]);

  useEffect(() => {
    pullRef.current = pull;
  }, [pull]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const el = document.querySelector(".main-scroll");
    if (!el) return;

    const onTouchStart = (e: Event) => {
      const te = e as TouchEvent;
      if (el.scrollTop > 2) return;
      startY.current = te.touches[0]?.clientY ?? 0;
      active.current = true;
    };
    const onTouchMove = (e: Event) => {
      const te = e as TouchEvent;
      if (!active.current || refreshingRef.current) return;
      if (el.scrollTop > 2) {
        setPull(0);
        return;
      }
      const y = te.touches[0]?.clientY ?? 0;
      const dy = Math.max(0, y - startY.current);
      if (dy > 8) {
        const damped = Math.min(THRESHOLD * 1.35, dy * 0.45);
        pullRef.current = damped;
        setPull(damped);
        if (damped > 12) e.preventDefault();
      }
    };
    const onTouchEnd = () => {
      if (!active.current) return;
      active.current = false;
      const p = pullRef.current;
      if (p >= THRESHOLD * 0.85 && !refreshingRef.current) {
        finishRefresh();
      } else if (!refreshingRef.current) {
        pullRef.current = 0;
        setPull(0);
      }
    };
    const onTouchCancel = () => {
      active.current = false;
      if (!refreshingRef.current) {
        pullRef.current = 0;
        setPull(0);
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchCancel);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [enabled, finishRefresh]);

  if (!enabled) return null;

  const show = pull > 4 || refreshing;
  const progress = Math.min(1, pull / THRESHOLD);

  return (
    <div
      className="pointer-events-none fixed left-0 right-0 z-[35] flex justify-center lg:hidden"
      style={{
        top: "max(52px, env(safe-area-inset-top, 0px))",
        opacity: show ? 1 : 0,
        transform: `translateY(${show ? 8 : -8}px)`,
        transition: "opacity 0.2s ease, transform 0.2s ease",
      }}
      aria-hidden
    >
      <div
        className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-card)]/95 shadow-lg backdrop-blur-md"
        style={{
          opacity: refreshing ? 1 : 0.35 + progress * 0.65,
        }}
      >
        <div
          className={`h-5 w-5 rounded-full border-2 border-transparent hq-pull-spinner ${refreshing ? "opacity-100" : ""}`}
          style={{
            transform: refreshing ? undefined : `rotate(${progress * 320}deg)`,
          }}
        />
      </div>
    </div>
  );
}
