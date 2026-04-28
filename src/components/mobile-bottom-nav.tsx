"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Home, Inbox, Megaphone, Menu, Sparkles, Users } from "lucide-react";
import { hasMinRole } from "@/lib/roles";
import { useAlexandraChat } from "@/components/alexandra/alexandra-chat-provider";

type MobileBottomNavProps = {
  role: string;
  onOpenMore: () => void;
  openRequestsCount: number;
};

const inactive = "text-[var(--nav-mobile-inactive)]";
const active = "text-[var(--nav-mobile-active)]";

const navShell =
  "hq-bottom-nav safe-bottom fixed bottom-0 left-0 right-0 z-40 flex h-16 min-h-16 w-full min-w-0 max-w-full overflow-hidden border-t border-[var(--border)]/70 backdrop-blur-xl lg:hidden";

const innerBar =
  "grid w-full min-w-0 max-w-full grid-cols-5 grid-flow-row bg-white/80 pb-[env(safe-area-inset-bottom,0px)] pt-1 dark:bg-gray-900/80";
const innerBarVolunteer =
  "grid w-full min-w-0 max-w-full grid-cols-4 grid-flow-row bg-white/80 pb-[env(safe-area-inset-bottom,0px)] pt-1 dark:bg-gray-900/80";

export function MobileBottomNav({ role, onOpenMore, openRequestsCount }: MobileBottomNavProps) {
  const pathname = usePathname();
  const mgr = hasMinRole(role, "manager");
  const { openMiniFromBubble, setMiniWindowMinimized } = useAlexandraChat();

  const isActive = (path: string, exact = false) => {
    if (exact) return pathname === path;
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  const alexActive = pathname.startsWith("/alexandra");

  const tabClass = (on: boolean) =>
    [
      "hq-press-mobile flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl py-1 text-[10px] font-semibold tracking-tight transition-transform duration-200",
      on ? active : inactive,
      on ? "hq-bottom-nav-item-active" : "opacity-90",
    ].join(" ");

  if (mgr) {
    return (
      <nav className={navShell} role="navigation" aria-label="Κύρια πλοήγηση">
        <div className={innerBar}>
          <Link href="/dashboard" prefetch className={tabClass(isActive("/dashboard", true))}>
            <Home className={`h-5 w-5 shrink-0 ${isActive("/dashboard", true) ? active : inactive}`} />
            <span>Dashboard</span>
          </Link>
          <Link href="/contacts" prefetch className={tabClass(isActive("/contacts", true) || pathname.startsWith("/contacts/"))}>
            <Users className={`h-5 w-5 shrink-0 ${isActive("/contacts", true) || pathname.startsWith("/contacts/") ? active : inactive}`} />
            <span>Επαφές</span>
          </Link>
          <Link href="/requests" prefetch className={`${tabClass(isActive("/requests", true))} relative`}>
            <Inbox className={`h-5 w-5 shrink-0 ${isActive("/requests", true) ? active : inactive}`} />
            <span>Αιτήματα</span>
            {openRequestsCount > 0 && (
              <span
                className="absolute right-1 top-0 min-w-[1.1rem] rounded-full px-1 text-center text-[9px] font-bold leading-tight"
                style={{ background: "var(--nav-badge-bg)", color: "var(--nav-badge-fg)" }}
              >
                {openRequestsCount > 9 ? "9+" : openRequestsCount}
              </span>
            )}
          </Link>
          <Link href="/campaigns" prefetch className={tabClass(isActive("/campaigns", true))}>
            <Megaphone className={`h-5 w-5 shrink-0 ${isActive("/campaigns", true) ? active : inactive}`} />
            <span>Καμπάνιες</span>
          </Link>
          {hasMinRole(role, "caller") ? (
            <button
              type="button"
              className={tabClass(alexActive)}
              onClick={() => {
                openMiniFromBubble();
                setMiniWindowMinimized(false);
              }}
              aria-current={alexActive ? "page" : undefined}
            >
              <Sparkles className={`h-5 w-5 shrink-0 ${alexActive ? active : inactive}`} />
              <span>Αλεξάνδρα</span>
            </button>
          ) : (
            <span className={`${tabClass(false)} cursor-not-allowed opacity-40`} aria-disabled>
              <Sparkles className="h-5 w-5 shrink-0" />
              <span>Αλεξάνδρα</span>
            </span>
          )}
        </div>
      </nav>
    );
  }

  return (
    <nav className={navShell} role="navigation" aria-label="Κύρια πλοήγηση">
      <div className={innerBarVolunteer}>
        <Link href="/contacts" prefetch className={tabClass(isActive("/contacts", true) || pathname.startsWith("/contacts/"))}>
          <Users className={`h-5 w-5 shrink-0 ${isActive("/contacts", true) || pathname.startsWith("/contacts/") ? active : inactive}`} />
          <span>Επαφές</span>
        </Link>
        <Link href="/namedays" prefetch className={tabClass(isActive("/namedays", true))}>
          <CalendarDays className={`h-5 w-5 shrink-0 ${isActive("/namedays", true) ? active : inactive}`} />
          <span>Εορτ.</span>
        </Link>
        {hasMinRole(role, "caller") ? (
          <button
            type="button"
            className={tabClass(alexActive)}
            onClick={() => {
              openMiniFromBubble();
              setMiniWindowMinimized(false);
            }}
            aria-current={alexActive ? "page" : undefined}
          >
            <Sparkles className={`h-5 w-5 shrink-0 ${alexActive ? active : inactive}`} />
            <span>Αλεξάνδρα</span>
          </button>
        ) : (
          <span className={`${tabClass(false)} opacity-40`} aria-hidden>
            <Sparkles className="h-5 w-5 shrink-0" />
            <span>Αλεξάνδρα</span>
          </span>
        )}
        <button
          type="button"
          className={`${tabClass(false)} border-0 bg-transparent text-[var(--nav-mobile-inactive)]`}
          onClick={onOpenMore}
          aria-label="Περισσότερα"
        >
          <Menu className="h-5 w-5" />
          <span>Περισσ.</span>
        </button>
      </div>
    </nav>
  );
}
