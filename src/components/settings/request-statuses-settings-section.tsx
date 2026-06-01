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

export function RequestStatusesSettingsSection() {
  const [rows, setRows] = useState<RequestStatusWithCount[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [transferFrom, setTransferFrom] = useState<RequestStatusWithCount | null>(null);

  const load = useCallback(async () => {
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

  useEffect(() => {
    void load();
  }, [load]);

  const byStatus = useMemo(() => {
    const m = new Map<RequestStatus, RequestStatusWithCount>();
    for (const r of rows) m.set(r.status, r);
    return m;
  }, [rows]);

  const displayRows = REQUEST_STATUSES.map((status) => ({
    status,
    request_count: byStatus.get(status)?.request_count ?? 0,
  }));

  return (
    <section className={lux.card}>
      <h2 className={lux.pageTitle + " mb-1"}>Καταστάσεις Αιτημάτων</h2>
      <p className="mb-4 text-sm text-[var(--text-secondary)]">
        Οι τέσσερις καταστάσεις Lighthouse είναι σταθερές — μπορείτε να μεταφέρετε αιτήματα σε άλλη κατάσταση.
      </p>

      {loadErr && <p className="mb-2 text-sm text-amber-200">{loadErr}</p>}

      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">Φόρτωση…</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {displayRows.map((row) => (
            <div
              key={row.status}
              className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/40 p-4"
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
                <span className="shrink-0 text-lg font-semibold tabular-nums text-[var(--text-primary)]">
                  {row.request_count}
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)]">αιτήματα</p>
              <button
                type="button"
                className={lux.btnSecondary + " w-full !py-2 text-xs"}
                disabled={row.request_count === 0}
                onClick={() => setTransferFrom({ status: row.status, request_count: row.request_count })}
              >
                Μεταφορά αιτημάτων
              </button>
            </div>
          ))}
        </div>
      )}

      {transferFrom && (
        <RequestStatusTransferModal
          from={transferFrom}
          statuses={displayRows}
          onClose={() => setTransferFrom(null)}
          onTransferred={async () => {
            setTransferFrom(null);
            await load();
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
          <HqSelect id="req-status-to" className={lux.select + " mt-1"} value={to} onChange={(e) => setTo(e.target.value as RequestStatus)}>
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
