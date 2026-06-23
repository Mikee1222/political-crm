"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, Home, Inbox, Megaphone, Menu, Sparkles, Users } from "lucide-react";
import type { Profile } from "@/contexts/profile-context";
import { can } from "@/lib/can";
import { hasMinRole } from "@/lib/roles";

type MobileBottomNavProps = {
  profile: Profile | null;
  onOpenMore: () => void;
  openRequestsCount: number;
};

const inactive = "text-[var(--nav-mobile-inactive)]";
const active = "text-[var(--nav-mobile-active)]";

const navShell =
  "hq-bottom-nav safe-bottom fixed bottom-0 left-0 right-0 z-40 flex h-16 min-h-16 w-full min-w-0 max-w-full overflow-hidden border-t border-[var(--border)]/70 backdrop-blur-xl lg:hidden";

const innerBarBase =
  "grid w-full min-w-0 max-w-full grid-flow-row bg-[var(--bg-secondary)]/90 backdrop-blur-md pb-[env(safe-area-inset-bottom,0px)] pt-1";

const GRID_COLS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
};

export function MobileBottomNav({ profile, onOpenMore, openRequestsCount }: MobileBottomNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const role = profile?.role ?? "caller";
  const mgr = hasMinRole(role, "manager", profile?.access_tier);
  const canContacts = can(profile, "contacts_view");
  const canRequests = can(profile, "requests_view");
  const canCampaigns = can(profile, "campaigns_view");
  const canAlex = can(profile, "alexandra_use");

  const isTabActive = (path: string) => pathname === path || pathname.startsWith(`${path}/`);
  const alexActive = pathname.startsWith("/alexandra");

  const tabClass = (on: boolean) =>
    [
      "hq-press-mobile flex min-h-[44px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl py-1 text-[10px] font-semibold tracking-tight transition-transform duration-200",
      on ? active : inactive,
      on ? "hq-bottom-nav-item-active" : "opacity-90",
    ].join(" ");

  const alexTab = canAlex ? (
    <button
      type="button"
      className={tabClass(alexActive)}
      data-tour="alexandra-button"
      onClick={() => router.push("/alexandra")}
      aria-current={alexActive ? "page" : undefined}
    >
      <Sparkles className={`h-5 w-5 shrink-0 ${alexActive ? active : inactive}`} />
      <span>Αλεξάνδρα</span>
    </button>
  ) : null;

  if (mgr) {
    const tabs = [
      <Link
        key="dashboard"
        href="/dashboard"
        prefetch
        className={tabClass(pathname === "/dashboard")}
        aria-current={pathname === "/dashboard" ? "page" : undefined}
      >
        <Home className={`h-5 w-5 shrink-0 ${pathname === "/dashboard" ? active : inactive}`} />
        <span>Dashboard</span>
      </Link>,
      canContacts ? (
        <Link
          key="contacts"
          href="/contacts"
          prefetch
          className={tabClass(isTabActive("/contacts"))}
          aria-current={isTabActive("/contacts") ? "page" : undefined}
          data-tour="nav-contacts"
        >
          <Users className={`h-5 w-5 shrink-0 ${isTabActive("/contacts") ? active : inactive}`} />
          <span>Επαφές</span>
        </Link>
      ) : null,
      canRequests ? (
        <Link
          key="requests"
          href="/requests"
          prefetch
          className={`${tabClass(isTabActive("/requests"))} relative`}
          aria-current={isTabActive("/requests") ? "page" : undefined}
          data-tour="nav-requests"
        >
          <Inbox className={`h-5 w-5 shrink-0 ${isTabActive("/requests") ? active : inactive}`} />
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
      ) : null,
      canCampaigns ? (
        <Link
          key="campaigns"
          href="/campaigns"
          prefetch
          className={tabClass(isTabActive("/campaigns"))}
          aria-current={isTabActive("/campaigns") ? "page" : undefined}
        >
          <Megaphone className={`h-5 w-5 shrink-0 ${isTabActive("/campaigns") ? active : inactive}`} />
          <span>Καμπάνιες</span>
        </Link>
      ) : null,
      alexTab,
    ].filter(Boolean);

    const colCount = Math.min(5, Math.max(1, tabs.length));
    const gridClass = GRID_COLS[colCount] ?? "grid-cols-5";

    return (
      <nav className={navShell} role="navigation" aria-label="Κύρια πλοήγηση" data-tour="sidebar">
        <div className={`${innerBarBase} ${gridClass}`}>{tabs}</div>
      </nav>
    );
  }

  const tabs = [
    canContacts ? (
      <Link
        key="contacts"
        href="/contacts"
        prefetch
        className={tabClass(isTabActive("/contacts"))}
        aria-current={isTabActive("/contacts") ? "page" : undefined}
        data-tour="nav-contacts"
      >
        <Users className={`h-5 w-5 shrink-0 ${isTabActive("/contacts") ? active : inactive}`} />
        <span>Επαφές</span>
      </Link>
    ) : null,
    <Link
      key="namedays"
      href="/namedays"
      prefetch
      className={tabClass(isTabActive("/namedays"))}
      aria-current={isTabActive("/namedays") ? "page" : undefined}
    >
      <CalendarDays className={`h-5 w-5 shrink-0 ${isTabActive("/namedays") ? active : inactive}`} />
      <span>Εορτ.</span>
    </Link>,
    alexTab,
    <button
      key="more"
      type="button"
      className={`${tabClass(false)} border-0 bg-transparent text-[var(--nav-mobile-inactive)]`}
      onClick={onOpenMore}
      aria-label="Περισσότερα"
    >
      <Menu className="h-5 w-5" />
      <span>Περισσ.</span>
    </button>,
  ].filter(Boolean);

  const colCount = Math.min(4, Math.max(1, tabs.length));
  const gridClass = GRID_COLS[colCount] ?? "grid-cols-4";

  return (
    <nav className={navShell} role="navigation" aria-label="Κύρια πλοήγηση">
      <div className={`${innerBarBase} ${gridClass}`}>{tabs}</div>
    </nav>
  );
}
