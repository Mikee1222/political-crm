"use client";

import { usePathname, useRouter } from "next/navigation";
import { CheckSquare, Inbox, Plus, UserPlus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { hasMinRole } from "@/lib/roles";

type Props = {
  role: string;
};

const bottomOffset = "calc(5rem + env(safe-area-inset-bottom, 0px))";

/**
 * Gold FAB + quick actions (managers, &lt; lg only). Menu is portaled to
 * `document.body` with z-index 9999 so it always stacks above page content.
 */
export function MobileQuickFab({ role }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const can = hasMinRole(role, "manager");
  const hide =
    !can ||
    pathname === "/login" ||
    pathname === "/portal" ||
    pathname.startsWith("/portal/");

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

  if (hide) return null;

  const items = [
    {
      label: "Νέα Επαφή",
      icon: UserPlus,
      onClick: () => go("/contacts?new=1"),
    },
    {
      label: "Νέο Αίτημα",
      icon: Inbox,
      onClick: () => go("/requests?new=1"),
    },
    {
      label: "Νέα Εργασία",
      icon: CheckSquare,
      onClick: () => go("/tasks?new=1"),
    },
  ];

  const portal =
    mounted && typeof document !== "undefined"
      ? createPortal(
          <>
            {open ? (
              <button
                type="button"
                className="fixed inset-0 z-[9998] cursor-default border-0 bg-[var(--overlay-scrim)] backdrop-blur-[2px]"
                aria-label="Κλείσιμο γρήγορων ενεργειών"
                onClick={() => setOpen(false)}
              />
            ) : null}
            <div
              ref={rootRef}
              className="pointer-events-none fixed z-[9999] flex flex-col items-end gap-2"
              style={{ right: 24, bottom: bottomOffset, left: "auto", top: "auto" }}
            >
              {open ? (
                <div className="pointer-events-auto mb-1 flex w-full min-w-0 flex-col items-stretch gap-2">
                  {items.map((it, i) => (
                    <button
                      key={it.label}
                      type="button"
                      style={{ animationDelay: `${i * 45}ms` }}
                      className="hq-fab-radial-item flex h-12 min-h-12 w-[10.5rem] max-w-[min(10.5rem,calc(100vw-48px))] shrink-0 items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-left text-sm font-semibold text-[var(--text-primary)] shadow-xl backdrop-blur-md hq-press-mobile"
                      onClick={it.onClick}
                    >
                      <it.icon className="h-5 w-5 shrink-0 text-[var(--accent-gold)]" aria-hidden />
                      {it.label}
                    </button>
                  ))}
                </div>
              ) : null}
              <button
                type="button"
                aria-expanded={open}
                aria-haspopup="menu"
                aria-label={open ? "Κλείσιμο γρήγορων ενεργειών" : "Γρήγορες ενέργειες"}
                onClick={() => setOpen((o) => !o)}
                className="pointer-events-auto relative flex h-14 w-14 min-h-14 min-w-14 items-center justify-center overflow-hidden rounded-2xl border border-amber-300/70 text-[var(--text-badge-on-gold)] shadow-[0_8px_24px_rgba(201,168,76,0.4)] transition hq-press-mobile"
                style={{
                  background: "linear-gradient(145deg, #f0c76b 0%, #C9A84C 45%, #b88f2f 100%)",
                  transform: open ? "rotate(45deg)" : undefined,
                }}
              >
                <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-2xl">
                  <span className="absolute inset-0 animate-ping rounded-2xl border border-amber-400/45" aria-hidden />
                </div>
                <Plus className="relative z-0 h-7 w-7 text-2xl font-thin" strokeWidth={1.8} />
              </button>
            </div>
          </>,
          document.body,
        )
      : null;

  return <>{portal}</>;
}
