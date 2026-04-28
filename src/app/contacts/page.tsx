"use client";

import { ArrowUpDown, ChevronDown, Download, Phone, Plus, Search, Sparkles, Trash2, User, X } from "lucide-react";
import { ContactsImportWizard } from "@/components/contacts-import-wizard";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  startTransition,
  type CSSProperties,
} from "react";
import { MUNICIPALITIES } from "@/lib/aitoloakarnania-data";
import {
  getDefaultContactFilters,
  searchParamsToFilters,
  buildContactsPageUrl,
  contactFiltersToExportParams,
  contactFiltersToSearchParams,
  applySavedFilterJson,
  type ContactListFilters,
} from "@/lib/contacts-filters";
import { useProfile } from "@/contexts/profile-context";
import { AitoloakarnaniaLocationFields } from "@/components/aitoloakarnania-location-fields";
import { hasMinRole } from "@/lib/roles";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { callStatusLabel, lux } from "@/lib/luxury-styles";
import type { ContactGroupRow } from "@/lib/contact-groups";
import { PageHeader } from "@/components/ui/page-header";
import { CrmErrorBoundary } from "@/components/crm-error-boundary";
import { CenteredModal } from "@/components/ui/centered-modal";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { HqSelect } from "@/components/ui/hq-select";
import { useFormToast } from "@/contexts/form-toast-context";
import { useOptionalAlexandraPageContact } from "@/contexts/alexandra-page-context";
import { useAlexandraChat } from "@/components/alexandra/alexandra-chat-provider";
import { EmptyState } from "@/components/ui/empty-state";

type Contact = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  phone2?: string | null;
  landline?: string | null;
  area: string | null;
  municipality: string | null;
  call_status: string | null;
  priority: string | null;
  tags: string[] | null;
  contact_code?: string | null;
  group_id?: string | null;
  predicted_score?: number | null;
  father_name?: string | null;
  name_day?: string | null;
  contact_groups?: Pick<ContactGroupRow, "id" | "name" | "color" | "description" | "year"> | null;
};

/** e.g. "23 Απρ" for recurring name_day (YYYY-MM-DD) */
function formatNameDayGreek(iso: string | null | undefined): string | null {
  if (!iso || !String(iso).trim()) return null;
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("el-GR", { day: "numeric", month: "short" });
}

function weekStartMondayTime(d: Date): number {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = x.getDay();
  const toMon = dow === 0 ? -6 : 1 - dow;
  x.setDate(x.getDate() + toMon);
  return x.getTime();
}

/** Gold in table when the nameday (month/day) is today or falls in the current week (Mon–Sun). */
function isNameDayTodayOrThisWeek(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const p = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!p) return false;
  const mo = Number(p[2]) - 1;
  const day = Number(p[3]);
  const now = new Date();
  const y = now.getFullYear();
  const occ = new Date(y, mo, day);
  if (occ.getMonth() !== mo) return false;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (occ.getTime() === today.getTime()) return true;
  return weekStartMondayTime(occ) === weekStartMondayTime(today);
}

function priorityDotStyle(pr: string | null | undefined): CSSProperties {
  const p = pr ?? "Medium";
  if (p === "High") return { background: "var(--danger)" };
  if (p === "Low") return { background: "color-mix(in srgb, var(--text-muted) 65%, var(--border))" };
  return { background: "var(--warning)" };
}

/** Status dot / 3px bar — tokens only (Θετικός / Αναμονή / Αρνητικός / default). */
function callStatusAccentStyle(st: string | null | undefined): CSSProperties {
  const s = st ?? "";
  if (s === "Positive") return { background: "var(--success)" };
  if (s === "Pending") return { background: "var(--warning)" };
  if (s === "Negative") return { background: "var(--danger)" };
  return { background: "color-mix(in srgb, var(--text-muted) 55%, var(--border))" };
}

const AVATAR_GRADIENT_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["var(--accent-blue-bright)", "var(--bg-elevated)"],
  ["var(--accent-gold)", "var(--accent-blue)"],
  ["color-mix(in srgb, var(--success) 42%, var(--bg-card))", "var(--bg-elevated)"],
  ["color-mix(in srgb, var(--accent-gold) 52%, var(--bg-card))", "var(--accent-blue-bright)"],
  ["var(--accent-blue)", "color-mix(in srgb, var(--accent-gold) 32%, var(--bg-card))"],
  ["color-mix(in srgb, var(--accent-blue-bright) 48%, var(--bg-elevated))", "var(--bg-card)"],
];

function avatarGradientStyle(first: string, last: string): CSSProperties {
  const s = `${first}${last}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i) * (i + 1)) % 1000;
  const pair = AVATAR_GRADIENT_PAIRS[h % AVATAR_GRADIENT_PAIRS.length]!;
  const [c1, c2] = pair;
  return {
    background: `linear-gradient(145deg, color-mix(in srgb, ${c1} 72%, var(--bg-card)), ${c2})`,
  };
}

function countActiveContactFilters(filters: ContactListFilters): number {
  let n = 0;
  if (filters.search.trim()) n += 1;
  if (filters.call_statuses.length) n += 1;
  if (filters.call_status) n += 1;
  if (filters.municipality) n += 1;
  if (filters.area) n += 1;
  if (filters.priority) n += 1;
  if (filters.tag) n += 1;
  if (filters.political_stance) n += 1;
  if (filters.phone) n += 1;
  if (filters.group_id) n += 1;
  if (filters.group_ids.length) n += 1;
  if (filters.exclude_group_ids.length) n += 1;
  if (filters.not_contacted_days) n += 1;
  if (filters.score_tier) n += 1;
  if (filters.is_volunteer) n += 1;
  if (filters.nameday_today) n += 1;
  if (filters.age_min || filters.age_max) n += 1;
  if (filters.birth_year_from || filters.birth_year_to) n += 1;
  if (filters.volunteer_area) n += 1;
  if (filters.limit) n += 1;
  return n;
}

function ContactDesktopRowCard({
  c,
  selected,
  onToggleSelected,
  canManage,
  onRowNavigate,
  onTriggerCall,
}: {
  c: Contact;
  selected: boolean;
  onToggleSelected: () => void;
  canManage: boolean;
  onRowNavigate: () => void;
  onTriggerCall: (e: React.MouseEvent) => void;
}) {
  const nameDay = formatNameDayGreek(c.name_day);
  const nameDayGold = isNameDayTodayOrThisWeek(c.name_day);
  const initials = `${(c.first_name[0] ?? "?").toUpperCase()}${(c.last_name[0] ?? "?").toUpperCase()}`;
  const avatarBg = avatarGradientStyle(c.first_name, c.last_name);
  const muniPillClass =
    "inline-flex max-w-full truncate rounded-full border px-2.5 py-0.5 text-[11px] border-[color-mix(in_srgb,var(--accent-blue-bright)_38%,var(--border))] bg-[color-mix(in_srgb,var(--accent-blue-bright)_14%,var(--bg-elevated))] text-[var(--accent-blue)]";
  const rosePillClass =
    "inline-flex items-center gap-0.5 rounded-full border px-2.5 py-0.5 text-[11px] border-[color-mix(in_srgb,var(--danger)_28%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_11%,var(--bg-elevated))] text-[color-mix(in_srgb,var(--danger)_82%,var(--text-primary))]";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onRowNavigate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onRowNavigate();
        }
      }}
      className="group/contact-card relative flex w-full min-w-0 cursor-pointer items-stretch overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--card-shadow)] backdrop-blur-md transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-px hover:border-[color-mix(in_srgb,var(--accent-gold)_48%,var(--border))] hover:shadow-[var(--card-shadow-hover)]"
    >
      <div className="flex shrink-0 items-start pt-4 pl-3" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelected}
          className="mt-0.5 h-4 w-4 cursor-pointer rounded border-[var(--border)] bg-[var(--input-bg)] accent-[var(--accent-gold)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent-gold)_35%,transparent)]"
          aria-label={`Επιλογή ${c.first_name} ${c.last_name}`}
        />
      </div>
      <div
        className="mt-3 mb-3 w-[3px] shrink-0 self-stretch rounded-full transition-[box-shadow] duration-200 group-hover/contact-card:[box-shadow:0_0_18px_2px_color-mix(in_srgb,var(--accent-gold)_50%,transparent)]"
        style={callStatusAccentStyle(c.call_status)}
        title={callStatusLabel(c.call_status)}
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 items-start gap-3 py-3 pl-2 pr-2">
        <div className="relative h-11 w-11 shrink-0">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-full text-[13px] font-bold shadow-[inset_0_1px_0_color-mix(in_srgb,var(--text-primary)_12%,transparent)] ring-0 ring-offset-2 ring-offset-[var(--bg-card)] transition-[box-shadow] duration-200 group-hover/contact-card:ring-2 group-hover/contact-card:ring-[color-mix(in_srgb,var(--accent-gold)_45%,transparent)]"
            style={{ ...avatarBg, color: "var(--text-primary)" }}
          >
            {initials}
          </div>
          <span
            className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--bg-card)]"
            style={callStatusAccentStyle(c.call_status)}
            title={callStatusLabel(c.call_status)}
            aria-hidden
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={priorityDotStyle(c.priority)}
              title={c.priority === "High" ? "Υψηλή" : c.priority === "Low" ? "Χαμηλή" : "Μεσαία"}
            />
            <span className="min-w-0 truncate text-[15px] font-bold tracking-tight text-[var(--text-primary)]">
              {c.first_name} {c.last_name}
            </span>
          </div>
          {c.contact_code ? (
            <div className="mt-1">
              <span className="inline-flex rounded-full border border-[color-mix(in_srgb,var(--accent-gold)_42%,var(--border))] bg-[color-mix(in_srgb,var(--accent-gold)_12%,var(--bg-elevated))] px-2 py-0.5 font-mono text-[10px] font-semibold text-[var(--accent-gold)]">
                {c.contact_code}
              </span>
            </div>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {c.municipality?.trim() ? <span className={muniPillClass}>{c.municipality}</span> : null}
            {nameDay ? (
              <span
                className={
                  rosePillClass +
                  (nameDayGold ? " ring-1 ring-[color-mix(in_srgb,var(--accent-gold)_48%,transparent)]" : "")
                }
              >
                🎂 {nameDay}
              </span>
            ) : null}
          </div>
          {(c.contact_groups || c.father_name?.trim()) && (
            <div className="mt-1.5 line-clamp-1 text-[11px] text-[var(--text-muted)]">
              {c.contact_groups ? <span className="font-medium text-[var(--text-secondary)]">{c.contact_groups.name}</span> : null}
              {c.contact_groups && c.father_name?.trim() ? <span> · </span> : null}
              {c.father_name?.trim() ? <span>{c.father_name}</span> : null}
            </div>
          )}
        </div>
      </div>
      <div
        className="flex w-[9.5rem] shrink-0 flex-col items-end justify-center gap-2 border-l border-[var(--border)] py-3 pr-3 pl-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-full text-right font-mono text-sm text-[var(--text-secondary)]">
          <div className="truncate" title={c.phone ?? undefined}>
            {c.phone || "—"}
          </div>
          {c.phone2?.trim() ? (
            <div className="truncate text-[11px] text-[var(--text-muted)]">{c.phone2}</div>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5 opacity-0 transition-opacity duration-200 group-hover/contact-card:opacity-100">
          <button
            type="button"
            className="rounded-lg p-2 text-[var(--text-primary)] shadow-[0_6px_18px_color-mix(in_srgb,var(--success)_35%,transparent)] transition-[filter,opacity] duration-200 hover:brightness-110 disabled:pointer-events-none disabled:opacity-40"
            style={{ background: "var(--success)" }}
            title={canManage ? "Κλήση (Retell)" : "Μόνο managers"}
            disabled={!canManage}
            onClick={onTriggerCall}
          >
            <Phone className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-elevated)_88%,var(--border))] p-2 text-[var(--text-primary)] transition-colors duration-200 hover:bg-[color-mix(in_srgb,var(--accent-gold)_14%,var(--bg-elevated))]"
            title="Προφίλ"
            onClick={onRowNavigate}
          >
            <User className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

type Camp = { id: string; name: string };

const SW_CALL = 58;
const SW_DEL = 58;
const SW_ALEX = 80;

function ContactsMobileSkeleton() {
  return (
    <ul className="space-y-3 md:hidden" aria-hidden>
      {Array.from({ length: 7 }, (_, i) => (
        <li
          key={i}
          className="hq-skeleton-shimmer h-[8.25rem] w-full rounded-[20px] border border-[var(--border)]/35 shadow-[var(--card-shadow)]"
        />
      ))}
    </ul>
  );
}

function ContactSwipeCard({
  c,
  onCall,
  onOpenDetail,
  canCall,
  isAdmin,
  onDeleted,
}: {
  c: Contact;
  onCall: () => void;
  onOpenDetail: () => void;
  canCall: boolean;
  isAdmin: boolean;
  onDeleted: () => void;
}) {
  const pr = c.priority ?? "Medium";
  const pageCtx = useOptionalAlexandraPageContact();
  const { openMiniFromBubble, setMiniWindowMinimized } = useAlexandraChat();
  const [tx, setTx] = useState(0);
  const [touching, setTouching] = useState(false);
  const drag = useRef<{ x0: number; tx0: number } | null>(null);
  const skipTapNav = useRef(false);

  const delW = isAdmin ? SW_DEL : 0;
  const minTx = -(SW_CALL + delW);
  const maxTx = SW_ALEX;
  const clamp = (n: number) => Math.max(minTx, Math.min(maxTx, n));
  const snapFrom = (t: number) => {
    if (t > maxTx * 0.4) return maxTx;
    if (t < minTx * 0.4) return minTx;
    return 0;
  };

  const nd = formatNameDayGreek(c.name_day);
  const ndGold = isNameDayTodayOrThisWeek(c.name_day);
  const initialsM = `${(c.first_name[0] ?? "?").toUpperCase()}${(c.last_name[0] ?? "?").toUpperCase()}`;
  const avatarMStyle = avatarGradientStyle(c.first_name, c.last_name);

  return (
    <div className="relative w-full max-w-full touch-pan-y overflow-hidden rounded-[20px] border border-[var(--border)] shadow-[var(--card-shadow)] md:max-w-none">
      <div className="absolute inset-0 z-10 flex">
        <button
          type="button"
          className="hq-press-mobile flex w-[80px] shrink-0 flex-col items-center justify-center gap-1 border-r border-[var(--border)]/30 text-[var(--text-primary)]"
          style={{
            width: SW_ALEX,
            background:
              "linear-gradient(to bottom right, color-mix(in srgb, var(--accent-gold) 32%, transparent), color-mix(in srgb, var(--accent-gold) 10%, var(--bg-secondary)))",
          }}
          onClick={(e) => {
            e.stopPropagation();
            pageCtx?.setContactPage({
              contactId: c.id,
              contactName: `${c.first_name} ${c.last_name}`.trim(),
            });
            openMiniFromBubble();
            setMiniWindowMinimized(false);
            setTx(0);
          }}
        >
          <Sparkles className="h-5 w-5 text-[var(--accent-gold)]" />
          <span className="text-[9px] font-bold uppercase leading-tight text-[var(--accent-gold)]">Αλεξάνδρα</span>
        </button>
        <div className="min-w-0 flex-1 bg-[var(--bg-secondary)]/40" />
        <button
          type="button"
          className="hq-press-mobile flex shrink-0 flex-col items-center justify-center gap-0.5 text-[var(--text-primary)] disabled:opacity-40"
          style={{
            width: SW_CALL,
            background:
              "linear-gradient(to bottom left, color-mix(in srgb, var(--accent-blue-bright) 88%, var(--bg-card)), var(--accent-blue))",
          }}
          disabled={!canCall}
          onClick={(e) => {
            e.stopPropagation();
            if (canCall) onCall();
            setTx(0);
          }}
        >
          <Phone className="h-5 w-5" />
          <span className="text-[9px] font-bold uppercase">Κλήση</span>
        </button>
        {isAdmin ? (
          <button
            type="button"
            className="hq-press-mobile flex w-[58px] shrink-0 flex-col items-center justify-center gap-0.5 text-[var(--text-primary)]"
            style={{
              background: "linear-gradient(to bottom left, var(--danger), color-mix(in srgb, var(--danger) 58%, var(--bg-primary)))",
            }}
            onClick={async (e) => {
              e.stopPropagation();
              const ok = window.confirm(
                `Διαγραφή της επαφής «${c.first_name} ${c.last_name}»; Η ενέργεια δεν αναιρείται.`,
              );
              if (!ok) return;
              const res = await fetchWithTimeout(`/api/contacts/${c.id}`, { method: "DELETE" });
              if (!res.ok) {
                window.alert("Η διαγραφή απέτυχε.");
                return;
              }
              setTx(0);
              onDeleted();
            }}
          >
            <Trash2 className="h-5 w-5" />
            <span className="text-[9px] font-bold uppercase">Διαγρ.</span>
          </button>
        ) : null}
      </div>

      <div
        role="button"
        tabIndex={0}
        className="hq-card-tap-feedback relative z-20 flex min-h-[6.5rem] w-full min-w-0 cursor-pointer items-stretch border border-[var(--border)] bg-[var(--bg-card)]/95 backdrop-blur-md transition-[transform,box-shadow] duration-200 ease-out max-md:active:shadow-md"
        style={{
          transform: `translate3d(${tx}px,0,0)`,
          transition: touching ? "none" : "transform 0.24s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
        onTouchStart={(e) => {
          setTouching(true);
          drag.current = { x0: e.touches[0].clientX, tx0: tx };
        }}
        onTouchMove={(e) => {
          if (!drag.current) return;
          const dx = e.touches[0].clientX - drag.current.x0;
          if (Math.abs(dx) > 10) skipTapNav.current = true;
          setTx(clamp(drag.current.tx0 + dx));
        }}
        onTouchEnd={() => {
          drag.current = null;
          setTouching(false);
          setTx((t) => snapFrom(t));
        }}
        onTouchCancel={() => {
          drag.current = null;
          setTouching(false);
          setTx((t) => snapFrom(t));
        }}
        onClick={() => {
          if (skipTapNav.current) {
            skipTapNav.current = false;
            return;
          }
          if (tx !== 0) {
            setTx(0);
            return;
          }
          onOpenDetail();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpenDetail();
          }
        }}
      >
        <div className="hq-card-tap-inner flex min-w-0 flex-1 items-stretch">
          <div
            className="my-4 ml-1 w-[3px] shrink-0 self-stretch rounded-full"
            style={callStatusAccentStyle(c.call_status)}
            title={callStatusLabel(c.call_status)}
            aria-hidden
          />
          <div className="flex min-w-0 flex-1 items-center gap-3 p-4 pl-2 pr-2">
            <div className="relative shrink-0">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-full text-base font-bold shadow-[inset_0_1px_0_color-mix(in_srgb,var(--text-primary)_10%,transparent)]"
                style={{ ...avatarMStyle, color: "var(--text-primary)" }}
              >
                {initialsM}
              </div>
              <span
                className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--bg-card)]"
                style={callStatusAccentStyle(c.call_status)}
                title={callStatusLabel(c.call_status)}
                aria-hidden
              />
            </div>
            <div className="min-w-0 flex-1 pr-1">
              <p className="flex flex-wrap items-center gap-1.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={priorityDotStyle(c.priority)}
                  title={pr === "High" ? "Υψηλή" : pr === "Low" ? "Χαμηλή" : "Μεσαία"}
                />
                <span className="min-w-0 text-base font-bold tracking-tight text-[var(--text-primary)]">
                  {c.first_name} {c.last_name}
                </span>
                {c.contact_code ? (
                  <span className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-0.5 font-mono text-[10px] text-[var(--accent-gold)]">
                    {c.contact_code}
                  </span>
                ) : null}
              </p>
              <p className="mt-0.5 font-mono text-sm text-[var(--text-secondary)]">
                <span className="block">{c.phone || "—"}</span>
                {c.municipality?.trim() ? (
                  <span className="mt-1 inline-block max-w-full truncate text-[13px] text-[var(--text-muted)]">{c.municipality}</span>
                ) : null}
              </p>
              {nd ? (
                <div className="mt-1.5 flex flex-wrap gap-2">
                  <span
                    className={
                      "inline-flex items-center gap-0.5 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] " +
                      (ndGold ? "ring-1 ring-[color-mix(in_srgb,var(--accent-gold)_48%,transparent)]" : "")
                    }
                  >
                    🎂 {nd}
                  </span>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="hq-press-mobile ml-auto flex h-12 w-12 shrink-0 items-center justify-center self-center rounded-full text-[var(--text-primary)] shadow-[0_8px_22px_color-mix(in_srgb,var(--success)_38%,transparent)] disabled:pointer-events-none disabled:opacity-35"
              style={{ background: "var(--success)" }}
              title={canCall ? "Κλήση" : "Μόνο managers"}
              disabled={!canCall}
              onClick={(e) => {
                e.stopPropagation();
                if (canCall) onCall();
              }}
            >
              <Phone className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const CALL_STATUS_OPTS: { v: string; l: string }[] = [
  { v: "Pending", l: "Αναμονή" },
  { v: "Positive", l: "Θετικός" },
  { v: "Negative", l: "Αρνητικός" },
  { v: "No Answer", l: "Δεν απάντησε" },
];

function GroupMultiSelect({
  id,
  label,
  value,
  groups,
  onChange,
  emptyLabel,
}: {
  id: string;
  label: string;
  value: string[];
  groups: ContactGroupRow[];
  onChange: (v: string[]) => void;
  emptyLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const selected = groups.filter((g) => value.includes(g.id));
  const labelText =
    selected.length === 0
      ? emptyLabel
      : selected.length === 1
        ? selected[0]!.name
        : `${selected.length} επιλογές`;
  const toggle = (idG: string) => {
    if (value.includes(idG)) onChange(value.filter((x) => x !== idG));
    else onChange([...value, idG]);
  };
  return (
    <div className="relative w-full min-w-0 max-w-full" ref={ref}>
      <span className={lux.label} id={id + "-label"}>
        {label}
      </span>
      <button
        type="button"
        id={id}
        className={lux.select + " mt-1 flex w-full min-w-0 items-center justify-between gap-2 text-left"}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-labelledby={id + "-label"}
        aria-haspopup="listbox"
      >
        <span className="min-w-0 flex-1 truncate text-left text-[var(--text-primary)]">{labelText}</span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
      </button>
      {open && (
        <ul
          className="absolute left-0 right-0 z-40 mt-1 max-h-60 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-card)] py-1 shadow-[var(--card-shadow)]"
          role="listbox"
          aria-multiselectable
        >
          {groups.map((g) => {
            const on = value.includes(g.id);
            return (
              <li key={g.id}>
                <button
                  type="button"
                  className="flex w-full min-w-0 items-center gap-2 px-3 py-2.5 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                  onClick={() => toggle(g.id)}
                >
                  <span
                    className={
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border " +
                      (on ? "border-[var(--accent-gold)] bg-[var(--accent-gold)]/20" : "border-[var(--border)]")
                    }
                    aria-hidden
                  >
                    {on ? "✓" : ""}
                  </span>
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full border border-[var(--border)]"
                    style={{ background: g.color || "var(--accent-blue)" }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {g.name}
                    {g.year != null ? <span className="text-[var(--text-muted)]"> ({g.year})</span> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function CallStatusMultiSelect({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const labelText =
    value.length === 0
      ? "Όλες"
      : value.length === 1
        ? CALL_STATUS_OPTS.find((o) => o.v === value[0])?.l ?? value[0]!
        : `${value.length} status`;
  const toggle = (s: string) => {
    if (value.includes(s)) onChange(value.filter((x) => x !== s));
    else onChange([...value, s]);
  };
  return (
    <div className="relative min-w-0 max-w-full" ref={ref}>
      <label className={lux.label} htmlFor="f-call-m">
        Κατάσταση
      </label>
      <button
        type="button"
        id="f-call-m"
        className={lux.select + " flex w-full min-w-0 items-center justify-between gap-2 text-left"}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="min-w-0 flex-1 truncate text-left text-[var(--text-primary)]">{labelText}</span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
      </button>
      {open && (
        <ul
          className="absolute z-30 mt-1 max-h-48 min-w-[11rem] overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-card)] py-1 shadow-[var(--card-shadow)]"
          role="listbox"
        >
          {CALL_STATUS_OPTS.map((o) => {
            const on = value.includes(o.v);
            return (
              <li key={o.v}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--bg-elevated)]"
                  onClick={() => toggle(o.v)}
                >
                  <span
                    className={
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border " +
                      (on ? "border-[var(--accent-gold)] bg-[var(--accent-gold)]/20" : "border-[var(--border)]")
                    }
                  >
                    {on ? "✓" : ""}
                  </span>
                  {o.l}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type SavedFilterApi = { id: string; name: string; description: string | null; filters: Record<string, unknown> };

function ContactsPage() {
  const { profile } = useProfile();
  const canManage = hasMinRole(profile?.role, "manager");
  const isAdmin = profile?.role === "admin";
  const pageAlexCtx = useOptionalAlexandraPageContact();
  const { openMiniFromBubble, setMiniWindowMinimized } = useAlexandraChat();
  const [warStats, setWarStats] = useState<{
    total: number;
    positive: number;
    pending: number;
    this_month: number;
  } | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [f, setF] = useState<ContactListFilters>(getDefaultContactFilters);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listTotal, setListTotal] = useState(0);
  const pageSize = 50;
  const [groups, setGroups] = useState<ContactGroupRow[]>([]);
  const [savedFilters, setSavedFilters] = useState<SavedFilterApi[]>([]);
  const [openCreate, setOpenCreate] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exportOpen, setExportOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState("Pending");
  const [bulkCampaign, setBulkCampaign] = useState("");
  const [campaigns, setCampaigns] = useState<Camp[]>([]);
  const [bulkErr, setBulkErr] = useState<string | null>(null);
  const [retellCallMsg, setRetellCallMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bulkWaMessage, setBulkWaMessage] = useState("");
  const [savedFilterMenuKey, setSavedFilterMenuKey] = useState(0);
  const filtersUrlKeyRef = useRef<string | null>(null);
  const { showToast: showListToast } = useFormToast();

  const groupNameToId = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groups) m.set(g.name.toLowerCase(), g.id);
    return m;
  }, [groups]);

  const patch = useCallback(
    (p: Partial<ContactListFilters>) => {
      setF((prev) => {
        const next: ContactListFilters = { ...prev, ...p };
        const anyNonPage = Object.keys(p).length > 0 && Object.keys(p).some((k) => k !== "page");
        if (anyNonPage) {
          next.page = "1";
        }
        startTransition(() => {
          router.replace(buildContactsPageUrl(next), { scroll: false });
        });
        return next;
      });
    },
    [router],
  );

  const searchKey = useMemo(() => searchParams.toString(), [searchParams]);
  useLayoutEffect(() => {
    if (filtersUrlKeyRef.current === searchKey) return;
    filtersUrlKeyRef.current = searchKey;
    setF(searchParamsToFilters(new URLSearchParams(searchKey), getDefaultContactFilters()));
  }, [searchKey]);

  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    if (canManage) setOpenCreate(true);
    const p = new URLSearchParams(searchParams.toString());
    p.delete("new");
    const q = p.toString();
    startTransition(() => router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false }));
  }, [searchParams, router, pathname, canManage]);

  const load = useCallback(async () => {
    const q = f;
    const params = contactFiltersToSearchParams(q);
    params.set("page", q.page || "1");
    params.set("page_size", String(pageSize));
    setListLoading(true);
    try {
      const res = await fetchWithTimeout(`/api/contacts?${params.toString()}`);
      const data = (await res.json().catch(() => ({}))) as { contacts?: Contact[]; total?: number };
      if (!res.ok) {
        setContacts([]);
        setListTotal(0);
        return;
      }
      const list = (data.contacts ?? []).map((c) => {
        const g = c.contact_groups;
        const contact_groups = Array.isArray(g) ? g[0] ?? null : g ?? null;
        return { ...c, contact_groups } as Contact;
      });
      setContacts(list);
      setListTotal(typeof data.total === "number" ? data.total : list.length);
    } catch {
      setContacts([]);
      setListTotal(0);
    } finally {
      setListLoading(false);
    }
  }, [f, pageSize]);

  useEffect(() => {
    fetchWithTimeout("/api/groups")
      .then((r) => r.json())
      .then((d: { groups?: ContactGroupRow[] }) => setGroups(d.groups ?? []))
      .catch(() => setGroups([]));
  }, []);

  useEffect(() => {
    fetchWithTimeout("/api/saved-filters")
      .then((r) => r.json())
      .then((d: { saved_filters?: SavedFilterApi[] }) => setSavedFilters(d.saved_filters ?? []))
      .catch(() => setSavedFilters([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    fetchWithTimeout("/api/contacts/summary-stats")
      .then(async (r) => {
        const d = (await r.json().catch(() => ({}))) as {
          total?: number;
          positive?: number;
          pending?: number;
          this_month?: number;
        };
        if (!r.ok || cancelled) return;
        setWarStats({
          total: typeof d.total === "number" ? d.total : 0,
          positive: typeof d.positive === "number" ? d.positive : 0,
          pending: typeof d.pending === "number" ? d.pending : 0,
          this_month: typeof d.this_month === "number" ? d.this_month : 0,
        });
      })
      .catch(() => {
        if (!cancelled) setWarStats(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!canManage) return;
    fetchWithTimeout("/api/campaigns")
      .then((r) => r.json())
      .then((d) => {
        setCampaigns((d.campaigns as Camp[] | undefined) ?? []);
      })
      .catch(() => setCampaigns([]));
  }, [canManage]);

  const areas = useMemo(
    () => Array.from(new Set(contacts.map((c) => c.area).filter(Boolean))) as string[],
    [contacts],
  );

  const currentPage = Math.max(1, parseInt(f.page || "1", 10) || 1);
  const totalPages = Math.max(1, Math.ceil(listTotal / pageSize));
  const rangeFrom = listTotal === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeTo = Math.min(currentPage * pageSize, listTotal);
  const pageList = (() => {
    const last = totalPages;
    if (last <= 7) {
      return Array.from({ length: last }, (_, i) => i + 1);
    }
    const r: number[] = [];
    let end = Math.min(last, currentPage + 2);
    const start = Math.max(1, end - 4);
    if (end - start < 4) {
      end = Math.min(last, start + 4);
    }
    for (let i = start; i <= end; i += 1) {
      r.push(i);
    }
    return r;
  })();

  const selectedIds = [...selected];
  const allChecked = contacts.length > 0 && contacts.every((c) => selected.has(c.id));

  const activeFilterPillCount = useMemo(() => countActiveContactFilters(f), [f]);

  const triggerCall = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!canManage) return;
    setRetellCallMsg(null);
    const res = await fetchWithTimeout("/api/retell/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_id: id }),
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string; success?: boolean };
    if (!res.ok) {
      setRetellCallMsg({ type: "err", text: j.error ?? "Η κλήση απέτυχε" });
      return;
    }
    setRetellCallMsg({ type: "ok", text: "Η κλήση ξεκίνησε (Retell)." });
    await load();
  };

  const triggerCallById = async (id: string) => {
    if (!canManage) return;
    setRetellCallMsg(null);
    const res = await fetchWithTimeout("/api/retell/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_id: id }),
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string; success?: boolean };
    if (!res.ok) {
      setRetellCallMsg({ type: "err", text: j.error ?? "Η κλήση απέτυχε" });
      return;
    }
    setRetellCallMsg({ type: "ok", text: "Η κλήση ξεκίνησε (Retell)." });
    await load();
  };

  const postBulk = async (
    action: "update_status" | "add_to_campaign" | "delete" | "send_whatsapp",
    value?: string,
  ) => {
    if (!selectedIds.length) return;
    setBulkErr(null);
    setSaving(true);
    try {
      const res = await fetchWithTimeout("/api/contacts/bulk-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_ids: selectedIds, action, value: value ?? "" }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        const msg = j.error ?? "Σφάλμα";
        setBulkErr(msg);
        showListToast(msg, "error");
        return;
      }
      const okMsg =
        action === "delete"
          ? "Οι επαφές διαγράφηκαν."
          : action === "update_status"
            ? "Η κατάσταση κλήσης ενημερώθηκε."
            : action === "add_to_campaign"
              ? "Οι επαφές προστέθηκαν στην καμπάνια."
              : "Η αποστολή WhatsApp ολοκληρώθηκε.";
      showListToast(okMsg, "success");
      setSelected(new Set());
      if (action === "delete") setDeleteOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full min-w-0 max-w-full space-y-6 pb-24 md:pb-6">
      {f.nameday_today && (
        <div
          className="flex w-full min-w-0 max-w-full flex-col gap-2 rounded-2xl border-2 border-[var(--accent-gold)]/45 bg-gradient-to-r from-[rgba(201,168,76,0.12)] to-[var(--bg-card)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          role="status"
        >
          <p className="text-sm text-[var(--text-primary)]">
            <span className="font-semibold text-[var(--accent-gold)]">Φίλτρο:</span> επαφές που{" "}
            <span className="text-[var(--text-secondary)]">εορτάζουν σήμερα</span> (ονομαστική σύνδεση εορτολογίου).
          </p>
          <button
            type="button"
            onClick={() => patch({ nameday_today: false })}
            className={lux.btnSecondary + " !shrink-0 !py-2 text-xs sm:!text-sm"}
          >
            Εμφάνιση όλων
          </button>
        </div>
      )}
      {retellCallMsg && (
        <p
          role="status"
          className={
            retellCallMsg.type === "ok"
              ? "rounded-lg border border-[color-mix(in_srgb,var(--success)_45%,var(--border))] bg-[color-mix(in_srgb,var(--success)_12%,var(--bg-card))] px-3 py-2 text-sm text-[var(--text-primary)]"
              : "rounded-lg border border-[color-mix(in_srgb,var(--danger)_45%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_12%,var(--bg-card))] px-3 py-2 text-sm text-[var(--text-primary)]"
          }
        >
          {retellCallMsg.text}
        </p>
      )}
      <PageHeader
        title="Επαφές"
        subtitle="Διαχείριση εκλογικής βάσης — αναζήτηση, φίλτρα, εξαγωγή και μαζικές ενέργειες."
        actions={
          <div className="flex w-full min-w-0 max-w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={() => {
                pageAlexCtx?.setContactPage(null);
                openMiniFromBubble();
                setMiniWindowMinimized(false);
              }}
              className="hq-contacts-alex-launch relative z-0 inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-left text-[13px] font-bold tracking-tight"
            >
              <span className="relative z-[1] flex items-center gap-2">
                <Sparkles className="h-4 w-4 shrink-0 opacity-95" aria-hidden />
                <span className="hidden sm:inline">Αλεξάνδρα</span>
                <span className="rounded-md border border-[color-mix(in_srgb,var(--text-badge-on-gold)_35%,transparent)] bg-[color-mix(in_srgb,var(--text-badge-on-gold)_18%,transparent)] px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider">
                  AI
                </span>
              </span>
            </button>
            <div className="relative w-full max-w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setExportOpen((o) => !o)}
                className={lux.btnSecondary + " !py-2 text-sm inline-flex items-center gap-1"}
                aria-expanded={exportOpen}
              >
                <Download className="h-4 w-4" />
                Εξαγωγή
                <ChevronDown className="h-4 w-4 opacity-60" />
              </button>
              {exportOpen && (
                <div
                  className="absolute right-0 top-full z-20 mt-1 w-full max-w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] py-1 shadow-xl sm:min-w-[220px] sm:w-auto"
                  role="menu"
                >
                  {canManage && (
                    <a
                      className="block px-3 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                      href="/api/contacts/export"
                    >
                      Εξαγωγή όλων
                    </a>
                  )}
                  <a
                    className="block px-3 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                    href={`/api/contacts/export?${contactFiltersToExportParams(f).toString()}`}
                  >
                    Εξαγωγή φίλτρων
                  </a>
                  <a
                    className="block px-3 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                    href={selectedIds.length ? `/api/contacts/export?${new URLSearchParams({ ids: selectedIds.join(",") }).toString()}` : "#"}
                    onClick={(e) => {
                      if (!selectedIds.length) e.preventDefault();
                    }}
                  >
                    Εξαγωγή επιλεγμένων
                  </a>
                </div>
              )}
            </div>
            {canManage && (
              <>
                <a href="/api/contacts/import-template" className={lux.btnSecondary + " !py-2 text-sm"}>
                  CSV Template
                </a>
                <button
                  type="button"
                  onClick={() => setOpenCreate(true)}
                  className={lux.btnPrimary + " hq-shimmer-gold !rounded-full !py-2.5 text-sm !font-bold text-[var(--text-badge-on-gold)]"}
                >
                  <Plus className="h-4 w-4" />
                  Νέα Επαφή
                </button>
              </>
            )}
          </div>
        }
        metrics={
          <div className="grid w-full max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            <div className="flex flex-col gap-1 border-b border-[var(--border)] pb-3 text-center sm:border-b-0 sm:border-r sm:pb-0 sm:pr-4 sm:text-left">
              <span className="font-mono text-2xl font-bold tabular-nums tracking-tight text-[var(--text-metric-value)]">
                {warStats ? warStats.total : "—"}
              </span>
              <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-label)]">Σύνολο</span>
            </div>
            <div className="flex flex-col gap-1 border-b border-[var(--border)] pb-3 text-center sm:border-b-0 sm:border-r sm:pb-0 sm:pr-4 sm:text-left">
              <span
                className="font-mono text-2xl font-bold tabular-nums tracking-tight"
                style={{ color: "var(--status-positive-text, var(--success))" }}
              >
                {warStats ? warStats.positive : "—"}
              </span>
              <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-label)]">Θετικοί</span>
            </div>
            <div className="flex flex-col gap-1 border-b border-[var(--border)] pb-3 text-center sm:border-b-0 sm:border-r sm:pb-0 sm:pr-4 sm:text-left">
              <span className="font-mono text-2xl font-bold tabular-nums tracking-tight text-[var(--warning)]">
                {warStats ? warStats.pending : "—"}
              </span>
              <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-label)]">Αναμονή</span>
            </div>
            <div className="flex flex-col gap-1 pt-0.5 text-center sm:pt-0 sm:text-left">
              <span className="font-mono text-2xl font-bold tabular-nums tracking-tight text-[var(--text-metric-value)]">
                {warStats ? warStats.this_month : "—"}
              </span>
              <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-label)]">Αυτό το μήνα</span>
            </div>
          </div>
        }
      />

      <div className={lux.card + " !py-4 w-full min-w-0 max-w-full"}>
        <div className="mb-3 min-w-0 max-w-full sm:max-w-md">
          <label className={lux.label} htmlFor="f-saved-m">
            Αποθηκευμένα φίλτρα
          </label>
          <HqSelect
            key={savedFilterMenuKey}
            id="f-saved-m"
            defaultValue=""
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              const row = savedFilters.find((r) => r.id === v);
              if (row) {
                const next = applySavedFilterJson(row.filters, groupNameToId);
                setF(next);
                startTransition(() => router.replace(buildContactsPageUrl(next), { scroll: false }));
              }
              setSavedFilterMenuKey((k) => k + 1);
            }}
          >
            <option value="">— επιλέξτε —</option>
            {savedFilters.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.description ? ` — ${s.description}` : ""}
              </option>
            ))}
          </HqSelect>
        </div>
        <div className="grid w-full min-w-0 max-w-full grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(min(100%,11.5rem),1fr))]">
          <div className="min-w-0 max-w-full sm:col-span-2">
            <label className={lux.label} htmlFor="f-search">
              Αναζήτηση
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
                aria-hidden
              />
              <input
                id="f-search"
                className={
                  "h-12 w-full rounded-[12px] border-[1.5px] border-[var(--border)] bg-[var(--input-bg)] pl-10 pr-4 text-sm text-[var(--text-input)] shadow-[var(--card-shadow)] outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-[var(--text-placeholder)] focus:border-[var(--accent-gold)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent-gold)_22%,transparent),0_8px_28px_color-mix(in_srgb,var(--accent-gold)_18%,transparent)] " +
                  (activeFilterPillCount > 0 ? "pr-28 sm:pr-32" : "pr-4")
                }
                placeholder="Αναζήτηση επαφής, αριθμού, δήμου..."
                value={f.search}
                onChange={(e) => patch({ search: e.target.value })}
                autoComplete="off"
              />
              {activeFilterPillCount > 0 ? (
                <span className="pointer-events-none absolute right-2.5 top-1/2 inline-flex max-w-[5.5rem] -translate-y-1/2 truncate rounded-full border border-[color-mix(in_srgb,var(--accent-gold)_42%,var(--border))] bg-[color-mix(in_srgb,var(--accent-gold)_12%,var(--bg-elevated))] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent-gold)] sm:max-w-none sm:px-2.5 sm:text-[11px]">
                  {activeFilterPillCount} φίλτρα
                </span>
              ) : null}
            </div>
            {(f.call_statuses.length > 0 ||
              f.municipality ||
              f.area ||
              f.priority ||
              f.search ||
              f.tag) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {f.search.trim() ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--accent-gold)_45%,var(--border))] bg-[color-mix(in_srgb,var(--accent-gold)_12%,var(--bg-elevated))] px-2.5 py-0.5 text-[10px] font-bold text-[var(--text-primary)]">
                    Ζ: {f.search}
                  </span>
                ) : null}
                {f.municipality ? (
                  <span className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
                    {f.municipality}
                  </span>
                ) : null}
                {f.area ? (
                  <span className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
                    {f.area}
                  </span>
                ) : null}
              </div>
            )}
          </div>
          <div className="min-w-0 max-w-full">
            <CallStatusMultiSelect
              value={f.call_statuses.length ? f.call_statuses : f.call_status ? [f.call_status] : []}
              onChange={(v) => {
                patch({ call_statuses: v, call_status: "" });
              }}
            />
          </div>
          <div className="min-w-0 max-w-full">
            <label className={lux.label} htmlFor="f-area">
              Περιοχή
            </label>
            <HqSelect id="f-area" value={f.area} onChange={(e) => patch({ area: e.target.value })}>
              <option value="">Όλες</option>
              {areas.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </HqSelect>
          </div>
          <div className="min-w-0 max-w-full">
            <label className={lux.label} htmlFor="f-muni">
              Δήμος
            </label>
            <HqSelect id="f-muni" value={f.municipality} onChange={(e) => patch({ municipality: e.target.value })}>
              <option value="">Όλοι</option>
              {MUNICIPALITIES.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name}
                </option>
              ))}
            </HqSelect>
          </div>
          <div className="min-w-0 max-w-full">
            <label className={lux.label} htmlFor="f-pri">
              Προτεραιότητα
            </label>
            <HqSelect id="f-pri" value={f.priority} onChange={(e) => patch({ priority: e.target.value })}>
              <option value="">Όλες</option>
              <option value="High">Υψηλή</option>
              <option value="Medium">Μεσαία</option>
              <option value="Low">Χαμηλή</option>
            </HqSelect>
          </div>
          <div className="min-w-0 max-w-full">
            <label className={lux.label} htmlFor="f-tag">
              Ετικέτα
            </label>
            <input
              id="f-tag"
              className={lux.input}
              placeholder="Φίλτρο tag"
              value={f.tag}
              onChange={(e) => patch({ tag: e.target.value })}
            />
          </div>
          <div className="min-w-0 max-w-full sm:col-span-2">
            <GroupMultiSelect
              id="f-groups"
              label="Ομάδα"
              value={f.group_ids.length ? f.group_ids : f.group_id ? [f.group_id] : []}
              groups={groups}
              onChange={(ids) => {
                patch({
                  group_ids: ids,
                  group_id: "",
                });
              }}
              emptyLabel="Όλες οι ομάδες"
            />
          </div>
          <div className="min-w-0 max-w-full sm:col-span-2">
            <GroupMultiSelect
              id="f-groups-ex"
              label="Εξαίρεση ομάδας"
              value={f.exclude_group_ids}
              groups={groups}
              onChange={(ids) => patch({ exclude_group_ids: ids })}
              emptyLabel="Χωρίς εξαίρεση"
            />
          </div>
          <div className="min-w-0 max-w-full">
            <label className={lux.label} htmlFor="f-byrf">
              Έτος γέννησης από
            </label>
            <input
              id="f-byrf"
              className={lux.input}
              inputMode="numeric"
              placeholder="π.χ. 1960"
              value={f.birth_year_from}
              onChange={(e) => patch({ birth_year_from: e.target.value.replace(/[^\d]/g, "") })}
            />
          </div>
          <div className="min-w-0 max-w-full">
            <label className={lux.label} htmlFor="f-byrt">
              Έτος γέννησης έως
            </label>
            <input
              id="f-byrt"
              className={lux.input}
              inputMode="numeric"
              placeholder="π.χ. 1990"
              value={f.birth_year_to}
              onChange={(e) => patch({ birth_year_to: e.target.value.replace(/[^\d]/g, "") })}
            />
          </div>
          <div className="min-w-0 max-w-full">
            <label className={lux.label} htmlFor="f-score">
              Σκορ (πειθω)
            </label>
            <HqSelect id="f-score" value={f.score_tier} onChange={(e) => patch({ score_tier: e.target.value })}>
              <option value="">Όλα</option>
              <option value="low">0–33 (χαμηλό)</option>
              <option value="mid">34–66 (μέτριο)</option>
              <option value="high">67–100 (υψηλό)</option>
            </HqSelect>
          </div>
          {canManage && (
            <div className="min-w-0 max-w-full flex items-end">
              <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-[var(--text-primary)]">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-[var(--border)]"
                  checked={f.is_volunteer}
                  onChange={(e) => patch({ is_volunteer: e.target.checked })}
                />
                Μόνο εθελοντές
              </label>
            </div>
          )}
        </div>
      </div>

      {canManage && <ContactsImportWizard onImported={load} />}

      {listLoading ? (
        <ContactsMobileSkeleton />
      ) : contacts.length > 0 ? (
        <div className="md:hidden">
          <ul className="space-y-3">
            {contacts.map((c) => (
              <li key={c.id}>
                <ContactSwipeCard
                  c={c}
                  canCall={canManage}
                  isAdmin={isAdmin}
                  onCall={() => void triggerCallById(c.id)}
                  onOpenDetail={() => router.push(`/contacts/${c.id}`)}
                  onDeleted={() => void load()}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="md:hidden">
          <EmptyState
            className="border-[var(--border)] bg-[var(--bg-card)]/80 py-12"
            icon={<span className="text-5xl">👤</span>}
            title="Δεν βρέθηκαν επαφές"
            subtitle="Προσαρμόστε τα φίλτρα ή προσθέστε νέα επαφή για να ξεκινήσετε την καμπάνια σας."
            action={
              canManage ? (
                <button type="button" onClick={() => setOpenCreate(true)} className={lux.btnGold}>
                  Νέα επαφή
                </button>
              ) : null
            }
          />
        </div>
      )}

      <div className="relative hidden max-h-[min(70vh,900px)] min-h-0 w-full min-w-0 max-w-full overflow-y-auto rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-secondary)_55%,var(--bg-card))] p-3 md:block">
        <div className="sticky top-0 z-10 -mx-1 mb-3 flex items-center gap-2 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-card)_82%,transparent)] px-3 py-2.5 backdrop-blur-md">
          <div className="flex w-10 shrink-0 items-center justify-center">
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer rounded border-[var(--border)] bg-[var(--input-bg)] accent-[var(--accent-gold)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent-gold)_35%,transparent)]"
              checked={allChecked}
              onChange={(e) => {
                e.stopPropagation();
                if (allChecked) setSelected(new Set());
                else setSelected(new Set(contacts.map((x) => x.id)));
              }}
              title="Επιλογή όλων"
              aria-label="Επιλογή όλων"
            />
          </div>
          <div className="w-[3px] shrink-0 self-stretch rounded-full bg-transparent" aria-hidden />
          <div className="group flex min-w-0 flex-1 cursor-default items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-table-header)] transition-colors duration-200 hover:text-[var(--accent-gold)]">
            Επαφή
            <ArrowUpDown className="h-3 w-3 opacity-0 transition-opacity duration-200 group-hover:opacity-50" aria-hidden />
          </div>
          <div className="group hidden w-[9.5rem] shrink-0 cursor-default items-center justify-end gap-1.5 border-l border-[var(--border)] pl-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-table-header)] transition-colors duration-200 hover:text-[var(--accent-gold)] sm:flex">
            Τηλέφωνο
            <ArrowUpDown className="h-3 w-3 opacity-0 transition-opacity duration-200 group-hover:opacity-50" aria-hidden />
          </div>
        </div>
        <div className="flex flex-col gap-3 pb-1">
          {contacts.map((c) => (
            <ContactDesktopRowCard
              key={c.id}
              c={c}
              selected={selected.has(c.id)}
              onToggleSelected={() =>
                setSelected((prev) => {
                  const n = new Set(prev);
                  if (n.has(c.id)) n.delete(c.id);
                  else n.add(c.id);
                  return n;
                })
              }
              canManage={canManage}
              onRowNavigate={() => router.push(`/contacts/${c.id}`)}
              onTriggerCall={(e) => void triggerCall(e, c.id)}
            />
          ))}
        </div>
        {contacts.length === 0 && !listLoading ? (
          <p className="p-8 text-center text-sm text-[var(--text-muted)]">Δεν βρέθηκαν επαφές</p>
        ) : null}
      </div>

      {listTotal > 0 && (
        <div className="flex w-full min-w-0 max-w-full flex-col items-stretch justify-between gap-3 border-t border-[var(--border)]/60 pt-4 sm:flex-row sm:items-center">
          <p className="w-full min-w-0 text-center text-sm text-[var(--text-secondary)] sm:max-w-[50%] sm:text-left" aria-live="polite">
            Εμφάνιση {rangeFrom}–{rangeTo} από {listTotal} επαφές
          </p>
          <div className="flex min-w-0 flex-wrap items-center justify-center gap-1 sm:justify-end">
            <button
              type="button"
              className={lux.btnSecondary + " !px-3 !py-2 text-xs sm:text-sm"}
              disabled={currentPage <= 1}
              onClick={() => patch({ page: String(currentPage - 1) })}
            >
              Προηγούμενο
            </button>
            {pageList.map((pn) => (
              <button
                key={pn}
                type="button"
                className={
                  lux.btnSecondary +
                  (pn === currentPage ? " !ring-1 !ring-[var(--accent-gold)]" : "") +
                  " !min-w-[2.5rem] !px-2 !py-2 text-xs sm:text-sm"
                }
                onClick={() => patch({ page: String(pn) })}
                aria-current={pn === currentPage ? "page" : undefined}
              >
                {pn}
              </button>
            ))}
            <button
              type="button"
              className={lux.btnSecondary + " !px-3 !py-2 text-xs sm:text-sm"}
              disabled={currentPage >= totalPages}
              onClick={() => patch({ page: String(currentPage + 1) })}
            >
              Επόμενο
            </button>
          </div>
        </div>
      )}

      {selectedIds.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-50 max-w-[100vw] px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] max-md:bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] md:bottom-6 md:left-1/2 md:right-auto md:w-[min(96%,56rem)] md:max-w-[calc(100vw-1rem)] md:-translate-x-1/2 md:px-0">
          <div className="hq-bulk-bar-inner rounded-2xl border border-[var(--border)] bg-[var(--surface-bulk)] px-4 py-3 shadow-[var(--card-shadow-hover)] backdrop-blur-xl">
            {bulkErr && (
              <p className="mb-2 break-words text-center text-xs text-[var(--danger)]" role="alert">
                {bulkErr}
              </p>
            )}
            <div className="flex w-full min-w-0 flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-mono text-sm font-bold text-[var(--text-badge-on-gold)] shadow-[0_4px_16px_color-mix(in_srgb,var(--accent-gold)_35%,transparent)]"
                  style={{
                    background: "linear-gradient(145deg, var(--accent-gold-light), var(--accent-gold), color-mix(in srgb, var(--accent-gold) 70%, var(--bg-primary)))",
                  }}
                >
                  {selectedIds.length}
                </div>
                <p className="text-sm font-medium text-[var(--text-primary)]">επαφές επιλέχθηκαν</p>
              </div>
              <div className="hidden h-6 w-px shrink-0 bg-[var(--border)] md:block" aria-hidden />
              <div className="flex min-w-0 flex-1 flex-col flex-wrap items-stretch gap-2 md:flex-row md:items-center md:justify-end">
                {canManage && (
                  <>
                    <div className="flex w-full min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center">
                      <label className="sr-only" htmlFor="bulk-status">
                        Αλλαγή status
                      </label>
                      <HqSelect
                        id="bulk-status"
                        className="!h-9 w-full sm:min-w-[10rem]"
                        value={bulkStatus}
                        onChange={(e) => setBulkStatus(e.target.value)}
                      >
                        <option value="Pending">Αναμονή</option>
                        <option value="Positive">Θετικός</option>
                        <option value="Negative">Αρνητικός</option>
                        <option value="No Answer">Δεν απάντησε</option>
                      </HqSelect>
                      <button
                        type="button"
                        className="h-9 w-full rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-elevated)_92%,var(--border))] px-3.5 text-[13px] font-medium text-[var(--text-primary)] transition-colors duration-200 hover:bg-[color-mix(in_srgb,var(--accent-gold)_12%,var(--bg-elevated))] disabled:opacity-50 sm:w-auto"
                        onClick={() => void postBulk("update_status", bulkStatus)}
                        disabled={saving}
                      >
                        Αλλαγή status
                      </button>
                    </div>
                    <div className="flex w-full min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center">
                      <label className="sr-only" htmlFor="bulk-camp">
                        Καμπάνια
                      </label>
                      <HqSelect
                        id="bulk-camp"
                        className="!h-9 w-full sm:min-w-[11rem]"
                        value={bulkCampaign}
                        onChange={(e) => setBulkCampaign(e.target.value)}
                      >
                        <option value="">Ανάθεση σε καμπάνια</option>
                        {campaigns.map((cc) => (
                          <option key={cc.id} value={cc.id}>
                            {cc.name}
                          </option>
                        ))}
                      </HqSelect>
                      <button
                        type="button"
                        className="h-9 w-full rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-elevated)_92%,var(--border))] px-3.5 text-[13px] font-medium text-[var(--text-primary)] transition-colors duration-200 hover:bg-[color-mix(in_srgb,var(--accent-blue-bright)_14%,var(--bg-elevated))] disabled:opacity-50 sm:w-auto"
                        onClick={() => (bulkCampaign ? void postBulk("add_to_campaign", bulkCampaign) : null)}
                        disabled={saving || !bulkCampaign}
                      >
                        Καμπάνια
                      </button>
                    </div>
                    <div className="flex w-full min-w-0 flex-col gap-1.5 sm:flex-row sm:items-end">
                      <div className="min-w-0 flex-1">
                        <label className="mb-0.5 block text-[10px] font-medium uppercase text-[var(--text-label)]" htmlFor="bulk-wa">
                          WhatsApp
                        </label>
                        <input
                          id="bulk-wa"
                          className={lux.select + " !h-9 w-full !text-sm border-[var(--border)] bg-[var(--input-bg)]"}
                          value={bulkWaMessage}
                          onChange={(e) => setBulkWaMessage(e.target.value)}
                          placeholder="Κείμενο (1 δευτερόλεπτο ανά επαφή)…"
                        />
                      </div>
                      <button
                        type="button"
                        className="h-9 w-full shrink-0 rounded-lg px-3.5 text-[13px] font-medium text-[var(--text-primary)] shadow-[0_4px_14px_color-mix(in_srgb,var(--success)_32%,transparent)] transition-[filter,opacity] duration-200 hover:brightness-110 disabled:opacity-50 sm:w-auto"
                        style={{ background: "var(--success)" }}
                        disabled={saving || !bulkWaMessage.trim()}
                        onClick={() => void postBulk("send_whatsapp", bulkWaMessage)}
                      >
                        WhatsApp
                      </button>
                    </div>
                  </>
                )}
                <a
                  className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-elevated)_92%,var(--border))] px-3.5 text-[13px] font-medium text-[var(--text-primary)] transition-colors duration-200 hover:bg-[color-mix(in_srgb,var(--text-primary)_6%,var(--bg-elevated))] sm:w-auto"
                  href={selectedIds.length ? `/api/contacts/export?${new URLSearchParams({ ids: selectedIds.join(",") }).toString()}` : "#"}
                  onClick={(e) => {
                    if (!selectedIds.length) e.preventDefault();
                  }}
                >
                  <Download className="h-4 w-4" />
                  Εξαγωγή
                </a>
                {isAdmin && canManage && (
                  <button
                    type="button"
                    className={lux.btnDanger + " h-9 w-full !py-0 text-[13px] sm:w-auto sm:!px-3"}
                    disabled={saving}
                    onClick={() => setDeleteOpen(true)}
                  >
                    Διαγραφή
                  </button>
                )}
              </div>
              <div className="hidden h-6 w-px shrink-0 bg-[var(--border)] md:block" aria-hidden />
              <button
                type="button"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-transparent text-[var(--text-muted)] transition-colors duration-200 hover:border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] hover:text-[var(--danger)] md:ml-0"
                title="Αποεπιλογή όλων"
                aria-label="Αποεπιλογή όλων"
                onClick={() => setSelected(new Set())}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteOpen && isAdmin && (
        <CenteredModal
          open
          onClose={() => setDeleteOpen(false)}
          title="Μαζική διαγραφή"
          ariaLabel="Μαζική διαγραφή"
          sheetOnMobile
          className="!max-w-md"
          footer={
            <>
              <button type="button" className={lux.btnSecondary} onClick={() => setDeleteOpen(false)} disabled={saving}>
                Άκυρο
              </button>
              <button type="button" className={lux.btnDanger} disabled={saving} onClick={() => void postBulk("delete", "")}>
                Διαγραφή
              </button>
            </>
          }
        >
          <p className="text-sm text-[var(--text-secondary)]">
            Να διαγραφούν οριστικά {selectedIds.length} επαφές; Αυτό δεν ανακαλείται.
          </p>
        </CenteredModal>
      )}

      {openCreate && <CreateContactModal groups={groups} onClose={() => setOpenCreate(false)} onSaved={load} />}
    </div>
  );
}

function CreateContactModal({
  groups,
  onClose,
  onSaved,
}: {
  groups: ContactGroupRow[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    father_name: "",
    mother_name: "",
    phone: "",
    phone2: "",
    landline: "",
    email: "",
    area: "",
    age: "",
    gender: "",
    occupation: "",
    source: "",
    political_stance: "",
    municipality: "",
    electoral_district: "",
    toponym: "",
    spouse_name: "",
    nickname: "",
    name_day: "",
    birthday: "",
    priority: "Medium",
    influence: false,
    notes: "",
    tags: "",
    group_id: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [conflict, setConflict] = useState<{
    phoneMatch: { id: string; name: string } | null;
    nameMatch: { id: string; name: string } | null;
  } | null>(null);
  const { showToast } = useFormToast();

  const buildPayload = () => ({
    ...form,
    phone: form.phone.trim() || null,
    phone2: form.phone2.trim() || null,
    landline: form.landline.trim() || null,
    age: form.age ? Number(form.age) : null,
    tags: form.tags
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
    municipality: form.municipality || null,
    electoral_district: form.electoral_district || null,
    toponym: form.toponym || null,
    father_name: form.father_name.trim() || null,
    mother_name: form.mother_name.trim() || null,
    spouse_name: form.spouse_name || null,
    nickname: form.nickname || null,
    name_day: form.name_day || null,
    birthday: form.birthday || null,
    call_status: "Pending",
    group_id: form.group_id || null,
  });

  const postCreate = async () => {
    const res = await fetchWithTimeout("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload()),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(j.error ?? "Σφάλμα αποθήκευσης");
    }
    setConflict(null);
    await onSaved();
    showToast("Η επαφή αποθηκεύτηκε επιτυχώς.", "success");
    onClose();
  };

  const save = async () => {
    setFieldErrors({});
    const err: Record<string, string> = {};
    if (!form.first_name.trim()) err.first_name = "Υποχρεωτικό";
    if (!form.last_name.trim()) err.last_name = "Υποχρεωτικό";
    if (!form.phone.trim()) err.phone = "Υποχρεωτικό";
    if (!form.municipality.trim()) err.municipality = "Υποχρεωτικό";
    if (Object.keys(err).length) {
      setFieldErrors(err);
      showToast("Συμπληρώστε τα υποχρεωτικά πεδία.", "error");
      return;
    }
    const qs = new URLSearchParams({
      phone: form.phone.trim(),
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
    });
    setSubmitting(true);
    try {
      const res = await fetchWithTimeout(`/api/contacts/precheck?${qs.toString()}`);
      const j = (await res.json()) as {
        phoneMatch: { id: string; name: string } | null;
        nameMatch: { id: string; name: string } | null;
      };
      if (j.phoneMatch || j.nameMatch) {
        setConflict({ phoneMatch: j.phoneMatch, nameMatch: j.nameMatch });
        return;
      }
      await postCreate();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Σφάλμα αποθήκευσης", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const onContinueAfterConflict = async () => {
    setSubmitting(true);
    setConflict(null);
    try {
      await postCreate();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Σφάλμα αποθήκευσης", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const openExistingId = conflict
    ? conflict.phoneMatch?.id ?? conflict.nameMatch?.id
    : null;

  const onBlurRequired = (field: "first_name" | "last_name" | "phone" | "municipality") => () => {
    const v = String(form[field]).trim();
    setFieldErrors((p) => {
      const next = { ...p };
      if (!v) next[field] = "Υποχρεωτικό";
      else delete next[field];
      return next;
    });
  };

  return (
    <>
    <CenteredModal
      open
      onClose={onClose}
      title="Νέα Επαφή"
      ariaLabel="Νέα επαφή"
      sheetOnMobile
      className="!max-w-[680px]"
      footer={
        <>
          <button type="button" onClick={onClose} className={lux.btnSecondary} disabled={submitting}>
            Άκυρο
          </button>
          <FormSubmitButton type="button" loading={submitting} variant="gold" onClick={() => void save()}>
            Αποθήκευση
          </FormSubmitButton>
        </>
      }
    >
        <div className="mx-auto mb-2 h-1 w-11 shrink-0 rounded-full bg-[var(--border)] md:hidden" role="presentation" />
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              label="Μικρό Όνομα"
              required
              error={fieldErrors.first_name}
              value={form.first_name}
              placeholder="Εισάγετε μικρό όνομα"
              onChange={(v) => setForm({ ...form, first_name: v })}
              onBlur={onBlurRequired("first_name")}
            />
            <FormField
              label="Επίθετο"
              required
              error={fieldErrors.last_name}
              value={form.last_name}
              placeholder="Εισάγετε επίθετο"
              onChange={(v) => setForm({ ...form, last_name: v })}
              onBlur={onBlurRequired("last_name")}
            />
            <FormField
              label="Πατρώνυμο"
              value={form.father_name}
              placeholder="Όνομα πατέρα"
              onChange={(v) => setForm({ ...form, father_name: v })}
            />
            <FormField
              label="Μητρώνυμο"
              value={form.mother_name}
              placeholder="Όνομα μητέρας"
              onChange={(v) => setForm({ ...form, mother_name: v })}
            />
            <FormField
              label="Κινητό 1"
              required
              error={fieldErrors.phone}
              value={form.phone}
              placeholder="π.χ. 6912345678"
              onChange={(v) => setForm({ ...form, phone: v })}
              onBlur={onBlurRequired("phone")}
            />
            <FormField
              label="Κινητό 2"
              value={form.phone2}
              placeholder="Προαιρετικό"
              onChange={(v) => setForm({ ...form, phone2: v })}
            />
            <FormField
              label="Σταθερό"
              value={form.landline}
              placeholder="π.χ. 2101234567"
              onChange={(v) => setForm({ ...form, landline: v })}
            />
            <div
              className="md:col-span-2"
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  onBlurRequired("municipality")();
                }
              }}
            >
              <AitoloakarnaniaLocationFields
                values={{
                  municipality: form.municipality,
                  electoral_district: form.electoral_district,
                  toponym: form.toponym,
                }}
                errorMunicipality={fieldErrors.municipality}
                onChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    municipality: v.municipality ?? "",
                    electoral_district: v.electoral_district ?? "",
                    toponym: v.toponym ?? "",
                  }))
                }
              />
            </div>
            <div className="md:col-span-2">
              <label className={lux.label} htmlFor="new-contact-group">
                Ομάδα
              </label>
              <HqSelect id="new-contact-group" value={form.group_id} onChange={(e) => setForm({ ...form, group_id: e.target.value })}>
                <option value="">— Χωρίς ομάδα —</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                    {g.year != null ? ` (${g.year})` : ""}
                  </option>
                ))}
              </HqSelect>
            </div>
            <FormField label="Email" value={form.email} placeholder="email@example.com" onChange={(v) => setForm({ ...form, email: v })} />
            <FormField label="Περιοχή" value={form.area} placeholder="Περιοχή / περιφέρεια" onChange={(v) => setForm({ ...form, area: v })} />
            <FormField
              label="Υποκοριστικό"
              value={form.nickname}
              placeholder="Προαιρετικό"
              onChange={(v) => setForm({ ...form, nickname: v })}
            />
            <FormField label="Όνομα συζύγου" value={form.spouse_name} onChange={(v) => setForm({ ...form, spouse_name: v })} />
            <FormField label="Γιορτή" type="date" value={form.name_day} onChange={(v) => setForm({ ...form, name_day: v })} />
            <FormField label="Γενέθλια" type="date" value={form.birthday} onChange={(v) => setForm({ ...form, birthday: v })} />
            <FormField label="Ηλικία" value={form.age} placeholder="Έτη" onChange={(v) => setForm({ ...form, age: v })} />
            <SelectFormField
              label="Φύλο"
              value={form.gender}
              onChange={(v) => setForm({ ...form, gender: v })}
              options={["Άνδρας", "Γυναίκα", "Άλλο"]}
              allowEmpty
              emptyLabel="Επιλέξτε…"
            />
            <FormField label="Επάγγελμα" value={form.occupation} onChange={(v) => setForm({ ...form, occupation: v })} />
            <SelectFormField
              label="Πηγή επαφής"
              value={form.source}
              onChange={(v) => setForm({ ...form, source: v })}
              options={["Εκδήλωση", "Παλιός ψηφοφόρος", "Φίλος", "Άλλο"]}
              allowEmpty
              emptyLabel="Επιλέξτε…"
            />
            <SelectFormField
              label="Πολιτική τοποθέτηση"
              value={form.political_stance}
              onChange={(v) => setForm({ ...form, political_stance: v })}
              options={["Κεντροδεξιός", "Αριστερός", "Ακροδεξιός", "Αναποφάσιστος", "Άλλο"]}
              allowEmpty
              emptyLabel="Επιλέξτε…"
            />
            <SelectFormField
              label="Προτεραιότητα"
              value={form.priority}
              onChange={(v) => setForm({ ...form, priority: v })}
              options={["High", "Medium", "Low"]}
              valueLabels={{ High: "Υψηλή", Medium: "Μεσαία", Low: "Χαμηλή" }}
            />
            <div>
              <label className={lux.label}>Επιρροή</label>
              <HqSelect value={form.influence ? "Ναι" : "Όχι"} onChange={(e) => setForm({ ...form, influence: e.target.value === "Ναι" })}>
                <option>Όχι</option>
                <option>Ναι</option>
              </HqSelect>
            </div>
            <div className="md:col-span-2">
              <label className={lux.label}>Ετικέτες (διαχωρισμός με κόμμα)</label>
              <input
                className={lux.input}
                placeholder="π.χ. τοπική, πεδίο"
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <label className={lux.label}>Σημειώσεις</label>
              <textarea
                className={lux.textarea}
                placeholder="Καταγράψτε σημαντικές πληροφορίες..."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
    </CenteredModal>

    {conflict && (
      <CenteredModal
        open
        onClose={() => setConflict(null)}
        title="Πιθανή σύγκρουση"
        ariaLabel="Πιθανή σύγκρουση"
        className="!max-w-md"
        footer={
          <>
            <button type="button" onClick={() => setConflict(null)} className={lux.btnSecondary + " w-full sm:w-auto"}>
              Άκυρο
            </button>
            {openExistingId && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  router.push(`/contacts/${openExistingId}`);
                }}
                className={lux.btnGold + " w-full sm:w-auto"}
              >
                Άνοιγμα υπάρχουσας επαφής
              </button>
            )}
            <FormSubmitButton
              type="button"
              loading={submitting}
              variant="gold"
              className="w-full sm:w-auto"
              onClick={() => void onContinueAfterConflict()}
            >
              Διαφορετικό άτομο — συνέχεια
            </FormSubmitButton>
          </>
        }
      >
          <div className="space-y-3">
          {conflict.phoneMatch && (
            <p className="text-sm text-[var(--text-primary)]">
              Αυτός ο αριθμός φαίνεται να ανήκει ήδη στον{" "}
              <span className="font-semibold">{conflict.phoneMatch.name}</span>. Διαφορετικό άτομο ή διπλότυπο;
            </p>
          )}
          {conflict.nameMatch && (
            <p className="text-sm text-[var(--text-primary)]">
              Υπάρχει ήδη επαφή με ίδιο όνομα/επίθετο:{" "}
              <span className="font-semibold">{conflict.nameMatch.name}</span>
            </p>
          )}
          </div>
      </CenteredModal>
    )}
    </>
  );
}

export default function ContactsPageWithSuspense() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center p-6 text-sm text-[var(--text-muted)]">Φόρτωση…</div>
      }
    >
      <CrmErrorBoundary title="Δεν φορτώθηκε η λίστα επαφών.">
        <ContactsPage />
      </CrmErrorBoundary>
    </Suspense>
  );
}

function FormField({
  label,
  value,
  onChange,
  required,
  type,
  error,
  placeholder,
  onBlur,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  error?: string;
  placeholder?: string;
  onBlur?: () => void;
}) {
  return (
    <div className="space-y-0">
      <label className={lux.label}>
        {label}
        {required && <span className="ml-0.5 text-red-500" aria-hidden>*</span>}
      </label>
      <input
        className={[lux.input, error ? lux.inputError : ""].join(" ")}
        value={value}
        type={type ?? "text"}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${label}-err` : undefined}
      />
      {error && (
        <p id={`${label}-err`} className="mt-1 text-xs text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function SelectFormField({
  label,
  value,
  onChange,
  options,
  valueLabels,
  allowEmpty,
  emptyLabel = "—",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  valueLabels?: Record<string, string>;
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  return (
    <div>
      <label className={lux.label}>{label}</label>
      <HqSelect value={value} onChange={(e) => onChange(e.target.value)}>
        {allowEmpty && <option value="">{emptyLabel}</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {valueLabels?.[o] ?? o}
          </option>
        ))}
      </HqSelect>
    </div>
  );
}

