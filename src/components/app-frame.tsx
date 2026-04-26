"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Calendar,
  CalendarDays,
  ChartColumnBig,
  CheckSquare,
  Cog,
  Map,
  Megaphone,
  Menu,
  NotebookText,
  Search,
  Sparkles,
  Users,
  Wrench,
} from "lucide-react";
import { AlexaMiniWindow } from "@/components/alexandra/alexa-mini-window";
import { AiAssistantWidget } from "@/components/ai-assistant-widget";
import { LogoutButton } from "@/components/logout-button";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { MobileMoreSheet, type MoreNavItem } from "@/components/mobile-more-sheet";
import { useProfile } from "@/contexts/profile-context";
import { hasMinRole, ROLE_BADGE, type Role } from "@/lib/roles";
import type { LucideIcon } from "lucide-react";

type NavItem = { href: string; label: string; icon: LucideIcon; minRole: Role; badge?: "requests" };

const navigationItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: ChartColumnBig, minRole: "manager" },
  { href: "/contacts", label: "Επαφές", icon: Users, minRole: "caller" },
  { href: "/heatmap", label: "Χάρτης", icon: Map, minRole: "manager" },
  { href: "/namedays", label: "Εορτολόγιο", icon: CalendarDays, minRole: "caller" },
  { href: "/campaigns", label: "Καμπάνιες", icon: Megaphone, minRole: "manager" },
  { href: "/requests", label: "Αιτήματα", icon: NotebookText, minRole: "manager", badge: "requests" },
  { href: "/tasks", label: "Εργασίες", icon: CheckSquare, minRole: "manager" },
  { href: "/schedule", label: "Πρόγραμμα", icon: Calendar, minRole: "manager" },
  { href: "/data-tools", label: "Εργαλεία", icon: Wrench, minRole: "manager" },
  { href: "/settings", label: "Ρυθμίσεις", icon: Cog, minRole: "admin" },
];

function pageTitle(pathname: string) {
  if (pathname.startsWith("/dashboard")) return "Dashboard";
  if (pathname.startsWith("/contacts")) return "Επαφές";
  if (pathname.startsWith("/heatmap")) return "Χάρτης";
  if (pathname.startsWith("/namedays")) return "Εορτολόγιο";
  if (pathname.startsWith("/campaigns")) return "Καμπάνιες";
  if (pathname.startsWith("/requests")) return "Αιτήματα";
  if (pathname.startsWith("/tasks")) return "Εργασίες";
  if (pathname.startsWith("/schedule")) return "Πρόγραμμα";
  if (pathname.startsWith("/data-tools")) return "Εργαλεία δεδομένων";
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
  "group flex h-12 max-h-12 items-center gap-3 rounded-lg border-l-[3px] border-transparent pl-2 pr-2 text-sm transition duration-200 ease-out";
const navItemInactive =
  "text-[#8FA3BF] [&>span]:text-[#8FA3BF] hover:border-transparent hover:bg-[rgba(201,168,76,0.1)] hover:text-[#F0F4FF] hover:[&>span]:text-[#F0F4FF]";
const navItemIconInactive = "text-[#8FA3BF] group-hover:text-[#C9A84C]";
const navItemActive =
  "border-[var(--accent-gold)] bg-[rgba(201,168,76,0.12)] !text-white [&>span]:!text-white";
const navItemIconActive = "text-white";

function NavLinks({
  pathname,
  role,
  openRequestsCount,
  onNavigate,
}: {
  pathname: string;
  role: Role;
  openRequestsCount: number;
  onNavigate?: () => void;
}) {
  const items = navigationItems.filter((i) => hasMinRole(role, i.minRole));
  return (
    <>
      {items.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`${navItemBase} ${active ? navItemActive : navItemInactive}`}
          >
            <Icon
              className={["h-5 w-5 shrink-0 transition-colors duration-200 ease-out", active ? navItemIconActive : navItemIconInactive].join(
                " ",
              )}
            />
            <span className="flex min-w-0 flex-1 items-center justify-between gap-2 text-[14px] font-medium">
              <span className="truncate">{item.label}</span>
              {item.badge === "requests" && openRequestsCount > 0 && hasMinRole(role, "manager") && (
                <span className="shrink-0 rounded-full bg-[var(--accent-gold)] px-1.5 py-0.5 text-[10px] font-bold text-[#0a0f1a]">
                  {openRequestsCount}
                </span>
              )}
            </span>
          </Link>
        );
      })}

      {hasMinRole(role, "caller") && (
        <Link
          href="/alexandra"
          onClick={onNavigate}
          className={[
            navItemBase,
            "mt-0.5 border-[var(--border)]/50 bg-[rgba(201,168,76,0.06)]",
            pathname.startsWith("/alexandra") ? navItemActive + " !bg-[rgba(201,168,76,0.14)]" : navItemInactive,
          ].join(" ")}
        >
          <Sparkles
            className={[
              "hq-shimmer h-5 w-5 shrink-0",
              pathname.startsWith("/alexandra") ? "text-white" : "text-[#C9A84C] opacity-95",
            ].join(" ")}
          />
          <span
            className={[
              "flex min-w-0 flex-1 items-center justify-between gap-1.5 text-[14px] font-semibold",
              pathname.startsWith("/alexandra") ? "text-white" : "text-[#8FA3BF]",
            ].join(" ")}
          >
            <span>Αλεξάνδρα</span>
            <span className="shrink-0 rounded border border-[#C9A84C]/60 bg-[rgba(201,168,76,0.2)] px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-[#F0F4FF]">
              AI
            </span>
          </span>
        </Link>
      )}
    </>
  );
}

function mainTabHrefsForRole(r: Role): Set<string> {
  if (hasMinRole(r, "manager")) {
    return new Set(["/dashboard", "/contacts", "/alexandra", "/requests"]);
  }
  return new Set(["/contacts", "/namedays", "/alexandra"]);
}

export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, loading: profileLoading } = useProfile();
  const isPublic = pathname === "/login";
  const [openRequestsCount, setOpenRequestsCount] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const role: Role = profile?.role ?? "caller";
  const depth = pathname.split("/").filter(Boolean).length;
  const showBackMobile = depth >= 2;

  const moreMenuItems: MoreNavItem[] = useMemo(() => {
    const main = mainTabHrefsForRole(role);
    return navigationItems.filter((i) => hasMinRole(role, i.minRole) && !main.has(i.href));
  }, [role]);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (isPublic) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (hasMinRole(role, "caller")) {
          router.push("/alexandra");
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isPublic, role, router]);

  useEffect(() => {
    if (isPublic || !hasMinRole(role, "manager")) {
      return;
    }
    fetch("/api/requests")
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

  if (isPublic) {
    return <>{children}</>;
  }

  return (
    <div
      className="grid min-h-[-webkit-fill-available] w-full min-h-screen grid-cols-1 bg-[var(--bg-primary)] md:grid-cols-[260px_minmax(0,1fr)]"
    >
      <aside
        className="relative z-30 hidden h-screen min-h-0 w-full min-w-0 flex-col border-r border-[var(--border)] px-3 pt-6 pb-8 md:flex"
        style={{ background: "var(--bg-secondary)" }}
      >
        <div className="flex items-center justify-between pr-0.5 md:justify-start md:pr-0">
          <div className="mb-6 flex w-full items-center justify-between gap-3 pl-0.5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#C9A84C] to-[#8B6914] text-[15px] font-bold tracking-tight text-white shadow-[0_0_24px_rgba(201,168,76,0.25)]">
                ΚΚ
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold leading-tight text-[var(--text-primary)]">Καραγκούνης</p>
                <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--accent-gold)]">ΒΑΣΗ ΔΕΔΟΜΕΝΩΝ</p>
              </div>
            </div>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.04] via-transparent to-black/20" />
        <div className="relative z-10 mb-4 h-px bg-gradient-to-r from-transparent via-[var(--accent-gold)]/40 to-transparent" />

        <nav className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden pb-1">
          <NavLinks pathname={pathname} role={role} openRequestsCount={openRequestsCount} />
        </nav>
      </aside>

      <div className="app-main-shell box-border flex min-h-0 w-full min-w-0 flex-col">
        <header
          className="mobile-top-bar sticky top-0 z-20 box-border min-h-0 w-full min-w-0 max-w-full shrink-0 border-b border-[var(--border)] bg-[#050D1A]/90 pt-[max(0px,env(safe-area-inset-top,0px))] backdrop-blur-lg"
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
                  className="flex h-10 min-h-10 w-10 min-w-10 shrink-0 items-center justify-center rounded-lg text-[var(--text-primary)] active:bg-[var(--bg-elevated)] md:hidden"
                  onClick={() => setMoreOpen(true)}
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
        <main className="hq-fade-in-up main-scroll mobile-page-transition flex-1 touch-pan-y bg-[var(--bg-primary)] p-3 max-md:pb-24 max-md:pt-2 sm:p-6 md:p-8">
          {children}
        </main>
        <AlexaMiniWindow />
        <div className="max-md:hidden">
          <AiAssistantWidget />
        </div>
        <div className="md:hidden">
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
