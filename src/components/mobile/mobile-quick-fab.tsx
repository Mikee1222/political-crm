"use client";

import { usePathname, useRouter } from "next/navigation";
import { CheckSquare, Inbox, Plus, UserPlus } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { hasMinRole } from "@/lib/roles";

type Props = {
  role: string;
};

const bottomOffset = "calc(5rem + env(safe-area-inset-bottom, 0px))";

/**
 * Gold FAB + radial quick actions (managers, &lt; lg only).
 */
export function MobileQuickFab({ role }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const can = hasMinRole(role, "manager");
  const hide =
    !can ||
    pathname === "/login" ||
    pathname === "/portal" ||
    pathname.startsWith("/portal/");

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
      style: { "--fab-dx": "0px", "--fab-dy": "-88px" } as CSSProperties,
      onClick: () => go("/contacts?new=1"),
    },
    {
      label: "Νέο Αίτημα",
      icon: Inbox,
      style: { "--fab-dx": "-76px", "--fab-dy": "-44px" } as CSSProperties,
      onClick: () => go("/requests?new=1"),
    },
    {
      label: "Νέα Εργασία",
      icon: CheckSquare,
      style: { "--fab-dx": "76px", "--fab-dy": "-44px" } as CSSProperties,
      onClick: () => go("/tasks?new=1"),
    },
  ];

  return (
    <div ref={rootRef} className="pointer-events-none fixed right-4 z-[48] lg:hidden" style={{ bottom: bottomOffset }}>
      {open && (
        <div className="pointer-events-auto absolute bottom-[4.25rem] right-0 flex h-40 w-44 items-end justify-center">
          {items.map((it, i) => (
            <button
              key={it.label}
              type="button"
              style={{ ...it.style, animationDelay: `${i * 45}ms` }}
              className="hq-fab-radial-item absolute bottom-0 right-0 flex h-12 min-h-12 w-[10.5rem] items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-left text-sm font-semibold text-[var(--text-primary)] shadow-xl backdrop-blur-md hq-press-mobile"
              onClick={it.onClick}
            >
              <it.icon className="h-5 w-5 shrink-0 text-[var(--accent-gold)]" aria-hidden />
              {it.label}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={open ? "Κλείσιμο γρήγορων ενεργειών" : "Γρήγορες ενέργειες"}
        onClick={() => setOpen((o) => !o)}
        className="pointer-events-auto flex h-14 w-14 min-h-14 min-w-14 items-center justify-center rounded-full border-2 border-[#8B6914] text-[#0A1628] shadow-[0_10px_40px_rgba(201,168,76,0.45)] transition hq-press-mobile"
        style={{
          background: "linear-gradient(145deg, #e8c96b 0%, #c9a84c 40%, #8b6914 100%)",
          transform: open ? "rotate(45deg)" : undefined,
        }}
      >
        <Plus className="h-7 w-7" strokeWidth={2.5} />
      </button>
    </div>
  );
}
