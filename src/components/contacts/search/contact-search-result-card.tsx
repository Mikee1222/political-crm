"use client";

import { Phone } from "lucide-react";
import type { CSSProperties } from "react";
import { callStatusLabel, lux } from "@/lib/luxury-styles";
import { getAgeFromBirthday } from "@/lib/contact-birthday";
import type { ContactGroupRow } from "@/lib/contact-groups";
import { cn } from "@/lib/utils";
import { getGroupChipStyle, GROUP_CHIP_CLASS } from "@/lib/color-utils";
import { ContactStatusBadges } from "@/components/contacts/contact-status-badges";

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

function callStatusAccentStyle(st: string | null | undefined): CSSProperties {
  const s = st ?? "";
  if (s === "Positive") return { background: "var(--success)" };
  if (s === "Pending") return { background: "var(--warning)" };
  if (s === "Negative") return { background: "var(--danger)" };
  return { background: "color-mix(in srgb, var(--text-muted) 55%, var(--border))" };
}

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
  const extraGroups = (c.group_count ?? (c.contact_groups ? 1 : 0)) > 1 ? (c.group_count ?? 1) - 1 : 0;

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
      className="group/contact-card relative flex w-full min-w-0 cursor-pointer items-stretch overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--card-shadow)] transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-px hover:border-[color-mix(in_srgb,var(--accent-gold)_48%,var(--border))] hover:shadow-[var(--card-shadow-hover)]"
    >
      <div
        className="mt-3 mb-3 ml-3 w-[3px] shrink-0 self-stretch rounded-full"
        style={callStatusAccentStyle(c.call_status)}
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 items-start gap-3 py-3 pl-2 pr-2">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
          style={{ ...avatarGradientStyle(c.first_name, c.last_name), color: "var(--text-primary)" }}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <ContactStatusBadges contact={c} size="xs" className="mb-1.5" />
          <div className="truncate text-[15px] font-bold text-[var(--text-primary)]">
            {c.first_name} {c.last_name}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {c.municipality?.trim() ? (
              <span className="inline-flex max-w-full truncate rounded-full border border-[color-mix(in_srgb,var(--accent-blue-bright)_38%,var(--border))] bg-[color-mix(in_srgb,var(--accent-blue-bright)_14%,var(--bg-elevated))] px-2.5 py-0.5 text-[11px] text-[var(--accent-blue)]">
                {c.municipality}
              </span>
            ) : null}
            {age != null ? (
              <span className="text-[11px] text-[var(--text-muted)]">{age} ετών</span>
            ) : null}
          </div>
          {(c.contact_groups || c.father_name?.trim()) && (
            <div className="mt-1.5 line-clamp-1 text-[11px] text-[var(--text-muted)]">
              {c.contact_groups ? (
                <span
                  className={`${GROUP_CHIP_CLASS} inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[10px] font-semibold`}
                  style={getGroupChipStyle(c.contact_groups.color)}
                >
                  {c.contact_groups.name}
                  {extraGroups > 0 ? ` +${extraGroups}` : ""}
                </span>
              ) : null}
              {c.contact_groups && c.father_name?.trim() ? " · " : null}
              {c.father_name?.trim() ?? null}
            </div>
          )}
        </div>
      </div>
      <div
        className="flex w-[8.5rem] shrink-0 flex-col items-end justify-center gap-2 border-l border-[var(--border)] py-3 pr-3 pl-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-full truncate text-right font-mono text-sm text-[var(--text-secondary)]">
          {c.phone || "—"}
        </div>
        {tel ? (
          <a
            href={tel}
            onClick={(e) => e.stopPropagation()}
            className={cn(lux.btnPrimary, "!rounded-lg !px-2 !py-1.5 opacity-0 transition-opacity group-hover/contact-card:opacity-100")}
            title="Κλήση"
          >
            <Phone className="h-3.5 w-3.5" aria-hidden />
          </a>
        ) : (
          <span className="text-[10px] text-[var(--text-muted)] opacity-0 group-hover/contact-card:opacity-100">
            {callStatusLabel(c.call_status)}
          </span>
        )}
      </div>
    </div>
  );
}
