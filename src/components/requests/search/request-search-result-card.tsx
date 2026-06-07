"use client";

import { useRequestStatusColors } from "@/hooks/use-request-status-colors";
import { formatDateAthens } from "@/lib/date-format";
import { requestCardStatusStyle } from "@/lib/request-status-card-style";
import type { RequestStatusColorsMap } from "@/lib/request-status-colors";
import { getRequestStatusBadgeClasses, normalizeRequestStatus } from "@/lib/request-statuses";
import { cn } from "@/lib/utils";

export type RequestSearchResult = {
  id: string;
  request_code: string | null;
  title: string;
  description: string | null;
  category: string | null;
  status: string | null;
  created_at: string | null;
  contacts: { first_name: string; last_name: string; phone?: string | null } | null;
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return formatDateAthens(iso, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function contactLabel(c: RequestSearchResult["contacts"]) {
  if (!c) return "—";
  return `${c.first_name} ${c.last_name}`.trim() || "—";
}

export function RequestSearchResultCard({
  request: r,
  onNavigate,
  statusColors: statusColorsProp,
}: {
  request: RequestSearchResult;
  onNavigate: () => void;
  statusColors?: RequestStatusColorsMap;
}) {
  const { colors: fetchedColors } = useRequestStatusColors();
  const statusColors = statusColorsProp ?? fetchedColors;
  const status = normalizeRequestStatus(r.status);
  const badge = getRequestStatusBadgeClasses(status);
  const cardStyle = requestCardStatusStyle(status, statusColors);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onNavigate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onNavigate();
        }
      }}
      className="group/request-card relative flex w-full min-w-0 cursor-pointer gap-3 border-b border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors duration-200 first:rounded-t-xl last:rounded-b-xl last:border-b-0 hover:bg-[color-mix(in_srgb,var(--accent)_5%,var(--bg-elevated))]"
    >
      <div
        className="w-1 shrink-0 self-stretch rounded-full"
        style={{ backgroundColor: cardStyle.borderLeftColor }}
        aria-hidden
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {r.request_code ? (
              <span className="font-mono text-[10px] text-[var(--text-muted)]">{r.request_code}</span>
            ) : null}
            {r.category?.trim() ? (
              <div className="mt-0.5 truncate text-sm font-bold text-[var(--text-primary)]">{r.category}</div>
            ) : (
              <div className="mt-0.5 truncate text-sm font-bold text-[var(--text-primary)]">{r.title}</div>
            )}
          </div>
          <span className={cn("inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold", badge)}>
            {status}
          </span>
        </div>

        {r.category?.trim() && r.title ? (
          <p className="line-clamp-1 text-sm text-[var(--text-secondary)]">{r.title}</p>
        ) : null}

        <div className="text-sm text-[var(--text-secondary)]">{contactLabel(r.contacts)}</div>
      </div>

      <div className="flex shrink-0 flex-col items-end justify-end self-stretch text-right">
        <span className="text-[11px] text-[var(--text-muted)]">{formatDate(r.created_at)}</span>
      </div>
    </div>
  );
}
