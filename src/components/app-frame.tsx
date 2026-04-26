"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowLeft,
  Calendar,
  CalendarDays,
  ChartColumnBig,
  CheckSquare,
  Cog,
  FileText,
  Map as MapIcon,
  Megaphone,
  Menu,
  NotebookText,
  PenLine,
  Search,
  Sparkles,
  Users,
  Wrench,
  BarChart3,
  Building2,
  CalendarCheck,
  ChevronsDown,
  ChevronsLeft,
  ChevronsRight,
  HeartHandshake,
  X,
} from "lucide-react";
import { AlexaMiniWindow } from "@/components/alexandra/alexa-mini-window";
import { AiAssistantWidget } from "@/components/ai-assistant-widget";
import { LogoutButton } from "@/components/logout-button";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { MobileMoreSheet, type MoreNavItem } from "@/components/mobile-more-sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import { useProfile } from "@/contexts/profile-context";
import { useMediaQuery } from "@/hooks/use-media-query";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { hasMinRole, ROLE_BADGE, type Role } from "@/lib/roles";
import type { LucideIcon } from "lucide-react";

const STORAGE_SIDEBAR = "crm-sidebar-expanded";
const STORAGE_NAV_GROUPS = "crm-nav-groups";

type NavItem = { href: string; label: string; icon: LucideIcon; minRole: Role; badge?: "requests" };

const NAV_CONFIG: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: ChartColumnBig, minRole: "manager" },
  { href: "/contacts", label: "Επαφές", icon: Users, minRole: "caller" },
  { href: "/heatmap", label: "Χάρτης", icon: MapIcon, minRole: "manager" },
  { href: "/parliament", label: "Βουλή", icon: Building2, minRole: "manager" },
  { href: "/requests", label: "Αιτήματα", icon: NotebookText, minRole: "manager", badge: "requests" },
  { href: "/campaigns", label: "Καμπάνιες", icon: Megaphone, minRole: "manager" },
  { href: "/events", label: "Εκδηλώσεις", icon: CalendarCheck, minRole: "manager" },
  { href: "/tasks", label: "Εργασίες", icon: CheckSquare, minRole: "manager" },
  { href: "/volunteers", label: "Εθελοντές", icon: HeartHandshake, minRole: "manager" },
  { href: "/analytics", label: "Αναλυτικά", icon: BarChart3, minRole: "manager" },
  { href: "/namedays", label: "Εορτολόγιο", icon: CalendarDays, minRole: "caller" },
  { href: "/schedule", label: "Πρόγραμμα", icon: Calendar, minRole: "manager" },
  { href: "/data-tools", label: "Εργαλεία", icon: Wrench, minRole: "manager" },
  { href: "/documents", label: "Έγγραφα", icon: FileText, minRole: "manager" },
  { href: "/content", label: "Περιεχόμενο", icon: PenLine, minRole: "manager" },
  { href: "/settings", label: "Ρυθμίσεις", icon: Cog, minRole: "manager" },
];

const groupDefs: { id: string; label: string; hrefs: string[] }[] = [
  { id: "kyria", label: "ΚΥΡΙΑ", hrefs: ["/dashboard", "/contacts", "/heatmap"] },
  { id: "politika", label: "ΠΟΛΙΤΙΚΑ", hrefs: ["/parliament", "/requests", "/campaigns", "/events"] },
  { id: "organosi", label: "ΟΡΓΑΝΩΣΗ", hrefs: ["/tasks", "/volunteers", "/analytics", "/namedays"] },
  { id: "ergaleia", label: "ΕΡΓΑΛΕΙΑ", hrefs: ["/schedule", "/data-tools", "/documents", "/content"] },
];

const navItemByHref = (() => {
  const m = new Map<string, NavItem>();
  for (const it of NAV_CONFIG) m.set(it.href, it);
  return m;
})();

const DEFAULT_GROUP_STATE: Record<string, boolean> = {
  kyria: true,
  politika: true,
  organosi: true,
  ergaleia: true,
};

const settingsItem: NavItem = navItemByHref.get("/settings")!;

function pageTitle(pathname: string) {
  if (pathname.startsWith("/dashboard")) return "Dashboard";
  if (pathname.startsWith("/contacts")) return "Επαφές";
  if (pathname.startsWith("/heatmap")) return "Χάρτης";
  if (pathname.startsWith("/namedays")) return "Εορτολόγιο";
  if (pathname.startsWith("/campaigns")) return "Καμπάνιες";
  if (pathname.startsWith("/parliament")) return "Βουλή";
  if (pathname.startsWith("/events")) return "Εκδηλώσεις";
  if (pathname.startsWith("/volunteers")) return "Εθελοντές";
  if (pathname.startsWith("/analytics")) return "Αναλυτικά";
  if (pathname.startsWith("/requests")) return "Αιτήματα";
  if (pathname.startsWith("/tasks")) return "Εργασίες";
  if (pathname.startsWith("/schedule")) return "Πρόγραμμα";
  if (pathname.startsWith("/data-tools")) return "Εργαλεία δεδομένων";
  if (pathname.startsWith("/documents")) return "Έγγραφα";
  if (pathname.startsWith("/content")) return "Περιεχόμενο";
  if (pathname.startsWith("/settings")) return "Ρυθμίσεις";
  if (pathname.startsWith("/alexandra")) return "Αλεξάνδρα";
  return "Καραγκούνης CRM";
}

function breadcrumbFor(path: string) {
  return pageTitle(path);
}

function initials(fullName: string | null, fallback: string) {
  if (!fullName) return fallback.slice(0, 2).toUpperCase();
  const p = fullName.split(/\s+/).filter(Boolean);
  if (p.length >= 2) return `${p[0]![0]}${p[1]![0]}`.toUpperCase();
  return p[0]?.slice(0, 2).toUpperCase() ?? "ΚΚ";
}

const navItemBase =
  "group flex h-12 max-h-12 shrink-0 items-center gap-3 rounded-lg border-l-[3px] border-transparent pl-2 pr-2 text-sm transition duration-200 ease-out";
const navItemInactive = [
  "text-[var(--nav-ink)]",
  "[&>span]:text-[var(--nav-ink)]",
  "hover:border-transparent hover:bg-[var(--nav-item-hover-bg)] hover:text-[var(--nav-ink-hover)] hover:[&>span]:text-[var(--nav-ink-hover)]",
].join(" ");
const navItemIconInactive = "text-[var(--nav-icon-inactive)] group-hover:text-[var(--nav-icon-hover)]";
const navItemActive = [
  "border-[var(--nav-item-active-border)] bg-[var(--nav-item-active-bg)]",
  "!text-[var(--nav-item-active-fg)] [&>span]:!text-[var(--nav-item-active-fg)]",
].join(" ");
const navItemIconActive = "text-[var(--nav-icon-active)]";
const groupHeaderClass = "px-2 py-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]/90";

function mainTabHrefsForRole(r: Role): Set<string> {
  if (hasMinRole(r, "manager")) {
    return new Set(["/dashboard", "/contacts", "/alexandra", "/requests"]);
  }
  return new Set(["/contacts", "/namedays", "/alexandra"]);
}

function resolveItemsForGroup(hrefs: string[], role: Role) {
  const out: NavItem[] = [];
  for (const h of hrefs) {
    const it = navItemByHref.get(h);
    if (it && hasMinRole(role, it.minRole)) out.push(it);
  }
  return out;
}

function flatOrderedNavItems(role: Role) {
  const all: NavItem[] = [];
  for (const g of groupDefs) {
    for (const it of resolveItemsForGroup(g.hrefs, role)) all.push(it);
  }
  if (hasMinRole(role, settingsItem.minRole)) all.push(settingsItem);
  return all;
}

function NavItemRow({
  item,
  pathname,
  role,
  openRequestsCount,
  onNavigate,
  showLabels,
}: {
  item: NavItem;
  pathname: string;
  role: Role;
  openRequestsCount: number;
  onNavigate?: () => void;
  showLabels: boolean;
}) {
  const Icon = item.icon;
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={[
        navItemBase,
        "relative",
        !showLabels && "min-w-0 justify-center pl-0 pr-0",
        active ? navItemActive : navItemInactive,
      ].join(" ")}
      title={!showLabels ? item.label : undefined}
    >
      <Icon
        className={["h-5 w-5 shrink-0 transition-colors duration-200 ease-out", active ? navItemIconActive : navItemIconInactive].join(" ")}
      />
      {showLabels && (
        <span className="flex min-w-0 flex-1 items-center justify-between gap-2 text-[14px] font-medium">
          <span className="truncate">{item.label}</span>
          {item.badge === "requests" && openRequestsCount > 0 && hasMinRole(role, "manager") && (
            <span
              className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
              style={{ background: "var(--nav-badge-bg)", color: "var(--nav-badge-fg)" }}
            >
              {openRequestsCount}
            </span>
          )}
        </span>
      )}
      {item.badge === "requests" && !showLabels && openRequestsCount > 0 && hasMinRole(role, "manager") && (
        <span
          className="absolute right-0.5 top-1.5 h-1.5 min-w-[0.4rem] rounded-full px-0.5"
          style={{ background: "var(--nav-badge-bg)" }}
        />
      )}
    </Link>
  );
}

function AlexandraRow({
  role,
  pathname,
  onNavigate,
  showLabels,
}: {
  role: Role;
  pathname: string;
  onNavigate?: () => void;
  showLabels: boolean;
}) {
  if (!hasMinRole(role, "caller")) {
    return null;
  }
  return (
    <Link
      href="/alexandra"
      onClick={onNavigate}
      className={[
        navItemBase,
        "relative",
        "mt-0.5 border-[var(--border)]/50 bg-[var(--nav-alex-row-bg)]",
        !showLabels && "justify-center pl-0 pr-0",
        pathname.startsWith("/alexandra")
          ? `${navItemActive} !bg-[var(--nav-alex-row-active-boost)]`
          : navItemInactive,
      ].join(" ")}
      title={!showLabels ? "Αλεξάνδρα" : undefined}
    >
      <Sparkles
        className={[
          "hq-shimmer h-5 w-5 shrink-0",
          pathname.startsWith("/alexandra") ? "text-[var(--nav-item-active-fg)]" : "text-[var(--nav-alex-inactive)] opacity-95",
        ].join(" ")}
      />
      {showLabels && (
        <span
          className={[
            "flex min-w-0 flex-1 items-center justify-between gap-1.5 text-[14px] font-semibold",
            pathname.startsWith("/alexandra")
              ? "text-[var(--nav-item-active-fg)]"
              : "text-[var(--text-primary)]",
          ].join(" ")}
        >
          <span
            className={pathname.startsWith("/alexandra") ? "text-[var(--nav-item-active-fg)]" : "text-[var(--accent-gold)]"}
          >
            Αλεξάνδρα
          </span>
          <span
            className="shrink-0 rounded border px-1.5 py-px text-[9px] font-bold uppercase tracking-wide"
            style={{
              borderColor: "var(--nav-alex-pill-border)",
              background: "var(--nav-alex-pill-bg)",
              color: "var(--nav-alex-pill-fg)",
            }}
          >
            AI
          </span>
        </span>
      )}
    </Link>
  );
}

function GroupBlock({
  group,
  groupOpen,
  onToggleGroup,
  pathname,
  role,
  openRequestsCount,
  onNavigate,
  showLabels,
  showGroupHeaders,
}: {
  group: (typeof groupDefs)[number];
  groupOpen: boolean;
  onToggleGroup: () => void;
  pathname: string;
  role: Role;
  openRequestsCount: number;
  onNavigate?: () => void;
  showLabels: boolean;
  showGroupHeaders: boolean;
}) {
  const items = resolveItemsForGroup(group.hrefs, role);
  if (items.length === 0) return null;

  if (showGroupHeaders) {
    return (
      <div className="mb-0.5">
        <button
          type="button"
          onClick={onToggleGroup}
          className="flex w-full min-w-0 items-center justify-between gap-1 rounded-md px-1.5 py-0.5 text-left transition hover:bg-white/[0.04]"
        >
          <span className={groupHeaderClass}>{group.label}</span>
          <ChevronsDown
            className={["h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] transition", groupOpen ? "rotate-0" : "rotate-[-90deg]"].join(" ")}
            aria-hidden
          />
        </button>
        {groupOpen && (
          <div className="mt-0.5 flex flex-col gap-0.5">
            {items.map((item) => (
              <NavItemRow
                key={item.href}
                item={item}
                pathname={pathname}
                role={role}
                openRequestsCount={openRequestsCount}
                onNavigate={onNavigate}
                showLabels={showLabels}
              />
            ))}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="mb-0.5 flex flex-col gap-0.5">
      {items.map((item) => (
        <NavItemRow
          key={item.href}
          item={item}
          pathname={pathname}
          role={role}
          openRequestsCount={openRequestsCount}
          onNavigate={onNavigate}
          showLabels={showLabels}
        />
      ))}
    </div>
  );
}

type SidebarContentProps = {
  pathname: string;
  role: Role;
  openRequestsCount: number;
  onNavigate?: () => void;
  showLabels: boolean;
  showGroupHeaders: boolean;
  groupState: Record<string, boolean>;
  onToggleGroup: (id: string) => void;
  pinBottom: ReactNode;
  flatRail: boolean;
};

function SidebarContent({
  pathname,
  role,
  openRequestsCount,
  onNavigate,
  showLabels,
  showGroupHeaders,
  groupState,
  onToggleGroup,
  pinBottom,
  flatRail,
}: SidebarContentProps) {
  if (flatRail) {
    const order = flatOrderedNavItems(role).filter((it) => it.href !== "/settings");
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]">
          {order.map((item) => (
            <NavItemRow
              key={item.href}
              item={item}
              pathname={pathname}
              role={role}
              openRequestsCount={openRequestsCount}
              onNavigate={onNavigate}
              showLabels={false}
            />
          ))}
        </div>
        {pinBottom}
      </div>
    );
  }
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]">
        {groupDefs.map((g) => (
          <GroupBlock
            key={g.id}
            group={g}
            groupOpen={groupState[g.id] !== false}
            onToggleGroup={() => onToggleGroup(g.id)}
            pathname={pathname}
            role={role}
            openRequestsCount={openRequestsCount}
            onNavigate={onNavigate}
            showLabels={showLabels}
            showGroupHeaders={showGroupHeaders}
          />
        ))}
      </div>
      {pinBottom}
    </div>
  );
}

export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, loading: profileLoading } = useProfile();
  const isPublic = pathname === "/login";
  const [openRequestsCount, setOpenRequestsCount] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [alexVoiceToast, setAlexVoiceToast] = useState(false);
  const isLg = useMediaQuery("(min-width: 1024px)", false);
  const [sidebarUserExpanded, setSidebarUserExpanded] = useState(true);
  const [groupState, setGroupState] = useState<Record<string, boolean>>({ ...DEFAULT_GROUP_STATE });

  useLayoutEffect(() => {
    if (isPublic) return;
    const ex = localStorage.getItem(STORAGE_SIDEBAR);
    if (ex === "0") setSidebarUserExpanded(false);
    else if (ex === "1") setSidebarUserExpanded(true);
    try {
      const g = localStorage.getItem(STORAGE_NAV_GROUPS);
      if (g) {
        const parsed = JSON.parse(g) as Record<string, boolean>;
        setGroupState((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // ignore
    }
  }, [isPublic]);

  const role: Role = profile?.role ?? "caller";
  const depth = pathname.split("/").filter(Boolean).length;
  const showBackMobile = depth >= 2;

  const moreMenuItems: MoreNavItem[] = useMemo(() => {
    const main = mainTabHrefsForRole(role);
    return NAV_CONFIG.filter((i) => hasMinRole(role, i.minRole) && !main.has(i.href));
  }, [role]);

  const sidebarW = !isLg ? 64 : sidebarUserExpanded ? 240 : 64;
  const showDesktopWideNav = isLg && sidebarUserExpanded;
  const showLabels = showDesktopWideNav;
  const showGroupHeaders = showDesktopWideNav;
  const mobileRail = !isLg;

  const toggleGroup = (id: string) => {
    setGroupState((s) => {
      const n = { ...s, [id]: !(s[id] !== false) };
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(STORAGE_NAV_GROUPS, JSON.stringify(n));
        } catch {
          // ignore
        }
      }
      return n;
    });
  };

  const onSidebarToggle = () => {
    if (isLg) {
      setSidebarUserExpanded((v) => {
        const n = !v;
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem(STORAGE_SIDEBAR, n ? "1" : "0");
          } catch {
            // ignore
          }
        }
        return n;
      });
    } else {
      setMobileNavOpen((o) => !o);
    }
  };

  useEffect(() => {
    setMoreOpen(false);
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (isPublic) return;
    if (typeof document === "undefined") return;
    if (!isLg && mobileNavOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [isLg, mobileNavOpen, isPublic]);

  useEffect(() => {
    if (isPublic) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (hasMinRole(role, "caller")) {
          router.push("/alexandra");
        }
      }
      if (e.key.toLowerCase() === "a" && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        if (!hasMinRole(role, "caller")) return;
        window.dispatchEvent(new Event("alexandra-voice-shortcut"));
        setAlexVoiceToast(true);
        window.setTimeout(() => setAlexVoiceToast(false), 2600);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isPublic, role, router]);

  useEffect(() => {
    if (isPublic) return;
    if (!hasMinRole(role, "manager")) {
      return;
    }
    fetchWithTimeout("/api/requests")
      .then((res) => res.json())
      .then((data) => {
        const rows = Array.isArray(data.requests) ? data.requests : [];
        const count = rows.filter((r: { status?: string }) => {
          return r.status === "Νέο" || r.status === "Σε εξέλιξη";
        }).length;
        setOpenRequestsCount(count);
      })
      .catch(() => setOpenRequestsCount(0));
  }, [isPublic, role]);

  const pinBottom = (opts: { onNavigate?: () => void; showLabels: boolean }) => (
    <div className="mt-auto space-y-0.5 border-t border-[var(--border)]/40 pt-1.5">
      {hasMinRole(role, settingsItem.minRole) && (
        <NavItemRow
          item={settingsItem}
          pathname={pathname}
          role={role}
          openRequestsCount={openRequestsCount}
          onNavigate={opts.onNavigate}
          showLabels={opts.showLabels}
        />
      )}
      <AlexandraRow
        role={role}
        pathname={pathname}
        onNavigate={opts.onNavigate}
        showLabels={opts.showLabels}
      />
    </div>
  );

  const shellStyle: CSSProperties = { ["--sidebar-width" as string]: `${sidebarW}px` };

  if (isPublic) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-[-webkit-fill-available] min-h-screen w-full max-w-full overflow-x-hidden bg-[var(--bg-primary)]" style={shellStyle}>
      <aside
        className="app-sidebar app-sidebar--rail fixed left-0 top-0 z-30 flex h-screen max-w-full flex-col overflow-hidden border-r border-[var(--border)] px-2 py-3 pb-2"
        style={{ background: "var(--sidebar-bg)" }}
        aria-label="Πλοήγηση"
      >
        <div
          className={[
            "mb-2 flex w-full min-w-0 items-center pl-0.5",
            showDesktopWideNav ? "justify-start" : "justify-center",
          ].join(" ")}
        >
          <div className="flex min-w-0 items-center gap-2">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[15px] font-bold tracking-tight text-white shadow-[0_0_24px_rgba(201,168,76,0.25)]"
              style={{ background: "linear-gradient(145deg, #c9a84c 0%, #8b6914 100%)" }}
            >
              ΚΚ
            </div>
            {showDesktopWideNav && (
              <div className="min-w-0">
                <p className="text-[15px] font-semibold leading-tight" style={{ color: "var(--sidebar-brand-title)" }}>
                  Καραγκούνης
                </p>
                <p
                  className="mt-0.5 text-[10px] font-medium uppercase leading-tight tracking-[0.1em] text-[var(--text-muted)]"
                >
                  ΒΑΣΗ ΔΕΔΟΜΕΝΩΝ
                </p>
              </div>
            )}
          </div>
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.04] via-transparent to-black/20" />
        <div className="relative z-10 mb-1 h-px flex-shrink-0 bg-gradient-to-r from-transparent via-[var(--accent-gold)]/40 to-transparent" />

        <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col">
          <SidebarContent
            pathname={pathname}
            role={role}
            openRequestsCount={openRequestsCount}
            onNavigate={undefined}
            showLabels={showLabels}
            showGroupHeaders={showGroupHeaders}
            groupState={groupState}
            onToggleGroup={toggleGroup}
            flatRail={mobileRail && !mobileNavOpen}
            pinBottom={pinBottom({ onNavigate: undefined, showLabels })}
          />
        </div>

        <div className="relative z-10 mt-auto flex w-full flex-shrink-0 border-t border-[var(--border)]/50 pt-1.5">
          <button
            type="button"
            onClick={onSidebarToggle}
            className="mx-auto flex h-10 w-full min-w-0 max-w-full items-center justify-center rounded-lg text-[var(--nav-ink)] transition hover:bg-[var(--nav-item-hover-bg)]"
            title={isLg ? (sidebarUserExpanded ? "Σύμπτυξη" : "Ανάπτυξη") : (mobileNavOpen ? "Κλείσιμο" : "Μενού")}
            aria-label={isLg ? (sidebarUserExpanded ? "Σύμπτυξη πλευρικής μπάρας" : "Ανάπτυξη πλευρικής μπάρας") : (mobileNavOpen ? "Κλείσιμο" : "Άνοιγμα μενού")}
          >
            {isLg && sidebarUserExpanded && <ChevronsLeft className="h-5 w-5" strokeWidth={2.25} aria-hidden />}
            {isLg && !sidebarUserExpanded && <ChevronsRight className="h-5 w-5" strokeWidth={2.25} aria-hidden />}
            {!isLg && !mobileNavOpen && <ChevronsRight className="h-5 w-5" strokeWidth={2.25} aria-hidden />}
            {!isLg && mobileNavOpen && <X className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      </aside>

      {!isLg && mobileNavOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[50] [background:var(--overlay-scrim)]"
            aria-label="Κλείσιμο μενού"
            onClick={() => setMobileNavOpen(false)}
          />
          <div
            className="fixed left-0 top-0 z-[55] box-border h-full w-[min(100vw,280px)] max-w-full overflow-y-auto border-r border-[var(--border)] p-3 shadow-[0_0_32px_rgba(0,0,0,0.45)]"
            style={{ background: "var(--sidebar-bg)" }}
            role="dialog"
            aria-modal
            aria-label="Μενού πλοήγησης"
          >
            <div className="mb-2 flex w-full min-w-0 items-center justify-between pl-0.5">
              <div className="flex min-w-0 items-center gap-2">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{ background: "linear-gradient(145deg, #c9a84c 0%, #8b6914 100%)" }}
                >
                  ΚΚ
                </div>
                <p className="min-w-0 text-sm font-semibold" style={{ color: "var(--sidebar-brand-title)" }}>
                  Καραγκούνης
                </p>
              </div>
              <button
                type="button"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--text-secondary)]"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Κλείσιμο"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mb-2 h-px bg-gradient-to-r from-transparent via-[var(--accent-gold)]/40 to-transparent" />
            <SidebarContent
              pathname={pathname}
              role={role}
              openRequestsCount={openRequestsCount}
              onNavigate={() => setMobileNavOpen(false)}
              showLabels
              showGroupHeaders
              groupState={groupState}
              onToggleGroup={toggleGroup}
              flatRail={false}
              pinBottom={pinBottom({ onNavigate: () => setMobileNavOpen(false), showLabels: true })}
            />
          </div>
        </>
      )}

      <div className="app-main-shell box-border flex min-h-0 min-w-0 flex-1 min-h-[-webkit-fill-available] min-h-screen flex-col overflow-x-hidden pl-0 lg:ml-[var(--sidebar-width)] lg:h-screen lg:min-h-0 lg:overflow-hidden">
        <header
          className="mobile-top-bar sticky top-0 z-20 box-border min-h-0 w-full min-w-0 max-w-full shrink-0 border-b border-[var(--border)] pt-[max(0px,env(safe-area-inset-top,0px))] backdrop-blur-lg [background:var(--topbar-bg)]"
        >
          <div className="box-border flex h-[52px] w-full min-w-0 max-w-full items-center justify-between gap-2 px-3 sm:px-6 md:h-[60px] md:px-8">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              {showBackMobile && (
                <button
                  type="button"
                  className="flex h-10 min-h-10 w-10 min-w-10 shrink-0 items-center justify-center rounded-lg text-[var(--text-primary)] active:bg-[var(--bg-elevated)] md:hidden"
                  onClick={() => router.back()}
                  aria-label="Πίσω"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
              )}
              {!showBackMobile && (
                <button
                  type="button"
                  className="flex h-10 min-h-10 w-10 min-w-10 shrink-0 items-center justify-center rounded-lg text-[var(--text-primary)] active:bg-[var(--bg-elevated)] lg:hidden"
                  onClick={() => {
                    setMobileNavOpen((o) => !o);
                  }}
                  aria-label="Μενού"
                >
                  <Menu className="h-5 w-5" />
                </button>
              )}
              <div className="hidden min-w-0 flex-1 overflow-hidden md:block">
                <h1 className="hq-breadcrumb line-clamp-1 text-left text-base md:text-[18px]">{breadcrumbFor(pathname)}</h1>
              </div>
              <div className="min-w-0 flex-1 text-center md:hidden">
                <span className="line-clamp-1 break-words text-sm font-semibold text-[var(--text-primary)]">{pageTitle(pathname)}</span>
              </div>
            </div>
            <div className="box-border flex shrink-0 items-center gap-1 pl-1 sm:gap-2 sm:pl-2">
              <Link
                href="/contacts"
                className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--text-secondary)] transition hover:bg-[var(--bg-elevated)] hover:text-[var(--accent-gold)] sm:inline-flex"
                aria-label="Επαφές"
              >
                <Search className="h-[18px] w-[18px]" />
              </Link>
              {profile && (
                <span className="max-w-[8rem] shrink-0 truncate rounded-md border border-[var(--border)] bg-[var(--bg-elevated)]/80 px-2 py-0.5 text-[10px] font-medium text-[var(--accent-gold)] sm:max-w-none sm:px-2.5 sm:py-1 sm:text-xs">
                  {ROLE_BADGE[role]}
                </span>
              )}
              <ThemeToggle />
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-gradient-to-br from-[var(--accent-gold)]/30 to-[var(--accent-blue)]/40 text-[10px] font-bold text-white shadow-sm sm:text-xs"
                title={profile?.full_name ?? "Χρήστης"}
              >
                {profileLoading ? "—" : initials(profile?.full_name ?? null, "ΚΚ")}
              </div>
              <LogoutButton variant="icon" className="shrink-0" />
            </div>
          </div>
        </header>
        <main className="app-main-inner hq-fade-in-up main-scroll mobile-page-transition flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col touch-pan-y overflow-y-auto overflow-x-hidden bg-[var(--bg-primary)] p-3 max-lg:pb-24 max-lg:pt-2 sm:p-6 md:p-8">
          {children}
        </main>
        <AlexaMiniWindow />
        {alexVoiceToast && (
          <div
            className="pointer-events-none fixed bottom-6 left-1/2 z-[300] max-w-[min(100%,20rem)] -translate-x-1/2 rounded-full border border-[var(--border)] bg-[#0a1628]/95 px-5 py-2.5 text-center text-sm font-medium text-[var(--accent-gold)] shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-md"
            role="status"
            aria-live="polite"
          >
            Αλεξάνδρα ακούει…
          </div>
        )}
        <div className="max-md:hidden">
          <AiAssistantWidget />
        </div>
        <div className="lg:hidden">
          <MobileBottomNav role={role} onOpenMore={() => setMoreOpen(true)} openRequestsCount={openRequestsCount} />
        </div>
        <MobileMoreSheet
          open={moreOpen}
          onClose={() => setMoreOpen(false)}
          items={moreMenuItems as MoreNavItem[]}
          openRequestsCount={openRequestsCount}
          role={role}
        />
      </div>
    </div>
  );
}
