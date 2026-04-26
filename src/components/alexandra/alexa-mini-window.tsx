"use client";

import { Maximize2, Minimize2, X, GripHorizontal } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { AlexandraChatView } from "@/components/alexandra/alexandra-chat-view";
import { useAlexandraChat } from "@/components/alexandra/alexandra-chat-provider";

const POS_KEY = "alexandra-mini-position";
const SIZE_KEY = "alexandra-mini-size";
const W = 380;
const H = 520;

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function defaultPos(): { x: number; y: number } {
  if (typeof window === "undefined") return { x: 32, y: 32 };
  return { x: window.innerWidth - W - 24, y: window.innerHeight - H - 24 };
}

function readPos(): { x: number; y: number } {
  if (typeof window === "undefined") return defaultPos();
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return defaultPos();
    const p = JSON.parse(raw) as { x: number; y: number };
    if (typeof p.x !== "number" || typeof p.y !== "number") return defaultPos();
    return p;
  } catch {
    return defaultPos();
  }
}

function savePos(p: { x: number; y: number }) {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

function readSize(): { w: number; h: number } {
  if (typeof window === "undefined") return { w: W, h: H };
  try {
    const raw = localStorage.getItem(SIZE_KEY);
    if (!raw) return { w: W, h: H };
    const p = JSON.parse(raw) as { w: number; h: number };
    if (typeof p.w !== "number" || typeof p.h !== "number") return { w: W, h: H };
    return { w: clamp(p.w, 300, 720), h: clamp(p.h, 360, 900) };
  } catch {
    return { w: W, h: H };
  }
}

function saveSize(s: { w: number; h: number }) {
  try {
    localStorage.setItem(SIZE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function AlexaMiniWindow() {
  const pathname = usePathname();
  const {
    miniWindowOpen,
    miniWindowMinimized,
    setMiniWindowMinimized,
    goToFullAlexandra,
    closeMiniWindow,
    currentTitle,
  } = useAlexandraChat();

  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const drag = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resize = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);
  const opened = useRef(false);

  useEffect(() => {
    if (!miniWindowOpen) {
      opened.current = false;
      return;
    }
    if (!opened.current) {
      setPos(readPos());
      setSize(readSize());
      opened.current = true;
    }
  }, [miniWindowOpen]);

  const effW = size?.w ?? W;
  const effH = size?.h ?? H;

  const layoutPos = useCallback(
    (p: { x: number; y: number }) => {
      if (typeof window === "undefined") return p;
      const w = miniWindowMinimized ? 200 : effW;
      const h = miniWindowMinimized ? 40 : effH;
      const maxX = Math.max(0, window.innerWidth - w);
      const maxY = Math.max(0, window.innerHeight - h);
      return { x: clamp(p.x, 0, maxX), y: clamp(p.y, 0, maxY) };
    },
    [miniWindowMinimized, effW, effH],
  );

  useEffect(() => {
    const onResize = () => {
      setPos((p) => (p ? layoutPos(p) : p));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [layoutPos]);

  const onPointerDownHeader = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    if (!pos) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const d = drag.current;
    const nx = d.origX + (e.clientX - d.startX);
    const ny = d.origY + (e.clientY - d.startY);
    setPos(layoutPos({ x: nx, y: ny }));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    drag.current = null;
    setPos((p) => {
      if (p) savePos(p);
      return p;
    });
  };

  if (pathname === "/alexandra" || pathname.startsWith("/alexandra/")) {
    return null;
  }
  if (!miniWindowOpen || pos === null || size === null) {
    return null;
  }

  if (miniWindowMinimized) {
    const el = (
      <div
        className="fixed z-[60] max-w-[min(100vw-16px,320px)]"
        style={{
          left: pos.x,
          top: pos.y,
          right: "auto",
          paddingBottom: "max(0px, env(safe-area-inset-bottom, 0px))",
        }}
      >
        <div className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[#0a1628]/95 px-3 py-2 shadow-2xl backdrop-blur-md">
          <span className="min-w-0 flex-1 cursor-grab select-none truncate text-xs font-medium text-[var(--accent-gold)]">{currentTitle || "Αλεξάνδρα"}</span>
          <button
            type="button"
            className="shrink-0 rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--accent-gold)]"
            aria-label="Ανάπτυξη"
            onClick={() => setMiniWindowMinimized(false)}
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="shrink-0 rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-red-500/15 hover:text-red-300"
            aria-label="Κλείσιμο"
            onClick={closeMiniWindow}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
    return createPortal(el, document.body);
  }

  const onResizePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    resize.current = { startX: e.clientX, startY: e.clientY, origW: size.w, origH: size.h };
  };
  const onResizePointerMove = (e: React.PointerEvent) => {
    if (!resize.current) return;
    const d = resize.current;
    const nw = clamp(d.origW + (e.clientX - d.startX), 300, 900);
    const nh = clamp(d.origH + (e.clientY - d.startY), 360, 1000);
    setSize({ w: nw, h: nh });
    setPos((p) => (p ? layoutPos(p) : p));
  };
  const onResizePointerUp = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    resize.current = null;
    setSize((s) => {
      if (s) saveSize(s);
      return s;
    });
  };

  const shell = (
    <div
      className="fixed z-[60] flex flex-col overflow-hidden rounded-2xl border border-[rgba(201,168,76,0.25)] bg-[#0a0f1a] shadow-[0_16px_48px_rgba(0,0,0,0.55)]"
      style={{
        left: pos.x,
        top: pos.y,
        width: effW,
        height: effH,
        maxWidth: "calc(100vw - 8px)",
        paddingBottom: 0,
      }}
    >
      <div
        className="flex shrink-0 cursor-grab select-none items-center gap-1 border-b border-[var(--border)] bg-gradient-to-r from-[#0f1e35] to-[#0a1628] px-2 py-1.5 active:cursor-grabbing"
        onPointerDown={onPointerDownHeader}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="toolbar"
        aria-label="Μετακίνηση"
      >
        <span className="min-w-0 flex-1 truncate pl-1 text-xs font-semibold text-[var(--accent-gold-light)]">{currentTitle || "Αλεξάνδρα"}</span>
        <button
          type="button"
          className="shrink-0 rounded-lg p-1.5 text-[var(--text-secondary)] transition hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
          title="Ελαχιστοποίηση"
          aria-label="Ελαχιστοποίηση"
          onClick={() => setMiniWindowMinimized(true)}
        >
          <Minimize2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="shrink-0 rounded-lg p-1.5 text-[var(--accent-gold)] transition hover:bg-[var(--bg-elevated)]"
          title="Πλήρης οθόνη (σελίδα Αλεξάνδρα)"
          aria-label="Πλήρης οθόνη"
          onClick={goToFullAlexandra}
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="shrink-0 rounded-lg p-1.5 text-[var(--text-secondary)] transition hover:bg-red-500/15 hover:text-red-200"
          title="Κλείσιμο"
          aria-label="Κλείσιμο"
          onClick={closeMiniWindow}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <AlexandraChatView mode="mini" />
        <div
          className="absolute bottom-0 right-0 z-10 flex h-7 w-7 cursor-nwse-resize items-end justify-end rounded-tl-md border-t border-l border-[var(--border)]/50 bg-[var(--bg-elevated)]/40 p-0.5 text-[var(--text-muted)]"
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
          onPointerCancel={onResizePointerUp}
          title="Μέγεθος"
          aria-label="Μεταβολή μεγέθους"
        >
          <GripHorizontal className="h-4 w-4 rotate-45 opacity-60" />
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(shell, document.body);
}
