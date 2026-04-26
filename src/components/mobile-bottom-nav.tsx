"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Home, Inbox, Menu, Sparkles, Users } from "lucide-react";
import { hasMinRole, type Role } from "@/lib/roles";

type MobileBottomNavProps = {
  role: Role;
  onOpenMore: () => void;
  openRequestsCount: number;
};

const activeIcon = "text-[var(--nav-mobile-active)]";
const inactiveIcon = "text-[var(--nav-mobile-inactive)]";
const itemBase = "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 min-h-[44px] text-[10px] font-medium transition duration-200 ease-out";
const itemLabel = (active: boolean) => (active ? "text-[var(--nav-mobile-active)]" : "text-[var(--nav-mobile-inactive)]");
const navClass =
  "hq-bottom-nav bottom-nav safe-bottom fixed bottom-0 left-0 right-0 z-40 flex h-14 w-full border-t border-[var(--border)] backdrop-blur-md md:hidden";

export function MobileBottomNav({ role, onOpenMore, openRequestsCount }: MobileBottomNavProps) {
  const pathname = usePathname();
  const mgr = hasMinRole(role, "manager");

  const isActive = (path: string, exact = false) => {
    if (exact) return pathname === path;
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  if (mgr) {
    return (
      <nav
        className={navClass + " min-h-14"}
        role="navigation"
        aria-label="Κύρια πλοήγηση"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <Link href="/dashboard" className={`${itemBase} ${itemLabel(isActive("/dashboard", true))}`} prefetch>
          <Home className={`h-5 w-5 shrink-0 ${isActive("/dashboard", true) ? activeIcon : inactiveIcon}`} />
          <span>Dashboard</span>
        </Link>
        <Link href="/contacts" className={`${itemBase} ${itemLabel(isActive("/contacts", true) || pathname.startsWith("/contacts/"))}`} prefetch>
          <Users className={`h-5 w-5 shrink-0 ${isActive("/contacts", true) || pathname.startsWith("/contacts/") ? activeIcon : inactiveIcon}`} />
          <span>Επαφές</span>
        </Link>
        <Link href="/alexandra" className={`${itemBase} ${itemLabel(pathname.startsWith("/alexandra"))}`} prefetch>
          <Sparkles className={`h-5 w-5 shrink-0 ${pathname.startsWith("/alexandra") ? activeIcon : inactiveIcon}`} />
          <span className={itemLabel(pathname.startsWith("/alexandra"))}>Αλεξάνδρα</span>
        </Link>
        <Link href="/requests" className={`${itemBase} ${itemLabel(isActive("/requests", true))} relative`} prefetch>
          <Inbox className={`h-5 w-5 shrink-0 ${isActive("/requests", true) ? activeIcon : inactiveIcon}`} />
          <span>Αιτήματα</span>
          {openRequestsCount > 0 && (
            <span
              className="absolute right-2 top-0.5 min-w-[1rem] rounded-full px-1 text-center text-[9px] font-bold"
              style={{ background: "var(--nav-badge-bg)", color: "var(--nav-badge-fg)" }}
            >
              {openRequestsCount > 9 ? "9+" : openRequestsCount}
            </span>
          )}
        </Link>
        <button
          type="button"
          className={itemBase + " w-full border-0 bg-transparent p-0 text-[var(--nav-mobile-inactive)]"}
          onClick={onOpenMore}
          aria-label="Περισσότερα"
        >
          <Menu className="h-5 w-5" />
          <span>Περισσότερα</span>
        </button>
      </nav>
    );
  }

  return (
    <nav
      className={navClass}
      role="navigation"
      aria-label="Κύρια πλοήγηση"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <Link href="/contacts" className={`${itemBase} ${itemLabel(isActive("/contacts", true) || pathname.startsWith("/contacts/"))}`} prefetch>
        <Users className={`h-5 w-5 ${isActive("/contacts", true) || pathname.startsWith("/contacts/") ? activeIcon : inactiveIcon}`} />
        <span>Επαφές</span>
      </Link>
      <Link href="/namedays" className={`${itemBase} ${itemLabel(isActive("/namedays", true))}`} prefetch>
        <CalendarDays className={`h-5 w-5 ${isActive("/namedays", true) ? activeIcon : inactiveIcon}`} />
        <span>Εορτ.</span>
      </Link>
      <Link href="/alexandra" className={`${itemBase} ${itemLabel(pathname.startsWith("/alexandra"))}`} prefetch>
        <Sparkles className={`h-5 w-5 ${pathname.startsWith("/alexandra") ? activeIcon : inactiveIcon}`} />
        <span className={itemLabel(pathname.startsWith("/alexandra"))}>Αλεξάνδρα</span>
      </Link>
      <button
        type="button"
        className={itemBase + " flex-1 border-0 bg-transparent p-0 text-[var(--nav-mobile-inactive)]"}
        onClick={onOpenMore}
        aria-label="Περισσότερα"
      >
        <Menu className="h-5 w-5" />
        <span>Παράπ.</span>
      </button>
    </nav>
  );
}
