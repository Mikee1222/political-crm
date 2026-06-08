"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { formatDateTimeAthens, formatTimeAthens, parseInstant } from "@/lib/date-format";

export interface AISummaryCardProps {
  entityType: "contact" | "request" | "scheduler";
  entityId: string;
  entityName?: string;
  apiEndpoint: string;
  initialSummary?: string;
  initialUpdatedAt?: string | null;
  compact?: boolean;
  canManage?: boolean;
  className?: string;
}

export function AISummaryCard({
  entityType,
  entityId,
  apiEndpoint,
  initialSummary,
  initialUpdatedAt,
  compact = false,
  canManage = true,
  className = "",
}: AISummaryCardProps) {
  const [summary, setSummary] = useState(initialSummary ?? "");
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(!compact);
  const [copied, setCopied] = useState(false);
  const [cached, setCached] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(() => {
    const d = parseInstant(initialUpdatedAt);
    return d ?? null;
  });
  const [error, setError] = useState("");

  const applySummary = useCallback((text: string, updatedAt?: string | null, fromCache = false) => {
    setSummary(text);
    const d = parseInstant(updatedAt) ?? new Date();
    setGeneratedAt(d);
    setCached(fromCache);
    setExpanded(true);
  }, []);

  useEffect(() => {
    if (!canManage || initialSummary) return;
    let cancelled = false;
    void (async () => {
      try {
        const cacheUrl =
          entityType === "scheduler"
            ? `${apiEndpoint}?requestId=${encodeURIComponent(entityId)}`
            : apiEndpoint;
        const res = await fetchWithTimeout(cacheUrl);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          summary?: string | null;
          updated_at?: string | null;
          cached?: boolean;
        };
        if (cancelled || !data.summary) return;
        applySummary(data.summary, data.updated_at, Boolean(data.cached));
      } catch {
        /* silent */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiEndpoint, applySummary, canManage, entityId, entityType, initialSummary]);

  const generate = async () => {
    if (!canManage) return;
    setLoading(true);
    setError("");
    try {
      const init: RequestInit = { method: "POST" };
      if (entityType === "scheduler") {
        init.headers = { "Content-Type": "application/json" };
        init.body = JSON.stringify({ requestId: entityId });
      }
      const res = await fetchWithTimeout(apiEndpoint, init);
      const data = (await res.json().catch(() => ({}))) as {
        summary?: string;
        updated_at?: string | null;
        cached?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Σφάλμα κατά τη δημιουργία σύνοψης");
        return;
      }
      if (data.summary) {
        applySummary(data.summary, data.updated_at, false);
      } else {
        setError("Δεν επιστράφηκε σύνοψη");
      }
    } catch {
      setError("Σφάλμα κατά τη δημιουργία σύνοψης");
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Αποτυχία αντιγραφής");
    }
  };

  if (!canManage) return null;

  const timeLabel = generatedAt
    ? formatTimeAthens(generatedAt, { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] ${className}`}
    >
      <div
        className="h-0.5 w-full"
        style={{
          background:
            "linear-gradient(90deg, transparent, var(--accent-gold), var(--accent-gold-light), var(--accent-gold), transparent)",
        }}
      />

      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div
            className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
              loading ? "animate-pulse" : ""
            }`}
            style={{
              background: "linear-gradient(135deg, var(--accent-gold-light), var(--accent-gold))",
            }}
          >
            <Sparkles className="h-3.5 w-3.5 text-[var(--text-badge-on-gold)]" aria-hidden />
            {loading ? (
              <div
                className="absolute inset-0 animate-ping rounded-full"
                style={{ background: "color-mix(in srgb, var(--accent-gold) 30%, transparent)" }}
              />
            ) : null}
          </div>
          <span className="text-sm font-semibold text-[var(--text-primary)]">AI Σύνοψη</span>
          {cached && generatedAt ? (
            <span className="text-[10px] text-[var(--text-muted)]">
              Αποθηκευμένη σύνοψη · {formatDateTimeAthens(generatedAt)}
            </span>
          ) : timeLabel ? (
            <span className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
              <Clock className="h-2.5 w-2.5" aria-hidden />
              {timeLabel}
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {summary ? (
            <>
              <button
                type="button"
                onClick={() => void copy()}
                className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                title="Αντιγραφή"
              >
                {copied ? (
                  <CheckCircle className="h-3.5 w-3.5 text-[var(--success)]" aria-hidden />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                )}
              </button>
              <button
                type="button"
                onClick={() => void generate()}
                disabled={loading}
                className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] disabled:opacity-50"
                title="Ανανέωση"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
              </button>
              {compact ? (
                <button
                  type="button"
                  onClick={() => setExpanded((e) => !e)}
                  className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]"
                  aria-expanded={expanded}
                >
                  {expanded ? (
                    <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                  )}
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {!summary && !loading ? (
        <div className="px-4 pb-4">
          <button
            type="button"
            onClick={() => void generate()}
            className="group flex w-full items-center justify-center gap-2 rounded-xl border border-dashed py-3 transition-all hover:bg-[color-mix(in_srgb,var(--accent-gold)_5%,transparent)]"
            style={{ borderColor: "color-mix(in srgb, var(--accent-gold) 40%, var(--border))" }}
          >
            <Sparkles className="h-4 w-4 text-[var(--accent-gold)] group-hover:animate-pulse" aria-hidden />
            <span className="text-sm font-medium text-[var(--accent-gold)]">Δημιουργία AI Σύνοψης</span>
          </button>
        </div>
      ) : null}

      {loading && !summary ? (
        <div className="space-y-2 px-4 pb-4">
          {[100, 85, 90, 70].map((w, i) => (
            <div
              key={i}
              className="h-3 animate-pulse rounded-full bg-[var(--bg-elevated)]"
              style={{ width: `${w}%` }}
            />
          ))}
        </div>
      ) : null}

      {summary && (expanded || !compact) ? (
        <div className="px-4 pb-4">
          <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{summary}</p>
          <div className="mt-3 flex items-center justify-between border-t border-[var(--border)]/50 pt-3">
            <span className="text-[10px] text-[var(--text-muted)]">Παράγεται από Claude AI</span>
            <button
              type="button"
              onClick={() => void generate()}
              disabled={loading}
              className="text-[10px] text-[var(--accent-gold)] hover:underline disabled:opacity-50"
            >
              {loading ? "Ανανέωση…" : "Ανανέωση σύνοψης"}
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="px-4 pb-4">
          <p className="text-xs text-[var(--danger)]">{error}</p>
          <button
            type="button"
            onClick={() => void generate()}
            className="mt-1 text-xs text-[var(--accent-gold)] hover:underline"
          >
            Δοκίμασε ξανά
          </button>
        </div>
      ) : null}
    </div>
  );
}
