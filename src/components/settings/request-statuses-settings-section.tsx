"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { lux } from "@/lib/luxury-styles";
import { CenteredModal } from "@/components/ui/centered-modal";
import { HqSelect } from "@/components/ui/hq-select";
import { HqLabel } from "@/components/ui/hq-form-primitives";
import { useFormToast } from "@/contexts/form-toast-context";
import type { RequestStatusWithCount } from "@/lib/request-admin";
import {
  REQUEST_STATUS_BADGE_CLASSES,
  REQUEST_STATUSES,
  type RequestStatus,
} from "@/lib/request-statuses";
import {
  getDefaultRequestStatusColors,
  type RequestStatusColorsMap,
} from "@/lib/request-status-colors";
import { invalidateRequestStatusColorsCache } from "@/hooks/use-request-status-colors";
import { requestCardStatusStyle } from "@/lib/request-status-card-style";

const COLOR_PRESETS = [
  "#FEF3C7",
  "#D1FAE5",
  "#FEE2E2",
  "#F3F4F6",
  "#DBEAFE",
  "#E9D5FF",
  "#FCE7F3",
  "#FFEDD5",
] as const;

export function RequestStatusesSettingsSection() {
  const { showToast } = useFormToast();
  const [rows, setRows] = useState<RequestStatusWithCount[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [transferFrom, setTransferFrom] = useState<RequestStatusWithCount | null>(null);
  const [colors, setColors] = useState<RequestStatusColorsMap>(getDefaultRequestStatusColors);
  const [colorsLoading, setColorsLoading] = useState(true);
  const [savingColors, setSavingColors] = useState(false);

  const loadCounts = useCallback(async () => {
    setLoadErr(null);
    setLoading(true);
    try {
      const res = await fetchWithTimeout("/api/admin/request-statuses/with-counts");
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setRows([]);
        setLoadErr(j.error ?? "Φόρτωση καταστάσεων");
        return;
      }
      const data = (await res.json()) as RequestStatusWithCount[];
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setLoadErr("Σφάλμα δικτύου");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadColors = useCallback(async () => {
    setColorsLoading(true);
    try {
      const res = await fetchWithTimeout("/api/crm-settings");
      if (!res.ok) return;
      const j = (await res.json()) as { settings?: { request_status_colors?: RequestStatusColorsMap } };
      if (j.settings?.request_status_colors) {
        setColors(j.settings.request_status_colors);
      }
    } catch {
      /* defaults */
    } finally {
      setColorsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCounts();
    void loadColors();
  }, [loadCounts, loadColors]);

  const byStatus = useMemo(() => {
    const m = new Map<RequestStatus, RequestStatusWithCount>();
    for (const r of rows) m.set(r.status, r);
    return m;
  }, [rows]);

  const displayRows = REQUEST_STATUSES.map((status) => ({
    status,
    request_count: byStatus.get(status)?.request_count ?? 0,
  }));

  const patchColor = (status: RequestStatus, hex: string) => {
    setColors((prev) => ({ ...prev, [status]: hex }));
  };

  const saveColors = async () => {
    setSavingColors(true);
    try {
      const res = await fetchWithTimeout("/api/crm-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_status_colors: colors }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        showToast(j.error ?? "Αποτυχία αποθήκευσης", "error");
        return;
      }
      invalidateRequestStatusColorsCache();
      showToast("Τα χρώματα καταστάσεων αποθηκεύτηκαν.", "success");
      await loadColors();
    } catch {
      showToast("Σφάλμα δικτύου", "error");
    } finally {
      setSavingColors(false);
    }
  };

  return (
    <section className={lux.card}>
      <h2 className={lux.pageTitle + " mb-1"}>Καταστάσεις Αιτημάτων</h2>
      <p className="mb-4 text-sm text-[var(--text-secondary)]">
        Οι τέσσερις καταστάσεις Lighthouse είναι σταθερές — ρυθμίστε τα χρώμα των καρτών αιτημάτων και
        μεταφέρετε αιτήματα σε άλλη κατάσταση.
      </p>

      {loadErr && <p className="mb-2 text-sm text-amber-200">{loadErr}</p>}

      {loading || colorsLoading ? (
        <p className="text-sm text-[var(--text-muted)]">Φόρτωση…</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {displayRows.map((row) => {
              const preview = requestCardStatusStyle(row.status, colors);
              return (
                <div
                  key={row.status}
                  className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/40 p-4"
                  style={{
                    borderLeftWidth: 4,
                    borderLeftColor: preview.borderLeftColor,
                    backgroundColor: preview.backgroundColor,
                    color: preview.color,
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={[
                        "inline-flex max-w-full items-center rounded-md px-2 py-1 text-xs font-medium",
                        REQUEST_STATUS_BADGE_CLASSES[row.status],
                      ].join(" ")}
                    >
                      {row.status}
                    </span>
                    <span className="shrink-0 text-lg font-semibold tabular-nums">{row.request_count}</span>
                  </div>
                  <p className="text-xs opacity-80">αιτήματα</p>

                  <div className="rounded-lg border border-[var(--border)]/60 bg-[var(--bg-card)]/80 p-3 text-[var(--text-primary)]">
                    <p className="mb-2 text-xs font-medium text-[var(--text-secondary)]">Χρώμα κάρτας</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="color"
                        aria-label={`Χρώμα για ${row.status}`}
                        value={colors[row.status]}
                        onChange={(e) => patchColor(row.status, e.target.value.toUpperCase())}
                        className="h-9 w-12 cursor-pointer rounded border border-[var(--border)] bg-transparent p-0.5"
                      />
                      <input
                        type="text"
                        value={colors[row.status]}
                        onChange={(e) => patchColor(row.status, e.target.value)}
                        className={lux.input + " !w-28 !py-1.5 font-mono text-xs uppercase"}
                        spellCheck={false}
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {COLOR_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          title={preset}
                          aria-label={`Προεπιλογή ${preset}`}
                          className="h-6 w-6 rounded border border-[var(--border)] shadow-sm transition hover:scale-110"
                          style={{ backgroundColor: preset }}
                          onClick={() => patchColor(row.status, preset)}
                        />
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    className={lux.btnSecondary + " w-full !py-2 text-xs"}
                    disabled={row.request_count === 0}
                    onClick={() =>
                      setTransferFrom({ status: row.status, request_count: row.request_count })
                    }
                  >
                    Μεταφορά αιτημάτων
                  </button>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              className={lux.btnPrimary}
              disabled={savingColors}
              onClick={() => void saveColors()}
            >
              {savingColors ? "Αποθήκευση…" : "Αποθήκευση χρωμάτων"}
            </button>
          </div>
        </>
      )}

      {transferFrom && (
        <RequestStatusTransferModal
          from={transferFrom}
          statuses={displayRows}
          onClose={() => setTransferFrom(null)}
          onTransferred={async () => {
            setTransferFrom(null);
            await loadCounts();
          }}
        />
      )}
    </section>
  );
}

function RequestStatusTransferModal({
  from,
  statuses,
  onClose,
  onTransferred,
}: {
  from: RequestStatusWithCount;
  statuses: RequestStatusWithCount[];
  onClose: () => void;
  onTransferred: () => Promise<void>;
}) {
  const { showToast } = useFormToast();
  const [to, setTo] = useState<RequestStatus | "">("");
  const [busy, setBusy] = useState(false);

  const options = useMemo(
    () => statuses.filter((s) => s.status !== from.status),
    [statuses, from.status],
  );

  useEffect(() => {
    setTo(options[0]?.status ?? "");
  }, [from.status, options]);

  const submit = async () => {
    if (!to) {
      showToast("Επιλέξτε προορισμό.", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await fetchWithTimeout("/api/admin/request-statuses/transfer", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: from.status, to }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; transferred?: number };
      if (!res.ok) {
        showToast(j.error ?? "Σφάλμα", "error");
        return;
      }
      showToast(`Μεταφέρθηκαν ${j.transferred ?? 0} αιτήματα.`, "success");
      await onTransferred();
    } finally {
      setBusy(false);
    }
  };

  return (
    <CenteredModal
      open
      onClose={onClose}
      title="Μεταφορά αιτημάτων"
      ariaLabel="Μεταφορά αιτημάτων ανά κατάσταση"
      className="!max-w-md"
      footer={
        <>
          <button type="button" onClick={onClose} className={lux.btnSecondary} disabled={busy}>
            Άκυρο
          </button>
          <button type="button" onClick={() => void submit()} className={lux.btnPrimary} disabled={busy || !to}>
            {busy ? "…" : `Μεταφορά ${from.request_count} αιτημάτων`}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-[var(--text-secondary)]">
          Από: <strong className="text-[var(--text-primary)]">{from.status}</strong>
        </p>
        <div>
          <HqLabel htmlFor="req-status-to">Προς</HqLabel>
          <HqSelect
            id="req-status-to"
            className={lux.select + " mt-1"}
            value={to}
            onChange={(e) => setTo(e.target.value as RequestStatus)}
          >
            {options.map((s) => (
              <option key={s.status} value={s.status}>
                {s.status}
              </option>
            ))}
          </HqSelect>
        </div>
      </div>
    </CenteredModal>
  );
}
