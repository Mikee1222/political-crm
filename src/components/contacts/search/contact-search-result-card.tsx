"use client";

import { Phone } from "lucide-react";
import type { CSSProperties } from "react";
import { ContactStatusBadges } from "@/components/contacts/contact-status-badges";
import { getAgeFromBirthday } from "@/lib/contact-birthday";
import type { ContactGroupRow } from "@/lib/contact-groups";
import { getGroupChipStyle, GROUP_CHIP_CLASS } from "@/lib/color-utils";
import { lux } from "@/lib/luxury-styles";
import { cn } from "@/lib/utils";

export type ContactSearchResult = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  phone2?: string | null;
  landline?: string | null;
  email?: string | null;
  is_dead?: boolean | null;
  group_names?: string[];
  municipality: string | null;
  father_name?: string | null;
  birthday?: string | null;
  age?: number | null;
  call_status: string | null;
  priority: string | null;
  contact_groups?: Pick<ContactGroupRow, "id" | "name" | "color"> | null;
  group_count?: number;
};

function avatarGradientStyle(first: string, last: string): CSSProperties {
  const s = `${first}${last}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i) * (i + 1)) % 1000;
  const hues = ["var(--accent-blue-bright)", "var(--accent-gold)", "var(--success)"];
  const c1 = hues[h % hues.length]!;
  return {
    background: `linear-gradient(145deg, color-mix(in srgb, ${c1} 72%, var(--bg-card)), var(--bg-elevated))`,
  };
}

function resolveGroupChips(c: ContactSearchResult): { name: string; color?: string | null }[] {
  const fromNames = (c.group_names ?? []).map((name) => ({ name, color: null as string | null }));
  if (fromNames.length) return fromNames;
  if (c.contact_groups) return [{ name: c.contact_groups.name, color: c.contact_groups.color }];
  return [];
}

export function ContactSearchResultCard({
  contact: c,
  onNavigate,
  onOpenInTab,
}: {
  contact: ContactSearchResult;
  onNavigate: () => void;
  onOpenInTab: () => void;
}) {
  const initials = `${(c.first_name[0] ?? "?").toUpperCase()}${(c.last_name[0] ?? "?").toUpperCase()}`;
  const age = getAgeFromBirthday(c.birthday) ?? c.age;
  const tel = c.phone?.trim() ? `tel:${c.phone.replace(/\s/g, "")}` : null;
  const allGroups = resolveGroupChips(c);
  const visibleGroups = allGroups.slice(0, 3);
  const extraGroups = allGroups.length > 3 ? allGroups.length - 3 : 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          onOpenInTab();
          return;
        }
        onNavigate();
      }}
      onMouseDown={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          onOpenInTab();
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onNavigate();
        }
      }}
      className="group/contact-card flex w-full min-w-0 cursor-pointer items-center gap-4 border-b border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors duration-200 first:rounded-t-xl last:rounded-b-xl last:border-b-0 hover:bg-[color-mix(in_srgb,var(--accent)_5%,var(--bg-elevated))]"
    >
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[13px] font-bold shadow-sm"
        style={{ ...avatarGradientStyle(c.first_name, c.last_name), color: "var(--text-primary)" }}
      >
        {initials}
      </div>

      <div className="min-w-0 flex-1">
        <ContactStatusBadges contact={c} size="xs" className="mb-1" />
        <div className="truncate text-[15px] font-bold text-[var(--text-primary)]">
          {c.first_name} {c.last_name}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--text-secondary)]">
          {c.municipality?.trim() ? (
            <span className="truncate">{c.municipality}</span>
          ) : (
            <span className="text-[var(--text-muted)]">—</span>
          )}
          <span className="hidden text-[var(--border)] sm:inline" aria-hidden>
            ·
          </span>
          <span className="inline-flex items-center gap-1.5 font-mono text-sm">
            <Phone className="h-3.5 w-3.5 text-[var(--text-muted)] sm:hidden" aria-hidden />
            {c.phone?.trim() || "—"}
          </span>
          {age != null ? (
            <>
              <span className="hidden text-[var(--border)] sm:inline" aria-hidden>
                ·
              </span>
              <span className="text-xs text-[var(--text-muted)]">{age} ετών</span>
            </>
          ) : null}
        </div>
        {c.father_name?.trim() ? (
          <div className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{c.father_name}</div>
        ) : null}
      </div>

      <div className="hidden shrink-0 flex-wrap justify-end gap-1.5 sm:flex sm:max-w-[40%]" onClick={(e) => e.stopPropagation()}>
        {visibleGroups.map((g) => (
          <span
            key={g.name}
            className={cn(GROUP_CHIP_CLASS, "inline-flex max-w-[9rem] items-center truncate rounded-full px-2.5 py-0.5 text-[10px] font-semibold")}
            style={g.color ? getGroupChipStyle(g.color) : undefined}
            title={g.name}
          >
            {g.name}
          </span>
        ))}
        {extraGroups > 0 ? (
          <span className="inline-flex items-center rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">
            +{extraGroups} ακόμα
          </span>
        ) : null}
      </div>

      {tel ? (
        <a
          href={tel}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            lux.btnPrimary,
            "shrink-0 !h-9 !min-h-9 !rounded-lg !px-2.5 !py-0 opacity-0 transition-opacity group-hover/contact-card:opacity-100 sm:hidden",
          )}
          title="Κλήση"
        >
          <Phone className="h-3.5 w-3.5" aria-hidden />
        </a>
      ) : null}
    </div>
  );
}
