"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

export type PortalDropdownPosition = { top: number; left: number; width: number };

const PANEL_Z_INDEX = 9999;

export const PORTAL_DROPDOWN_PANEL_CLASS =
  "max-h-64 overflow-y-auto overflow-x-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] py-1 shadow-[var(--card-shadow)]";

type UsePortalDropdownOptions = {
  minWidth?: number;
  align?: "left" | "right";
  /** Controlled open state (optional). */
  open?: boolean;
  setOpen?: (open: boolean) => void;
};

export type PortalDropdownApi = {
  triggerRef: MutableRefObject<HTMLElement | null>;
  panelRef: MutableRefObject<HTMLDivElement | null>;
  open: boolean;
  setOpen: (open: boolean) => void;
  pos: PortalDropdownPosition | null;
  toggle: () => void;
  updatePosition: () => void;
};

export function usePortalDropdown(opts?: UsePortalDropdownOptions): PortalDropdownApi {
  const triggerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = opts?.open ?? uncontrolledOpen;
  const setOpen = opts?.setOpen ?? setUncontrolledOpen;
  const [pos, setPos] = useState<PortalDropdownPosition | null>(null);

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = Math.max(rect.width, opts?.minWidth ?? 0);
    const left =
      opts?.align === "right" ? Math.max(8, rect.right - width) : rect.left;
    setPos({ top: rect.bottom + 4, left, width });
  }, [opts?.align, opts?.minWidth]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updatePosition();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, setOpen]);

  const toggle = useCallback(() => setOpen(!open), [open, setOpen]);

  return {
    triggerRef: triggerRef as MutableRefObject<HTMLElement | null>,
    panelRef: panelRef as MutableRefObject<HTMLDivElement | null>,
    open,
    setOpen,
    pos,
    toggle,
    updatePosition,
  };
}

type PortalDropdownPanelProps = {
  open: boolean;
  pos: PortalDropdownPosition | null;
  panelRef: MutableRefObject<HTMLDivElement | null>;
  children: ReactNode;
  className?: string;
  role?: string;
  id?: string;
};

export function PortalDropdownPanel({
  open,
  pos,
  panelRef,
  children,
  className,
  role,
  id,
}: PortalDropdownPanelProps) {
  if (typeof document === "undefined" || !open || !pos) return null;
  return createPortal(
    <div
      ref={panelRef}
      id={id}
      role={role}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        width: pos.width,
        zIndex: PANEL_Z_INDEX,
      }}
      className={className ?? PORTAL_DROPDOWN_PANEL_CLASS}
    >
      {children}
    </div>,
    document.body,
  );
}
