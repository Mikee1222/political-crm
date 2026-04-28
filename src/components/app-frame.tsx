"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  Calendar,
  CalendarDays,
  ChartColumnBig,
  CheckSquare,
  Cog,
  FileText,
  Map as MapIcon,
  Megaphone,
  NotebookText,
  PenLine,
  Search,
  Sparkles,
  Users,
  Wrench,
  BarChart3,
  QrCode,
  CalendarCheck,
  ChevronsDown,
  ChevronsLeft,
  ChevronsRight,
  Download,
  HeartHandshake,
  User,
  X,
  HelpCircle,
} from "lucide-react";
import { CrmSessionBootScreen } from "@/components/crm-session-boot-screen";
import { GlobalSearchOverlay } from "@/components/global-search-overlay";
import { SidebarNavSkeleton } from "@/components/sidebar-nav-skeleton";
import { KeyboardShortcutsModal } from "@/components/keyboard-shortcuts-modal";
import { AlexaMiniWindow } from "@/components/alexandra/alexa-mini-window";
import { FloatingActions } from "@/components/floating-actions";
import { LogoutButton } from "@/components/logout-button";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { MobileGlassHeader } from "@/components/mobile/mobile-glass-header";
import { MobilePullToRefresh } from "@/components/mobile/mobile-pull-to-refresh";
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
  { href: "/map", label: "Χάρτης", icon: MapIcon, minRole: "manager" },
  { href: "/requests", label: "Αιτήματα", icon: NotebookText, minRole: "manager", badge: "requests" },
  { href: "/campaigns", label: "Καμπάνιες", icon: Megaphone, minRole: "manager" },
  { href: "/events", label: "Εκδηλώσεις", icon: CalendarCheck, minRole: "manager" },
  { href: "/tasks", label: "Εργασίες", icon: CheckSquare, minRole: "manager" },
  { href: "/volunteers", label: "Εθελοντές", icon: HeartHandshake, minRole: "manager" },
  { href: "/analytics", label: "Αναλυτικά", icon: BarChart3, minRole: "manager" },
  { href: "/namedays", label: "Εορτολόγιο", icon: CalendarDays, minRole: "caller" },
  { href: "/schedule", label: "Πρόγραμμα", icon: Calendar, minRole: "manager" },
  { href: "/data-tools", label: "Εργαλεία", icon: Wrench, minRole: "manager" },
  { href: "/qrcode", label: "QR Code", icon: QrCode, minRole: "manager" },
  { href: "/polls", label: "Δημοσκοπήσεις", icon: BarChart3, minRole: "manager" },
  { href: "/documents", label: "Έγγραφα", icon: FileText, minRole: "manager" },
  { href: "/content", label: "Περιεχόμενο", icon: PenLine, minRole: "manager" },
  { href: "/settings", label: "Ρυθμίσεις", icon: Cog, minRole: "manager" },
];

const groupDefs: { id: string; label: string; hrefs: string[] }[] = [
  { id: "kyria", label: "ΚΥΡΙΑ", hrefs: ["/dashboard", "/contacts", "/map"] },
  { id: "politika", label: "ΠΟΛΙΤΙΚΑ", hrefs: ["/requests", "/campaigns", "/events"] },
  { id: "organosi", label: "ΟΡΓΑΝΩΣΗ", hrefs: ["/tasks", "/volunteers", "/analytics", "/namedays"] },
  { id: "ergaleia", label: "ΕΡΓΑΛΕΙΑ", hrefs: ["/schedule", "/data-tools", "/qrcode", "/polls", "/documents", "/content"] },
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
  if (pathname.startsWith("/map") || pathname.startsWith("/heatmap")) return "Χάρτης";
  if (pathname.startsWith("/namedays")) return "Εορτολόγιο";
  if (pathname.startsWith("/campaigns")) return "Καμπάνιες";
  if (pathname.startsWith("/events")) return "Εκδηλώσεις";
  if (pathname.startsWith("/volunteers")) return "Εθελοντές";
  if (pathname.startsWith("/analytics")) return "Αναλυτικά";
  if (pathname.startsWith("/requests")) return "Αιτήματα";
  if (pathname.startsWith("/tasks")) return "Εργασίες";
  if (pathname.startsWith("/schedule")) return "Πρόγραμμα";
  if (pathname.startsWith("/data-tools")) return "Εργαλεία δεδομένων";
  if (pathname.startsWith("/qrcode")) return "QR Code";
  if (pathname.startsWith("/polls")) return "Δημοσκοπήσεις";
  if (pathname.startsWith("/documents")) return "Έγγραφα";
  if (pathname.startsWith("/content")) return "Περιεχόμενο";
  if (pathname.startsWith("/settings")) return "Ρυθμίσεις";
  if (pathname.startsWith("/profile")) return "Προφίλ";
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
  "group flex h-12 max-h-12 shrink-0 items-center gap-3 rounded-[10px] border-l-2 border-transparent px-4 text-sm transition duration-200 ease-out";
const navItemInactive = [
  "text-gray-400",
  "[&>span]:text-gray-400",
  "hover:border-transparent hover:bg-white/4 hover:text-white hover:[&>span]:text-white",
].join(" ");
const navItemIconInactive = "text-gray-400/50 group-hover:text-white group-hover:opacity-100";
const navItemActive = [
  "border-[#C9A84C] bg-gradient-to-r from-amber-500/15 to-transparent",
  "!text-white [&>span]:!text-white font-semibold",
].join(" ");
const navItemIconActive = "text-amber-400";
const groupHeaderClass = "relative flex items-center gap-2 px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-amber-500/40 before:content-[''] before:h-px before:w-4 before:bg-amber-500/30";

const MOBILE_TAB_ORDER = ["/dashboard", "/contacts", "/requests", "/campaigns", "/alexandra"] as const;

function mainTabHrefsForRole(r: string | null | undefined): Set<string> {
  if (hasMinRole(r, "manager")) {
    return new Set(["/dashboard", "/contacts", "/alexandra", "/requests", "/campaigns"]);
  }
  return new Set(["/contacts", "/namedays", "/alexandra"]);
}

function mobilePrimaryTabRank(pathname: string): number {
  for (let i = 0; i < MOBILE_TAB_ORDER.length; i++) {
    const prefix = MOBILE_TAB_ORDER[i];
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return i;
    }
  }
  return -1;
}

function resolveItemsForGroup(hrefs: string[], role: string | null | undefined) {
  const out: NavItem[] = [];
  for (const h of hrefs) {
    const it = navItemByHref.get(h);
    if (it && hasMinRole(role, it.minRole)) out.push(it);
  }
  return out;
}

function flatOrderedNavItems(role: string | null | undefined) {
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
  role: string;
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
  role: string;
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
  role: string;
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
  role: string;
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
  const { profile, loading: profileLoading, sessionResolved } = useProfile();
  const isPortal = pathname === "/portal" || pathname.startsWith("/portal/");
  const isCrmLoginPublic = pathname === "/login";
  const [openRequestsCount, setOpenRequestsCount] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [alexVoiceToast, setAlexVoiceToast] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [avatarImgErr, setAvatarImgErr] = useState(false);
  const [mobileGlassHeaderHidden, setMobileGlassHeaderHidden] = useState(false);
  const [mobilePageEnter, setMobilePageEnter] = useState<"left" | "right" | "">("");
  const [installable, setInstallable] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [promptEvent, setPromptEvent] = useState<Event | null>(null);
  const [installBannerDismissed, setInstallBannerDismissed] = useState(false);
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const lastMainScrollY = useRef(0);
  const prevPathForMobileAnim = useRef<string | null>(null);
  const skipNextMobileRouteAnim = useRef(true);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const gNavTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gPendingRef = useRef(false);
  const isLg = useMediaQuery("(min-width: 1024px)", false);
  const [sidebarUserExpanded, setSidebarUserExpanded] = useState(true);
  const [groupState, setGroupState] = useState<Record<string, boolean>>({ ...DEFAULT_GROUP_STATE });

  useLayoutEffect(() => {
    if (isCrmLoginPublic || isPortal) return;
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
  }, [isCrmLoginPublic, isPortal]);

  const role = profile?.role ?? "caller";
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
    if (isLg) return;
    const prev = prevPathForMobileAnim.current;
    if (skipNextMobileRouteAnim.current) {
      skipNextMobileRouteAnim.current = false;
      prevPathForMobileAnim.current = pathname;
      setMobilePageEnter("");
      return;
    }
    if (prev == null) {
      prevPathForMobileAnim.current = pathname;
      setMobilePageEnter("");
      return;
    }
    const a = mobilePrimaryTabRank(prev);
    const b = mobilePrimaryTabRank(pathname);
    prevPathForMobileAnim.current = pathname;
    if (a < 0 || b < 0) {
      setMobilePageEnter("");
      return;
    }
    if (b > a) setMobilePageEnter("right");
    else if (b < a) setMobilePageEnter("left");
    else setMobilePageEnter("");
  }, [pathname, isLg]);

  useEffect(() => {
    setAvatarImgErr(false);
  }, [profile?.avatar_url]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(Boolean(standalone));
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e);
      setInstallable(true);
      setInstallBannerDismissed(false);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallable(false);
      setPromptEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt as EventListener);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt as EventListener);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const triggerInstallPrompt = useCallback(async () => {
    const ev = promptEvent as (Event & { prompt?: () => Promise<void>; userChoice?: Promise<{ outcome?: string }> }) | null;
    if (!ev?.prompt) return;
    await ev.prompt();
    try {
      const choice = await ev.userChoice;
      if (choice?.outcome === "accepted") {
        setInstallable(false);
      }
    } catch {
      // ignore
    }
  }, [promptEvent]);

  useEffect(() => {
    setMobileGlassHeaderHidden(false);
    if (mainScrollRef.current) {
      lastMainScrollY.current = mainScrollRef.current.scrollTop;
    }
  }, [pathname]);

  const onMainScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      if (isLg) return;
      const y = e.currentTarget.scrollTop;
      const d = y - lastMainScrollY.current;
      lastMainScrollY.current = y;
      if (y < 12) setMobileGlassHeaderHidden(false);
      else if (d > 10) setMobileGlassHeaderHidden(true);
      else if (d < -10) setMobileGlassHeaderHidden(false);
    },
    [isLg],
  );

  const mobileFirstName = profile?.full_name?.trim().split(/\s+/).filter(Boolean)[0] ?? "Φίλε";
  const pullRefreshEnabled = !isLg && (pathname.startsWith("/contacts") || pathname.startsWith("/requests"));

  useEffect(() => {
    if (!userMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [userMenuOpen]);

  useEffect(() => {
    if (isCrmLoginPublic || isPortal) return;
    if (typeof document === "undefined") return;
    if (!isLg && mobileNavOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [isLg, mobileNavOpen, isCrmLoginPublic, isPortal]);

  const inputLike = (t: EventTarget | null) => {
    if (!t || !(t instanceof Element)) {
      return false;
    }
    return Boolean(t.closest("input,textarea,select,[contenteditable]"));
  };

  useEffect(() => {
    if (isCrmLoginPublic || isPortal) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (hasMinRole(role, "manager")) {
          setSearchOpen(true);
        }
        return;
      }
      if (e.key === "n" && (e.metaKey || e.ctrlKey) && hasMinRole(role, "manager") && pathname.startsWith("/contacts") && !inputLike(e.target)) {
        e.preventDefault();
        router.push("/contacts?new=1");
        return;
      }
      if (e.key === "/" && (e.metaKey || e.ctrlKey) && !inputLike(e.target)) {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
        setShortcutsOpen(false);
        return;
      }
      if (e.key.toLowerCase() === "a" && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        if (!hasMinRole(role, "caller")) {
          return;
        }
        window.dispatchEvent(new Event("alexandra-voice-shortcut"));
        setAlexVoiceToast(true);
        window.setTimeout(() => setAlexVoiceToast(false), 2600);
        return;
      }
      if (inputLike(e.target)) {
        return;
      }
      if (e.key === "g" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        gPendingRef.current = true;
        if (gNavTimerRef.current) {
          clearTimeout(gNavTimerRef.current);
        }
        gNavTimerRef.current = setTimeout(() => {
          gPendingRef.current = false;
        }, 1000);
        return;
      }
      if (gPendingRef.current && e.key.length === 1) {
        gPendingRef.current = false;
        if (gNavTimerRef.current) {
          clearTimeout(gNavTimerRef.current);
          gNavTimerRef.current = null;
        }
        if (!hasMinRole(role, "manager")) {
          return;
        }
        const c = e.key.toLowerCase();
        if (c === "d") {
          e.preventDefault();
          router.push("/dashboard");
        } else if (c === "c") {
          e.preventDefault();
          router.push("/contacts");
        } else if (c === "r") {
          e.preventDefault();
          router.push("/requests");
        } else if (c === "a") {
          e.preventDefault();
          router.push("/alexandra");
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      if (gNavTimerRef.current) {
        clearTimeout(gNavTimerRef.current);
      }
      window.removeEventListener("keydown", onKey);
    };
  }, [isCrmLoginPublic, isPortal, role, router, pathname]);

  useEffect(() => {
    if (isCrmLoginPublic || isPortal) return;
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
  }, [isCrmLoginPublic, isPortal, role]);

  const pinBottom = (opts: { onNavigate?: () => void; showLabels: boolean }) => (
    <div className="mt-auto space-y-0.5 border-t border-[var(--border)]/40 pt-1.5">
      <button
        type="button"
        onClick={() => setShortcutsOpen(true)}
        className={[
          "group flex h-10 w-full max-w-full shrink-0 items-center gap-2 rounded-lg pl-1.5 pr-2 text-left text-sm text-[var(--nav-ink)] transition hover:bg-[var(--nav-item-hover-bg)]",
          !opts.showLabels && "min-w-0 justify-center pl-0 pr-0",
        ].join(" ")}
        title="Συντομεύσεις"
        aria-label="Βοήθεια συντομεύσεων"
      >
        <HelpCircle className="h-5 w-5 shrink-0 text-[var(--nav-icon-inactive)] group-hover:text-[var(--nav-icon-hover)]" />
        {opts.showLabels && <span className="text-[14px] font-medium">Βοήθεια</span>}
      </button>
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

  if (isCrmLoginPublic || isPortal) {
    return <>{children}</>;
  }

  if (!sessionResolved) {
    return <CrmSessionBootScreen />;
  }

  const showSidebarNavSkeleton = profileLoading;

  return (
    <div
      className="min-h-[-webkit-fill-available] min-h-screen min-h-[100dvh] w-screen max-w-screen min-w-0 overflow-x-hidden bg-[#080D1A]"
      style={shellStyle}
    >
      <aside
        className="app-sidebar app-sidebar--rail fixed left-0 top-0 z-30 hidden h-screen max-w-full flex-col overflow-hidden border-r border-[var(--border)] px-2 py-3 pb-2 lg:flex"
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
          {showSidebarNavSkeleton ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <SidebarNavSkeleton rows={10} />
            </div>
          ) : (
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
          )}
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
            className="fixed inset-0 z-40 [background:var(--overlay-scrim)] backdrop-blur-[2px]"
            aria-label="Κλείσιμο μενού"
            onClick={() => setMobileNavOpen(false)}
          />
          <div
            className="fixed left-0 top-0 z-[45] box-border h-full w-[min(100vw,280px)] max-w-full overflow-y-auto border-r border-amber-500/15 bg-[#080D1A] p-3 shadow-[0_0_32px_rgba(0,0,0,0.45)]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.035) 1px, transparent 0), linear-gradient(to bottom, rgba(255,255,255,0.015), transparent)",
              backgroundSize: "3px 3px, 100% 100%",
            }}
            role="dialog"
            aria-modal
            aria-label="Μενού πλοήγησης"
          >
            <div className="mb-2 flex w-full min-w-0 items-center justify-between pl-0.5">
              <div className="flex min-w-0 items-center gap-2">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-amber-500/50 text-sm font-bold text-white"
                  style={{ background: "linear-gradient(145deg, #c9a84c 0%, #8b6914 100%)" }}
                >
                  ΚΚ
                </div>
                <div className="min-w-0">
                  <p className="min-w-0 text-sm font-semibold text-white">Καραγκούνης</p>
                  <p className="text-[10px] uppercase tracking-widest text-amber-400/60">Πολιτικό Γραφείο</p>
                </div>
              </div>
              <button
                type="button"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-500 transition hover:bg-white/8 hover:text-white"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Κλείσιμο"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mb-2 h-px bg-gradient-to-r from-transparent via-amber-500/70 to-transparent" />
            {showSidebarNavSkeleton ? (
              <SidebarNavSkeleton rows={10} />
            ) : (
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
            )}
            <div className="mt-3 h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
            <p className="pb-4 pt-2 text-center text-[10px] text-gray-600">v1.0 · Καραγκούνης CRM</p>
          </div>
        </>
      )}

      <div className="app-main-shell ml-0 box-border flex min-h-0 min-w-0 w-full max-w-full flex-1 min-h-[-webkit-fill-available] min-h-screen flex-col overflow-x-hidden pl-0 lg:ml-[var(--sidebar-width)] lg:h-screen lg:min-h-0 lg:overflow-hidden">
        <header className="mobile-top-bar sticky top-0 z-20 box-border min-h-0 w-full min-w-0 max-w-full shrink-0 border-b border-[var(--border)] pt-0 backdrop-blur-lg lg:[background:var(--topbar-bg)]">
          <MobileGlassHeader
            firstName={mobileFirstName}
            avatarUrl={profile?.avatar_url}
            avatarFallback={initials(profile?.full_name ?? null, "ΚΚ")}
            avatarImgErr={avatarImgErr}
            onAvatarImgError={() => setAvatarImgErr(true)}
            showBack={showBackMobile}
            onBack={() => router.back()}
            mobileNavOpen={mobileNavOpen}
            onToggleMenu={() => setMobileNavOpen((o) => !o)}
            canGlobalSearch={hasMinRole(role, "manager")}
            onOpenSearch={() => setSearchOpen(true)}
            requestsHref={hasMinRole(role, "manager") ? "/requests" : undefined}
            hidden={mobileGlassHeaderHidden}
            canInstall={installable && !installed}
            onInstallClick={() => void triggerInstallPrompt()}
          />
          <div className="hidden h-[60px] w-full min-w-0 max-w-full items-center justify-between gap-2 px-6 lg:flex lg:px-8">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <div className="min-w-0 flex-1 overflow-hidden">
                <h1 className="hq-breadcrumb line-clamp-1 text-left text-[18px]">{breadcrumbFor(pathname)}</h1>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 pl-2">
              {hasMinRole(role, "manager") ? (
                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--text-secondary)] transition hover:bg-[var(--bg-elevated)] hover:text-[var(--accent-gold)]"
                  aria-label="Καθολική αναζήτηση"
                  title="Αναζήτηση (⌘K)"
                >
                  <Search className="h-[18px] w-[18px]" />
                </button>
              ) : (
                <Link
                  href="/contacts"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--text-secondary)] transition hover:bg-[var(--bg-elevated)] hover:text-[var(--accent-gold)]"
                  aria-label="Επαφές"
                >
                  <Search className="h-[18px] w-[18px]" />
                </Link>
              )}
              {profile && (
                <span className="max-w-none shrink-0 truncate rounded-md border border-[var(--border)] bg-[var(--bg-elevated)]/80 px-2.5 py-1 text-xs font-medium text-[var(--accent-gold)]">
                  {role in ROLE_BADGE ? ROLE_BADGE[role as Role] : role}
                </span>
              )}
              <ThemeToggle />
              {installable && !installed ? (
                <button
                  type="button"
                  onClick={() => void triggerInstallPrompt()}
                  className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md border border-[var(--accent-gold)]/45 bg-[color-mix(in_srgb,var(--accent-gold)_18%,var(--bg-elevated))] px-2.5 text-xs font-bold text-[var(--text-primary)]"
                  title="Εγκατάσταση εφαρμογής"
                >
                  Εγκατάσταση ↓
                </button>
              ) : null}
              <div className="relative shrink-0" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((o) => !o)}
                  className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-gradient-to-br from-[var(--accent-gold)]/30 to-[var(--accent-blue)]/40 text-[10px] font-bold text-white shadow-sm sm:text-xs"
                  title={profile?.full_name ?? "Χρήστης"}
                  aria-expanded={userMenuOpen}
                  aria-haspopup="menu"
                >
                  {profileLoading ? (
                    "—"
                  ) : profile?.avatar_url && !avatarImgErr ? (
                    // eslint-disable-next-line @next/next/no-img-element -- dynamic user URL from Supabase
                    <img
                      src={profile.avatar_url}
                      alt=""
                      className="h-full w-full object-cover"
                      onError={() => setAvatarImgErr(true)}
                    />
                  ) : (
                    initials(profile?.full_name ?? null, "ΚΚ")
                  )}
                </button>
                {userMenuOpen && (
                  <div
                    className="absolute right-0 top-full z-[250] mt-1.5 min-w-[14rem] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] py-1.5 shadow-xl"
                    role="menu"
                  >
                    <Link
                      href="/profile"
                      className="flex items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-elevated)]"
                      onClick={() => setUserMenuOpen(false)}
                      role="menuitem"
                    >
                      <User className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" aria-hidden />
                      Το προφίλ μου
                    </Link>
                  </div>
                )}
              </div>
              <LogoutButton variant="icon" className="shrink-0" />
            </div>
          </div>
        </header>
        <main
          ref={mainScrollRef}
          onScroll={onMainScroll}
          className="app-main-inner hq-fade-in-up main-scroll mobile-page-transition flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col touch-pan-y overflow-y-auto overflow-x-hidden bg-[var(--bg-primary)] max-lg:mx-0 max-lg:px-0 pt-3 sm:pt-6 max-lg:pb-[calc(7.5rem+env(safe-area-inset-bottom,0px))] lg:px-8 lg:pt-8 lg:pb-[max(2rem,env(safe-area-inset-bottom,0px))]"
        >
          {installable && !installed && !installBannerDismissed ? (
            <div className="mb-3 flex w-full max-w-full flex-col gap-2 rounded-xl border border-[color-mix(in_srgb,var(--accent-gold)_45%,var(--border))] bg-[color-mix(in_srgb,var(--accent-gold)_12%,var(--bg-card))] px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="min-w-0 text-sm font-semibold text-[var(--text-primary)]">Εγκαταστήστε το Καραγκούνης CRM</p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void triggerInstallPrompt()}
                  className="inline-flex items-center gap-1 rounded-md bg-[var(--accent-gold)] px-2.5 py-1.5 text-xs font-bold text-[var(--text-badge-on-gold)]"
                >
                  <Download className="h-3.5 w-3.5" />
                  Install
                </button>
                <button
                  type="button"
                  onClick={() => setInstallBannerDismissed(true)}
                  className="rounded px-1 text-sm font-bold text-[var(--text-muted)]"
                  aria-label="Κλείσιμο"
                >
                  ×
                </button>
              </div>
            </div>
          ) : null}
          <MobilePullToRefresh enabled={pullRefreshEnabled} />
          <div
            key={pathname}
            data-page-enter={mobilePageEnter || undefined}
            className="hq-mobile-route-shell flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col"
          >
            {children}
          </div>
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
        <FloatingActions role={role} />
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
        <GlobalSearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} role={role} />
        <KeyboardShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      </div>
    </div>
  );
}
