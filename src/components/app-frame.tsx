"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import {
  Calendar,
  CalendarClock,
  CalendarDays,
  ChartColumnBig,
  CheckSquare,
  Cog,
  FileText,
  Map as MapIcon,
  Megaphone,
  NotebookText,
  PenLine,
  FileSearch,
  Search,
  Sparkles,
  UserSearch,
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
import { CRMTour } from "@/components/crm-tour";
import { useAlexandraChat } from "@/components/alexandra/alexandra-chat-provider";
import { GlobalSearchOverlay } from "@/components/global-search-overlay";
import { SidebarNavSkeleton } from "@/components/sidebar-nav-skeleton";
import { KeyboardShortcutsModal } from "@/components/keyboard-shortcuts-modal";
import { AlexaMiniWindow } from "@/components/alexandra/alexa-mini-window";
import { FloatingActions } from "@/components/floating-actions";
import { LogoutButton } from "@/components/logout-button";
import { ContactTabsBar } from "@/components/contact-tabs-bar";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { MobileGlassHeader } from "@/components/mobile/mobile-glass-header";
import { MobilePullToRefresh } from "@/components/mobile/mobile-pull-to-refresh";
import { MobileMoreSheet, type MoreNavItem } from "@/components/mobile-more-sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import { PortalDropdownPanel, usePortalDropdown } from "@/components/ui/portal-dropdown";
import { useProfile, type Profile } from "@/contexts/profile-context";
import { useTour, type TourId } from "@/contexts/tour-context";
import { useMediaQuery } from "@/hooks/use-media-query";
import { can } from "@/lib/can";
import { fetchWithTimeout } from "@/lib/client-fetch";
import type { PermissionKey } from "@/lib/permissions";
import { hasMinRole, ROLE_BADGE, type Role } from "@/lib/roles";
import type { LucideIcon } from "lucide-react";
import { normalizeRequestStatus, REQUEST_STATUS_OPEN } from "@/lib/request-statuses";

const STORAGE_SIDEBAR = "crm-sidebar-expanded";
const STORAGE_NAV_GROUPS = "crm-nav-groups";

type NavItem = { href: string; label: string; icon: LucideIcon; minRole: Role; subOf?: string };

const NAV_CONFIG: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: ChartColumnBig, minRole: "manager" },
  { href: "/contacts", label: "Επαφές", icon: Users, minRole: "caller" },
  { href: "/contacts/search", label: "Αναζήτηση Επαφών", icon: UserSearch, minRole: "caller", subOf: "/contacts" },
  { href: "/map", label: "Χάρτης", icon: MapIcon, minRole: "manager" },
  { href: "/requests", label: "Αιτήματα", icon: NotebookText, minRole: "manager" },
  { href: "/requests/search", label: "Αναζήτηση Αιτημάτων", icon: FileSearch, minRole: "manager", subOf: "/requests" },
  { href: "/requests-scheduler", label: "Πρόγραμμα Αιτημάτων", icon: CalendarClock, minRole: "manager" },
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
  { id: "kyria", label: "ΚΥΡΙΑ", hrefs: ["/dashboard", "/contacts", "/contacts/search", "/map"] },
  {
    id: "politika",
    label: "ΠΟΛΙΤΙΚΑ",
    hrefs: ["/requests", "/requests/search", "/requests-scheduler", "/campaigns", "/events"],
  },
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

const NAV_PERMISSION_BY_HREF: Partial<Record<string, PermissionKey>> = {
  "/contacts": "contacts_view",
  "/contacts/search": "contacts_view",
  "/requests": "requests_view",
  "/requests/search": "requests_view",
  "/requests-scheduler": "requests_scheduler_view",
  "/campaigns": "campaigns_view",
  "/events": "events_view",
  "/tasks": "tasks_view",
  "/volunteers": "volunteers_view",
  "/analytics": "analytics_view",
  "/polls": "polls_view",
  "/documents": "documents_view",
  "/data-tools": "data_tools_view",
  "/settings": "settings_view",
};

function navItemAllowed(profile: Profile | null, item: NavItem): boolean {
  const perm = NAV_PERMISSION_BY_HREF[item.href];
  if (perm) return can(profile, perm);
  return hasMinRole(profile?.role, item.minRole, profile?.access_tier);
}

function pageTitle(pathname: string) {
  if (pathname.startsWith("/dashboard")) return "Dashboard";
  if (pathname.startsWith("/contacts/search")) return "Αναζήτηση Επαφών";
  if (pathname.startsWith("/contacts")) return "Επαφές";
  if (pathname.startsWith("/map") || pathname.startsWith("/heatmap")) return "Χάρτης";
  if (pathname.startsWith("/namedays")) return "Εορτολόγιο";
  if (pathname.startsWith("/campaigns")) return "Καμπάνιες";
  if (pathname.startsWith("/events")) return "Εκδηλώσεις";
  if (pathname.startsWith("/volunteers")) return "Εθελοντές";
  if (pathname.startsWith("/analytics")) return "Αναλυτικά";
  if (pathname.startsWith("/requests-scheduler")) return "Πρόγραμμα Αιτημάτων";
  if (pathname.startsWith("/requests/search")) return "Αναζήτηση Αιτημάτων";
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
  "group flex h-11 max-h-11 shrink-0 items-center gap-3 rounded-lg px-3 text-sm transition-colors duration-200 ease-out";
const navItemInactive = [
  "text-[var(--nav-ink)]",
  "[&>span]:text-[var(--nav-ink)]",
  "hover:bg-[var(--nav-item-hover-bg)] hover:text-[var(--nav-ink-hover)] hover:[&>span]:text-[var(--nav-ink-hover)]",
].join(" ");
const navItemIconInactive =
  "text-[var(--nav-icon-inactive)] group-hover:text-[var(--nav-icon-hover)]";
const navItemActive = [
  "bg-[var(--nav-item-active-bg)]",
  "!text-[var(--nav-item-active-fg)] [&>span]:!text-[var(--nav-item-active-fg)] font-medium",
].join(" ");
const navItemIconActive = "text-[var(--nav-icon-active)]";
const groupHeaderClass =
  "flex items-center gap-2 px-1 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent-gold)]/55 before:content-[''] before:h-px before:w-3 before:shrink-0 before:bg-[var(--accent-gold)]/35";

const MOBILE_TAB_ORDER = ["/dashboard", "/contacts", "/requests", "/campaigns", "/alexandra"] as const;

function mainTabHrefsForProfile(profile: Profile | null): Set<string> {
  if (hasMinRole(profile?.role, "manager", profile?.access_tier)) {
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

function resolveItemsForGroup(hrefs: string[], profile: Profile | null) {
  const out: NavItem[] = [];
  for (const h of hrefs) {
    const it = navItemByHref.get(h);
    if (it && navItemAllowed(profile, it)) out.push(it);
  }
  return out;
}

function flatOrderedNavItems(profile: Profile | null) {
  const all: NavItem[] = [];
  for (const g of groupDefs) {
    for (const it of resolveItemsForGroup(g.hrefs, profile)) all.push(it);
  }
  if (navItemAllowed(profile, settingsItem)) all.push(settingsItem);
  return all;
}

function navDataTour(href: string): string | undefined {
  if (href === "/contacts") return "nav-contacts";
  if (href === "/requests") return "nav-requests";
  return undefined;
}

function NavItemRow({
  item,
  pathname,
  onNavigate,
  showLabels,
  dataTour,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
  showLabels: boolean;
  dataTour?: string;
}) {
  const Icon = item.icon;
  const isSub = Boolean(item.subOf);
  const active =
    pathname === item.href ||
    (pathname.startsWith(`${item.href}/`) &&
      !(item.href === "/contacts" && pathname.startsWith("/contacts/search")) &&
      !(item.href === "/requests" && pathname.startsWith("/requests/search")));
  return (
    <a
      href={item.href}
      onClick={onNavigate}
      data-tour={dataTour}
      className={[
        navItemBase,
        isSub && showLabels && "ml-3 h-9 max-h-9 gap-2.5 pl-2",
        isSub && !showLabels && "h-9 max-h-9",
        !showLabels && "min-w-0 justify-center px-0",
        active ? navItemActive : navItemInactive,
        isSub && !active && "text-[var(--nav-ink)]/80 [&>span]:text-[var(--nav-ink)]/80",
      ].join(" ")}
      title={!showLabels ? item.label : undefined}
    >
      <Icon
        className={[
          "shrink-0 transition-colors duration-200 ease-out",
          isSub ? "h-4 w-4" : "h-5 w-5",
          active ? navItemIconActive : navItemIconInactive,
        ].join(" ")}
      />
      {showLabels && (
        <span className={["min-w-0 flex-1 truncate", isSub ? "text-[13px] font-normal" : "text-sm font-medium"].join(" ")}>
          {item.label}
        </span>
      )}
    </a>
  );
}

function AlexandraRow({
  profile,
  pathname,
  onNavigate,
  showLabels,
}: {
  profile: Profile | null;
  pathname: string;
  onNavigate?: () => void;
  showLabels: boolean;
}) {
  if (!can(profile, "alexandra_use")) {
    return null;
  }
  return (
    <Link
      href="/alexandra"
      onClick={onNavigate}
      data-tour="alexandra-button"
      className={[
        navItemBase,
        "mt-1",
        !showLabels && "justify-center px-0",
        pathname.startsWith("/alexandra") ? navItemActive : navItemInactive,
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
            "flex min-w-0 flex-1 items-center justify-between gap-1.5 text-sm font-medium",
            pathname.startsWith("/alexandra")
              ? "text-[var(--nav-item-active-fg)]"
              : "text-[var(--nav-ink)]",
          ].join(" ")}
        >
          <span>Αλεξάνδρα</span>
          <span className="shrink-0 rounded px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-[var(--accent-gold)]/80">
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
  profile,
  onNavigate,
  showLabels,
  showGroupHeaders,
}: {
  group: (typeof groupDefs)[number];
  groupOpen: boolean;
  onToggleGroup: () => void;
  pathname: string;
  profile: Profile | null;
  onNavigate?: () => void;
  showLabels: boolean;
  showGroupHeaders: boolean;
}) {
  const items = resolveItemsForGroup(group.hrefs, profile);
  if (items.length === 0) return null;

  if (showGroupHeaders) {
    return (
      <div className="mb-3">
        <button
          type="button"
          onClick={onToggleGroup}
          className="flex w-full min-w-0 items-center justify-between gap-1 rounded-md px-0.5 py-0.5 text-left transition hover:opacity-90"
        >
          <span className={groupHeaderClass}>{group.label}</span>
          <ChevronsDown
            className={["h-3 w-3 shrink-0 text-[var(--accent-gold)]/40 transition", groupOpen ? "rotate-0" : "rotate-[-90deg]"].join(" ")}
            aria-hidden
          />
        </button>
        {groupOpen && (
          <div className="mt-1 flex flex-col gap-1">
            {items.map((item) => (
              <NavItemRow
                key={item.href}
                item={item}
                pathname={pathname}
                onNavigate={onNavigate}
                showLabels={showLabels}
                dataTour={navDataTour(item.href)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="mb-1 flex flex-col gap-1">
      {items.map((item) => (
        <NavItemRow
          key={item.href}
          item={item}
          pathname={pathname}
          onNavigate={onNavigate}
          showLabels={showLabels}
          dataTour={navDataTour(item.href)}
        />
      ))}
    </div>
  );
}

type SidebarContentProps = {
  pathname: string;
  profile: Profile | null;
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
  profile,
  onNavigate,
  showLabels,
  showGroupHeaders,
  groupState,
  onToggleGroup,
  pinBottom,
  flatRail,
}: SidebarContentProps) {
  if (flatRail) {
    const order = flatOrderedNavItems(profile).filter((it) => it.href !== "/settings");
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]">
          {order.map((item) => (
            <NavItemRow
              key={item.href}
              item={item}
              pathname={pathname}
              onNavigate={onNavigate}
              showLabels={false}
              dataTour={navDataTour(item.href)}
            />
          ))}
        </div>
        {pinBottom}
      </div>
    );
  }
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]">
        {groupDefs.map((g) => (
          <GroupBlock
            key={g.id}
            group={g}
            groupOpen={groupState[g.id] !== false}
            onToggleGroup={() => onToggleGroup(g.id)}
            pathname={pathname}
            profile={profile}
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
  const { activeTour, setActiveTour, completeTour } = useTour();
  const { openMiniFromBubble, startWithChip } = useAlexandraChat();
  const isPortal = pathname === "/portal" || pathname.startsWith("/portal/");
  const isCrmLoginPublic = pathname === "/login" || pathname === "/enter-code";
  const [openRequestsCount, setOpenRequestsCount] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [alexVoiceToast, setAlexVoiceToast] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const helpRef = useRef<HTMLDivElement>(null);
  const userMenu = usePortalDropdown({ align: "right", minWidth: 224 });
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
  const accessTier = profile?.access_tier;
  const depth = pathname.split("/").filter(Boolean).length;
  const showBackMobile = depth >= 2;

  const moreMenuItems: MoreNavItem[] = useMemo(() => {
    const main = mainTabHrefsForProfile(profile);
    return NAV_CONFIG.filter((i) => navItemAllowed(profile, i) && !main.has(i.href));
  }, [profile]);

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
    if (!helpOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (helpRef.current && !helpRef.current.contains(e.target as Node)) {
        setHelpOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [helpOpen]);

  const startHelpTour = useCallback(
    (tourId: TourId) => {
      setHelpOpen(false);
      setActiveTour(tourId);
    },
    [setActiveTour],
  );

  const askAlexandraForHelp = useCallback(() => {
    setHelpOpen(false);
    openMiniFromBubble();
    void startWithChip("Χρειάζομαι βοήθεια");
  }, [openMiniFromBubble, startWithChip]);

  useEffect(() => {
    if (isPortal || isCrmLoginPublic) return;
    if (!sessionResolved || profileLoading || !profile) return;
    if (profile.role === "admin") return;

    let cancelled = false;
    void fetchWithTimeout("/api/access-code/check")
      .then((r) => r.json())
      .then((data: { granted?: boolean }) => {
        if (cancelled) return;
        if (!data.granted) {
          router.push(`/enter-code?next=${encodeURIComponent(pathname)}`);
        }
      })
      .catch(() => {
        if (!cancelled) {
          router.push(`/enter-code?next=${encodeURIComponent(pathname)}`);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [profile, profileLoading, sessionResolved, pathname, router, isPortal, isCrmLoginPublic]);

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
        if (can(profile, "contacts_view")) {
          setSearchOpen(true);
        }
        return;
      }
      if (e.key === "n" && (e.metaKey || e.ctrlKey) && can(profile, "contacts_create") && pathname.startsWith("/contacts") && !inputLike(e.target)) {
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
        if (!can(profile, "alexandra_use")) {
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
        if (!hasMinRole(role, "manager", accessTier)) {
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
  }, [isCrmLoginPublic, isPortal, profile, role, accessTier, router, pathname]);

  useEffect(() => {
    if (isCrmLoginPublic || isPortal) return;
    if (!can(profile, "requests_view")) {
      return;
    }
    fetchWithTimeout("/api/requests")
      .then((res) => res.json())
      .then((data) => {
        const rows = Array.isArray(data.requests) ? data.requests : [];
        const count = rows.filter((r: { status?: string }) => {
          return normalizeRequestStatus(r.status ?? null) === REQUEST_STATUS_OPEN;
        }).length;
        setOpenRequestsCount(count);
      })
      .catch(() => setOpenRequestsCount(0));
  }, [isCrmLoginPublic, isPortal, profile]);

  const pinBottom = (opts: { onNavigate?: () => void; showLabels: boolean }) => (
    <div className="mt-auto space-y-1 border-t border-[var(--border)]/30 pt-2">
      <button
        type="button"
        onClick={() => setShortcutsOpen(true)}
        className={[
          "group flex h-11 w-full max-w-full shrink-0 items-center gap-3 rounded-lg px-3 text-left text-sm text-[var(--nav-ink)] transition-colors hover:bg-[var(--nav-item-hover-bg)] hover:text-[var(--nav-ink-hover)]",
          !opts.showLabels && "min-w-0 justify-center px-0",
        ].join(" ")}
        title="Συντομεύσεις"
        aria-label="Βοήθεια συντομεύσεων"
      >
        <HelpCircle className="h-5 w-5 shrink-0 text-[var(--nav-icon-inactive)] group-hover:text-[var(--nav-icon-hover)]" />
        {opts.showLabels && <span className="text-[14px] font-medium">Βοήθεια</span>}
      </button>
      {navItemAllowed(profile, settingsItem) && (
        <NavItemRow
          item={settingsItem}
          pathname={pathname}
          onNavigate={opts.onNavigate}
          showLabels={opts.showLabels}
        />
      )}
      <AlexandraRow
        profile={profile}
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
      className="crm-app-frame flex min-h-[-webkit-fill-available] min-h-screen min-h-[100dvh] w-full min-w-full max-w-none flex-col overflow-x-hidden bg-background"
      style={shellStyle}
    >
      <aside
        className="crm-sidebar app-sidebar app-sidebar--rail fixed left-0 top-0 z-30 flex h-screen max-w-full flex-col overflow-hidden border-r border-[var(--border)]/50 px-3 py-4 pb-3 max-lg:hidden"
        style={{ background: "var(--sidebar-bg)" }}
        aria-label="Πλοήγηση"
        data-tour="sidebar"
      >
        <div
          className={[
            "mb-4 flex w-full min-w-0 items-center",
            showDesktopWideNav ? "justify-start pl-0.5" : "justify-center",
          ].join(" ")}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[var(--accent-gold)]/50 text-sm font-bold text-[var(--text-badge-on-gold)]"
              style={{ background: "linear-gradient(145deg, #c9a84c 0%, #8b6914 100%)" }}
            >
              ΚΚ
            </div>
            {showDesktopWideNav && (
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-tight text-[var(--sidebar-brand-title)]">Καραγκούνης</p>
                <p className="mt-0.5 text-[10px] font-medium uppercase leading-tight tracking-widest text-[var(--sidebar-tagline)]">
                  Πολιτικό Γραφείο
                </p>
              </div>
            )}
          </div>
        </div>
        <div className="relative z-10 mb-3 h-px flex-shrink-0 bg-gradient-to-r from-transparent via-[var(--accent-gold)]/50 to-transparent" />

        <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col">
          <a href="/contacts" style={{display:'block', padding:'10px', background:'red', color:'white', zIndex:9999}}>
            TEST LINK
          </a>
          {showSidebarNavSkeleton ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <SidebarNavSkeleton rows={10} />
            </div>
          ) : (
            <SidebarContent
              pathname={pathname}
              profile={profile}
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

        <div className="relative z-10 mt-auto flex w-full flex-shrink-0 border-t border-[var(--border)]/30 pt-2">
          <button
            type="button"
            onClick={onSidebarToggle}
            className="mx-auto flex h-10 w-full min-w-0 max-w-full items-center justify-center rounded-lg text-[var(--nav-ink)] transition-colors hover:bg-[var(--nav-item-hover-bg)] hover:text-[var(--nav-ink-hover)]"
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
            className="fixed inset-y-0 left-0 z-[45] box-border w-full max-w-full overflow-y-auto border-r border-border bg-[var(--sidebar-bg)] p-3 shadow-[var(--card-shadow)] sm:max-w-[min(100vw,320px)]"
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
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[var(--accent-gold)]/50 text-sm font-bold text-[var(--text-badge-on-gold)]"
                  style={{ background: "linear-gradient(145deg, #c9a84c 0%, #8b6914 100%)" }}
                >
                  ΚΚ
                </div>
                <div className="min-w-0">
                  <p className="min-w-0 text-sm font-semibold text-[var(--sidebar-brand-title)]">Καραγκούνης</p>
                  <p className="text-[10px] uppercase tracking-widest text-[var(--sidebar-tagline)]">Πολιτικό Γραφείο</p>
                </div>
              </div>
              <button
                type="button"
                className="flex h-11 min-h-[44px] w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-[var(--nav-item-hover-bg)] hover:text-[var(--nav-ink-hover)]"
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
                profile={profile}
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
            <p className="pb-4 pt-2 text-center text-[10px] text-muted-foreground">v1.0 · Καραγκούνης CRM</p>
          </div>
        </>
      )}

      <div className="app-main-shell ml-0 box-border flex min-h-0 min-w-0 w-full max-w-full flex-1 min-h-[-webkit-fill-available] min-h-screen flex-col overflow-x-hidden pl-0 lg:ml-[var(--sidebar-width)] lg:h-screen lg:min-h-0 lg:overflow-hidden">
        <header className="crm-navbar mobile-top-bar sticky top-0 z-20 box-border min-h-0 w-full min-w-0 max-w-full shrink-0 border-b border-border bg-background pt-0 backdrop-blur-lg lg:[background:var(--topbar-bg)]">
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
            canGlobalSearch={can(profile, "contacts_view")}
            onOpenSearch={() => setSearchOpen(true)}
            requestsHref={can(profile, "requests_view") ? "/requests" : undefined}
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
              {can(profile, "contacts_view") ? (
                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  data-tour="search-button"
                  className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border)]/60 px-2.5 text-[var(--text-secondary)] transition hover:bg-[var(--bg-elevated)] hover:text-[var(--accent-gold)]"
                  aria-label="Καθολική αναζήτηση"
                  title="Αναζήτηση (⌘K)"
                >
                  <Search className="h-[18px] w-[18px]" />
                  <kbd className="hidden text-[10px] font-medium text-[var(--text-muted)] sm:inline">⌘K</kbd>
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
              <div className="relative shrink-0">
                <button
                  type="button"
                  ref={userMenu.triggerRef as RefObject<HTMLButtonElement>}
                  onClick={userMenu.toggle}
                  className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-border bg-gradient-to-br from-[var(--accent-gold)]/30 to-[var(--accent-blue)]/40 text-[10px] font-bold text-foreground shadow-sm sm:text-xs"
                  title={profile?.full_name ?? "Χρήστης"}
                  aria-expanded={userMenu.open}
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
                <PortalDropdownPanel
                  open={userMenu.open}
                  pos={userMenu.pos}
                  panelRef={userMenu.panelRef}
                  role="menu"
                  className="overflow-hidden rounded-xl border border-border bg-background py-1.5 shadow-xl"
                >
                  <Link
                    href="/profile"
                    className="flex items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-accent"
                    onClick={() => userMenu.setOpen(false)}
                    role="menuitem"
                  >
                    <User className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" aria-hidden />
                    Το προφίλ μου
                  </Link>
                </PortalDropdownPanel>
              </div>
              <LogoutButton variant="icon" className="shrink-0" />
            </div>
          </div>
        </header>
        <ContactTabsBar />
        <main
          ref={mainScrollRef}
          onScroll={onMainScroll}
          className="app-main-inner hq-fade-in-up main-scroll mobile-page-transition flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col touch-pan-y overflow-y-auto overflow-x-hidden bg-[var(--bg-primary)] max-lg:mx-0 p-0 max-lg:pt-0 sm:p-6 md:p-8 max-lg:pb-[calc(7.5rem+env(safe-area-inset-bottom,0px))] lg:px-8 lg:pt-8 lg:pb-[max(2rem,env(safe-area-inset-bottom,0px))]"
        >
          {installable && !installed && !installBannerDismissed ? (
            <div className="mb-3 flex w-full max-w-full flex-col gap-2 rounded-xl border border-border bg-card px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="min-w-0 text-sm font-semibold text-foreground">Εγκαταστήστε το Καραγκούνης CRM</p>
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
                  className="rounded px-1 text-sm font-bold text-muted-foreground transition-colors hover:text-foreground"
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
            className="pointer-events-none fixed bottom-6 left-1/2 z-[300] max-w-[min(100%,20rem)] -translate-x-1/2 rounded-full border border-border bg-card/95 px-5 py-2.5 text-center text-sm font-medium text-[var(--accent-gold)] shadow-[var(--card-shadow)] backdrop-blur-md"
            role="status"
            aria-live="polite"
          >
            Αλεξάνδρα ακούει…
          </div>
        )}
        <FloatingActions role={role} />
        <div className="crm-bottom-nav lg:hidden">
          <MobileBottomNav profile={profile} onOpenMore={() => setMoreOpen(true)} openRequestsCount={openRequestsCount} />
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
        {activeTour ? <CRMTour tourId={activeTour} onComplete={completeTour} /> : null}
        <div ref={helpRef} className="fixed bottom-20 right-4 z-[130] max-lg:bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))]">
          <button
            type="button"
            onClick={() => setHelpOpen((o) => !o)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-card)] shadow-lg transition-colors hover:border-[var(--accent-gold)]"
            aria-label="Βοήθεια"
            aria-expanded={helpOpen}
          >
            <HelpCircle className="h-5 w-5 text-[var(--text-muted)]" />
          </button>
          {helpOpen ? (
            <div className="absolute bottom-12 right-0 w-64 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-xl">
              <h3 className="mb-3 font-bold text-[var(--text-primary)]">Βοήθεια</h3>
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => startHelpTour("welcome")}
                  className="flex items-center gap-2 rounded-lg p-2 text-left text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)]"
                >
                  <HelpCircle className="h-4 w-4 shrink-0 text-[var(--accent-gold)]" aria-hidden />
                  Ξεναγία CRM
                </button>
                <button
                  type="button"
                  onClick={() => startHelpTour("contacts_tour")}
                  className="flex items-center gap-2 rounded-lg p-2 text-left text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)]"
                >
                  <Users className="h-4 w-4 shrink-0 text-[var(--accent-gold)]" aria-hidden />
                  Οδηγός Επαφών
                </button>
                <button
                  type="button"
                  onClick={() => startHelpTour("requests_tour")}
                  className="flex items-center gap-2 rounded-lg p-2 text-left text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)]"
                >
                  <FileText className="h-4 w-4 shrink-0 text-[var(--accent-gold)]" aria-hidden />
                  Οδηγός Αιτημάτων
                </button>
                <div className="mt-1 border-t border-[var(--border)] pt-2">
                  <button
                    type="button"
                    onClick={() => void askAlexandraForHelp()}
                    className="flex w-full items-center gap-2 rounded-lg p-2 text-left text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)]"
                  >
                    <Sparkles className="h-4 w-4 shrink-0 text-[var(--accent-gold)]" aria-hidden />
                    Ρώτα την Αλεξάνδρα
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
