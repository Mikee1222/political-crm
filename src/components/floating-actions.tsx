"use client";

import { usePathname, useRouter } from "next/navigation";
import { CheckSquare, Inbox, Plus, Sparkles, UserPlus, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAlexandraChat } from "@/components/alexandra/alexandra-chat-provider";
import { hasMinRole } from "@/lib/roles";

type Props = {
  role: string;
};

const bottomOffsetMobile = "calc(5rem + env(safe-area-inset-bottom, 0px))";

const goldGradientStyle = { background: "linear-gradient(135deg, #C9A84C, #8B6914)" } as const;

function MobileFabButton({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-haspopup="menu"
      aria-label={open ? "Κλείσιμο γρήγορων ενεργειών" : "Γρήγορες ενέργειες"}
      onClick={onToggle}
      className="pointer-events-auto relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#C9A84C]/55 text-[var(--text-badge-on-gold)] shadow-[0_8px_24px_rgba(201,168,76,0.4)] transition hq-press-mobile"
      style={goldGradientStyle}
    >
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-2xl">
        <span className="absolute inset-0 animate-ping rounded-2xl border border-[#C9A84C]/45" aria-hidden />
      </div>
      {open ? (
        <X className="relative z-0 h-6 w-6" strokeWidth={2.2} aria-hidden />
      ) : (
        <Plus className="relative z-0 h-7 w-7 text-2xl font-thin" strokeWidth={1.8} aria-hidden />
      )}
    </button>
  );
}

function DesktopMergedFabButton({
  open,
  isManager,
  canAlex,
  onToggleDial,
  onAlexClick,
}: {
  open: boolean;
  isManager: boolean;
  canAlex: boolean;
  onToggleDial: () => void;
  onAlexClick: () => void;
}) {
  if (!isManager && !canAlex) return null;

  const handleClick = () => {
    if (isManager) {
      onToggleDial();
    } else if (canAlex) {
      onAlexClick();
    }
  };

  return (
    <button
      type="button"
      aria-expanded={isManager ? open : undefined}
      aria-haspopup={isManager ? "menu" : undefined}
      aria-label={open && isManager ? "Κλείσιμο γρήγορων ενεργειών" : "Αλεξάνδρα — γρήγορες ενέργειες"}
      onClick={handleClick}
      className="pointer-events-auto flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-[0_8px_32px_rgba(201,168,76,0.4)] transition"
      style={goldGradientStyle}
    >
      {open && isManager ? (
        <X className="h-5 w-5 shrink-0" strokeWidth={2.2} aria-hidden />
      ) : (
        <>
          <span className="text-base leading-none text-white/95" aria-hidden>
            ✦
          </span>
          <span className="text-sm font-semibold text-white">Αλεξάνδρα</span>
          <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-xs font-bold text-white/90">AI</span>
        </>
      )}
    </button>
  );
}

type DialItem = {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  variant?: "alex" | "default";
};

function SpeedDialItems({ items, onPick }: { items: DialItem[]; onPick: () => void }) {
  return (
    <div className="pointer-events-auto mb-1 flex w-full min-w-0 flex-col items-stretch gap-3">
      {items.map((it, i) => {
        const isAlex = it.variant === "alex";
        return (
          <button
            key={it.label}
            type="button"
            style={
              isAlex
                ? { animationDelay: `${i * 50}ms`, ...goldGradientStyle }
                : { animationDelay: `${i * 50}ms` }
            }
            className={[
              "hq-floating-dial-item flex h-12 min-h-12 w-[10.5rem] max-w-[min(10.5rem,calc(100vw-48px))] shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold shadow-lg backdrop-blur-md hq-press-mobile",
              isAlex
                ? "border border-white/25 text-white"
                : "border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)]",
            ].join(" ")}
            onClick={() => {
              it.onClick();
              onPick();
            }}
          >
            <it.icon className={["h-5 w-5 shrink-0", isAlex ? "text-white" : "text-[var(--accent-gold)]"].join(" ")} aria-hidden />
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Unified FAB: mobile = circular + speed dial; desktop = gold Αλεξάνδρα pill (merged) + speed dial.
 */
export function FloatingActions({ role }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { openMiniFromBubble, setMiniWindowMinimized } = useAlexandraChat();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const hide =
    pathname === "/login" ||
    pathname === "/portal" ||
    pathname.startsWith("/portal/");

  const isManager = hasMinRole(role, "manager");
  const canAlex = hasMinRole(role, "caller") && !pathname.startsWith("/alexandra");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  const onAlexClick = useCallback(() => {
    openMiniFromBubble();
    setMiniWindowMinimized(false);
  }, [openMiniFromBubble, setMiniWindowMinimized]);

  const dialItems: DialItem[] = useMemo(() => {
    const rest: DialItem[] = [
      { label: "Νέα Επαφή", icon: UserPlus, onClick: () => go("/contacts?new=1") },
      { label: "Νέο Αίτημα", icon: Inbox, onClick: () => go("/requests?new=1") },
      { label: "Νέα Εργασία", icon: CheckSquare, onClick: () => go("/tasks?new=1") },
    ];
    if (canAlex) {
      return [
        {
          label: "Αλεξάνδρα AI",
          icon: Sparkles,
          onClick: () => go("/alexandra"),
          variant: "alex",
        },
        ...rest,
      ];
    }
    return rest;
  }, [canAlex, go]);

  if (hide) return null;

  const showAny = isManager || canAlex;
  if (!showAny) return null;

  const portal =
    mounted && typeof document !== "undefined"
      ? createPortal(
          <>
            {open && isManager ? (
              <button
                type="button"
                className="fixed inset-0 z-40 cursor-default border-0 bg-black/20 backdrop-blur-[1px]"
                aria-label="Κλείσιμο γρήγορων ενεργειών"
                onClick={() => setOpen(false)}
              />
            ) : null}
            <div ref={rootRef} className="pointer-events-none fixed inset-0 z-50">
              {isManager ? (
                <div
                  className="pointer-events-none absolute right-4 flex flex-col items-end gap-2 md:hidden"
                  style={{ bottom: bottomOffsetMobile }}
                >
                  {open ? <SpeedDialItems items={dialItems} onPick={() => setOpen(false)} /> : null}
                  <MobileFabButton open={open} onToggle={() => setOpen((o) => !o)} />
                </div>
              ) : null}

              {/* Desktop: dial items sit above fixed merged button; button is fixed so it matches spec */}
              <div className="pointer-events-none absolute bottom-6 right-6 hidden flex-col items-end gap-3 md:flex">
                {isManager && open ? <SpeedDialItems items={dialItems} onPick={() => setOpen(false)} /> : null}
                <DesktopMergedFabButton
                  open={open}
                  isManager={isManager}
                  canAlex={canAlex}
                  onToggleDial={() => setOpen((o) => !o)}
                  onAlexClick={onAlexClick}
                />
              </div>
            </div>
          </>,
          document.body,
        )
      : null;

  return <>{portal}</>;
}
