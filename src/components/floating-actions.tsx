"use client";

import { usePathname, useRouter } from "next/navigation";
import { CheckSquare, Inbox, Plus, Sparkles, UserPlus, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAlexandraChat } from "@/components/alexandra/alexandra-chat-provider";
import { hasMinRole } from "@/lib/roles";

type Props = {
  role: string;
};

const bottomOffsetMobile = "calc(5rem + env(safe-area-inset-bottom, 0px))";

function FabButton({
  open,
  onToggle,
  className,
}: {
  open: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-haspopup="menu"
      aria-label={open ? "Κλείσιμο γρήγορων ενεργειών" : "Γρήγορες ενέργειες"}
      onClick={onToggle}
      className={[
        "pointer-events-auto relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-amber-300/70 text-[var(--text-badge-on-gold)] shadow-[0_8px_24px_rgba(201,168,76,0.4)] transition hq-press-mobile",
        "bg-gradient-to-br from-amber-400 to-amber-600",
        className ?? "",
      ].join(" ")}
      style={{
        transform: open ? "rotate(45deg)" : undefined,
      }}
    >
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-2xl">
        <span className="absolute inset-0 animate-ping rounded-2xl border border-amber-400/45" aria-hidden />
      </div>
      {open ? (
        <X className="relative z-0 h-6 w-6" strokeWidth={2.2} aria-hidden />
      ) : (
        <Plus className="relative z-0 h-7 w-7 text-2xl font-thin" strokeWidth={1.8} aria-hidden />
      )}
    </button>
  );
}

function SpeedDialItems({
  items,
  onPick,
}: {
  items: { label: string; icon: LucideIcon; onClick: () => void }[];
  onPick: () => void;
}) {
  return (
    <div className="pointer-events-auto mb-1 flex w-full min-w-0 flex-col items-stretch gap-3">
      {items.map((it, i) => (
        <button
          key={it.label}
          type="button"
          style={{ animationDelay: `${i * 50}ms` }}
          className="hq-floating-dial-item flex h-12 min-h-12 w-[10.5rem] max-w-[min(10.5rem,calc(100vw-48px))] shrink-0 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-left text-sm font-semibold text-[var(--text-primary)] shadow-lg backdrop-blur-md hq-press-mobile"
          onClick={() => {
            it.onClick();
            onPick();
          }}
        >
          <it.icon className="h-5 w-5 shrink-0 text-[var(--accent-gold)]" aria-hidden />
          {it.label}
        </button>
      ))}
    </div>
  );
}

function AlexandraLaunchButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="pointer-events-auto relative">
      <div
        className="pointer-events-none absolute -inset-1 rounded-2xl bg-[radial-gradient(circle,rgba(201,168,76,0.35)_0%,transparent_72%)] opacity-90"
        aria-hidden
      />
      <button
        type="button"
        onClick={onClick}
        title="Άνοιγμα Αλεξάνδρα (μίνι παράθυρο)"
        aria-label="Άνοιγμα Αλεξάνδρα (μίνι παράθυρο)"
        className="relative flex items-center gap-2 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 px-4 py-3 text-white shadow-[0_8px_32px_rgba(201,168,76,0.4),0_2px_8px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.3)] transition duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-105 hover:shadow-[0_12px_40px_rgba(201,168,76,0.5)] active:scale-[0.97] hq-press-mobile"
      >
        <span className="text-base leading-none text-white/95" aria-hidden>
          ✦
        </span>
        <Sparkles className="h-5 w-5 shrink-0 text-white" strokeWidth={2.2} aria-hidden />
        <span className="text-xs font-semibold tracking-wide text-white sm:text-sm">Αλεξάνδρα</span>
        <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[10px] font-bold text-white/90">AI</span>
      </button>
    </div>
  );
}

/**
 * Unified FAB speed dial + desktop Alexandra launcher (single mount in AppFrame).
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

  if (hide) return null;

  const dialItems = [
    { label: "Νέα Επαφή", icon: UserPlus, onClick: () => go("/contacts?new=1") },
    { label: "Νέο Αίτημα", icon: Inbox, onClick: () => go("/requests?new=1") },
    { label: "Νέα Εργασία", icon: CheckSquare, onClick: () => go("/tasks?new=1") },
  ];

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
                  <FabButton open={open} onToggle={() => setOpen((o) => !o)} />
                </div>
              ) : null}

              <div className="pointer-events-none absolute bottom-6 right-6 hidden flex-col items-end gap-3 md:flex">
                {isManager && open ? <SpeedDialItems items={dialItems} onPick={() => setOpen(false)} /> : null}
                {isManager ? <FabButton open={open} onToggle={() => setOpen((o) => !o)} /> : null}
                {canAlex ? <AlexandraLaunchButton onClick={onAlexClick} /> : null}
              </div>
            </div>
          </>,
          document.body,
        )
      : null;

  return <>{portal}</>;
}
