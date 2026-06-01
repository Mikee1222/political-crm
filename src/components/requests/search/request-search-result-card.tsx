"use client";

import {
  normalizeRequestStatus,
  REQUEST_STATUS_BADGE_CLASSES,
  type RequestStatus,
} from "@/lib/request-statuses";
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
  try {
    return new Date(iso).toLocaleDateString("el-GR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function contactLabel(c: RequestSearchResult["contacts"]) {
  if (!c) return "—";
  return `${c.first_name} ${c.last_name}`.trim() || "—";
}

export function RequestSearchResultCard({
  request: r,
  onNavigate,
}: {
  request: RequestSearchResult;
  onNavigate: () => void;
}) {
  const status = normalizeRequestStatus(r.status);
  const badge =
    REQUEST_STATUS_BADGE_CLASSES[status as RequestStatus] ??
    "bg-[var(--bg-elevated)] text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--border)]";
  const desc = r.description?.trim();

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
      className="group/request-card relative flex w-full min-w-0 cursor-pointer flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-[var(--card-shadow)] transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-px hover:border-[color-mix(in_srgb,var(--accent-gold)_48%,var(--border))] hover:shadow-[var(--card-shadow-hover)] sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {r.request_code ? (
            <span className="font-mono text-[11px] text-[var(--text-muted)]">{r.request_code}</span>
          ) : null}
          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold", badge)}>
            {status}
          </span>
        </div>
        <h3 className="mt-1 truncate text-[15px] font-bold text-[var(--text-primary)]">{r.title}</h3>
        {desc ? (
          <p className="mt-1 line-clamp-2 text-sm text-[var(--text-muted)]">{desc}</p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)]">
          {r.category?.trim() ? (
            <span className="inline-flex max-w-full truncate rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-0.5 font-medium text-[var(--text-secondary)]">
              {r.category}
            </span>
          ) : null}
          <span>{contactLabel(r.contacts)}</span>
        </div>
      </div>
      <div className="shrink-0 text-right text-[11px] text-[var(--text-muted)] sm:pl-3">
        {formatDate(r.created_at)}
      </div>
    </div>
  );
}
