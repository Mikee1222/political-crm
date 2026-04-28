"use client";

import Link from "next/link";
import { ArrowLeft, Bell, Menu, Search, X } from "lucide-react";

type MobileGlassHeaderProps = {
  firstName: string;
  avatarUrl: string | null | undefined;
  avatarFallback: string;
  avatarImgErr: boolean;
  onAvatarImgError: () => void;
  showBack: boolean;
  onBack: () => void;
  mobileNavOpen: boolean;
  onToggleMenu: () => void;
  canGlobalSearch: boolean;
  onOpenSearch: () => void;
  /** Requests hub as “notifications” for managers */
  requestsHref?: string;
  hidden: boolean;
};

/**
 * 56px glass strip: greeting + avatar, bell, search; hides on scroll down.
 */
export function MobileGlassHeader({
  firstName,
  avatarUrl,
  avatarFallback,
  avatarImgErr,
  onAvatarImgError,
  showBack,
  onBack,
  mobileNavOpen,
  onToggleMenu,
  canGlobalSearch,
  onOpenSearch,
  requestsHref,
  hidden,
}: MobileGlassHeaderProps) {
  return (
    <div
      className="hq-mobile-glass-header sticky top-0 z-[25] w-full border-b border-[var(--border)]/60 backdrop-blur-xl transition-transform duration-300 ease-out lg:hidden"
      style={{
        paddingTop: "max(0px, env(safe-area-inset-top, 0px))",
        background: "color-mix(in srgb, var(--topbar-bg) 88%, transparent)",
        transform: hidden ? "translateY(-108%)" : "translateY(0)",
      }}
    >
      <div className="flex h-14 w-full min-w-0 items-center gap-2 px-3">
        {showBack ? (
          <button
            type="button"
            className="hq-press-mobile flex h-10 min-h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--text-primary)]"
            onClick={onBack}
            aria-label="Πίσω"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : (
          <button
            type="button"
            className="hq-press-mobile flex h-10 min-h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--text-primary)]"
            onClick={onToggleMenu}
            aria-label={mobileNavOpen ? "Κλείσιμο μενού" : "Μενού"}
          >
            {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        )}
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-gradient-to-br from-[var(--accent-gold)]/35 to-[var(--accent-blue)]/30 text-xs font-bold text-white">
            {avatarUrl && !avatarImgErr ? (
              // eslint-disable-next-line @next/next/no-img-element -- user avatar URL
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" onError={onAvatarImgError} />
            ) : (
              avatarFallback
            )}
          </div>
          <p className="min-w-0 truncate text-sm font-semibold text-[var(--text-primary)]">
            Γεια, <span className="text-[var(--accent-gold)]">{firstName}</span>!
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {requestsHref ? (
            <Link
              href={requestsHref}
              className="hq-press-mobile flex h-10 w-10 items-center justify-center rounded-xl text-[var(--text-secondary)] transition hover:text-[var(--accent-gold)]"
              aria-label="Αιτήματα"
            >
              <Bell className="h-[1.15rem] w-[1.15rem]" strokeWidth={2.1} />
            </Link>
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-xl text-[var(--text-muted)] opacity-40" aria-hidden>
              <Bell className="h-[1.15rem] w-[1.15rem]" strokeWidth={2.1} />
            </span>
          )}
          {canGlobalSearch ? (
            <button
              type="button"
              className="hq-press-mobile flex h-10 w-10 items-center justify-center rounded-xl text-[var(--text-secondary)] transition hover:text-[var(--accent-gold)]"
              aria-label="Αναζήτηση"
              onClick={onOpenSearch}
            >
              <Search className="h-[1.15rem] w-[1.15rem]" strokeWidth={2.1} />
            </button>
          ) : (
            <Link
              href="/contacts"
              className="hq-press-mobile flex h-10 w-10 items-center justify-center rounded-xl text-[var(--text-secondary)] transition hover:text-[var(--accent-gold)]"
              aria-label="Επαφές"
            >
              <Search className="h-[1.15rem] w-[1.15rem]" strokeWidth={2.1} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
