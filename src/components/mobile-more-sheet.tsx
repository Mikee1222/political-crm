"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";
import { hasMinRole, type Role } from "@/lib/roles";
import { LogoutButton } from "@/components/logout-button";

export type MoreNavItem = { href: string; label: string; icon: LucideIcon; minRole: Role; badge?: "requests" };

type MobileMoreSheetProps = {
  open: boolean;
  onClose: () => void;
  items: MoreNavItem[];
  openRequestsCount: number;
  role: Role;
};

export function MobileMoreSheet({ open, onClose, items, openRequestsCount, role }: MobileMoreSheetProps) {
  if (!open) return null;

  const filtered = items.filter((i) => hasMinRole(role, i.minRole));

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[100] bg-black/70 transition-opacity duration-200 ease-out"
        aria-label="Κλείσιμο"
        onClick={onClose}
      />
      <div
            className="mobile-more-sheet max-h-[85dvh] fixed bottom-0 left-0 right-0 z-[101] overflow-y-auto rounded-t-2xl border-t border-[var(--border)] bg-[var(--bg-secondary)] shadow-[0_-8px_40px_rgba(0,0,0,0.5)] transition duration-200 ease-out"
        style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 0px))" }}
        role="dialog"
        aria-label="Περισσότερα"
      >
        <div className="sticky top-0 z-10 flex h-7 items-center justify-center border-b border-[var(--border)]/60 bg-[var(--bg-secondary)] pt-2">
          <div className="h-1 w-10 rounded-full bg-[var(--text-muted)]/50" />
        </div>
        <div className="flex items-center justify-between border-b border-[var(--border)]/40 px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Περισσότερα</h2>
          <button
            type="button"
            className="flex h-10 w-10 min-h-11 min-w-11 items-center justify-center rounded-lg text-[var(--text-secondary)] active:bg-[var(--bg-elevated)]"
            onClick={onClose}
            aria-label="Κλείσιμο"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <ul className="pb-2">
          {filtered.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onClose}
                  className="flex min-h-[52px] items-center gap-3 border-b border-[var(--border)]/30 px-4 py-2 text-sm font-medium text-[var(--text-primary)] active:bg-[var(--bg-elevated)]"
                >
                  <Icon className="h-5 w-5 shrink-0 text-[var(--accent-gold)]" />
                  <span className="flex-1">{item.label}</span>
                  {item.badge === "requests" && openRequestsCount > 0 && hasMinRole(role, "manager") && (
                    <span className="rounded-full bg-[var(--accent-gold)] px-1.5 py-0.5 text-[10px] font-bold text-[#0a0f1a]">
                      {openRequestsCount}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
        {filtered.length === 0 && <p className="px-4 py-4 text-center text-sm text-[var(--text-secondary)]">Δεν υπάρχουν επιπλέον συνδέσμοι.</p>}
        <div className="border-t border-[var(--border)]/40 p-3">
          <div className="min-h-11">
            <LogoutButton className="!w-full" />
          </div>
        </div>
      </div>
    </>
  );
}
