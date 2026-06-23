"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { lux } from "@/lib/luxury-styles";
import { CenteredModal } from "@/components/ui/centered-modal";
import { HqSelect } from "@/components/ui/hq-select";
import { HqFieldError, HqLabel } from "@/components/ui/hq-form-primitives";
import { useFormToast } from "@/contexts/form-toast-context";
import { requiredText } from "@/lib/form-validation";
import { ClientPaginationBar } from "@/components/ui/client-pagination-bar";
import { useClientPagination } from "@/hooks/use-client-pagination";
import type { RequestCategoryWithCount } from "@/lib/request-admin";

export function RequestCategoriesSettingsSection() {
  const [rows, setRows] = useState<RequestCategoryWithCount[]>([]);
  const [q, setQ] = useState("");
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#6B7280");
  const [addBusy, setAddBusy] = useState(false);
  const [nameErr, setNameErr] = useState<string | null>(null);
  const [transferFrom, setTransferFrom] = useState<RequestCategoryWithCount | null>(null);
  const { showToast } = useFormToast();

  const load = useCallback(async () => {
    setLoadErr(null);
    setLoading(true);
    try {
      const res = await fetchWithTimeout("/api/admin/request-categories/with-counts");
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setRows([]);
        setLoadErr(j.error ?? "Φόρτωση κατηγοριών");
        return;
      }
      const data = (await res.json()) as RequestCategoryWithCount[];
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

  const { pageItems, page, totalPages, totalCount, goToPrev, goToNext } = useClientPagination({
    items: rows,
    pageSize: 50,
    searchQuery: q,
    getSearchText: (r) => r.name,
  });

  const addCategory = async () => {
    setNameErr(null);
    const req = requiredText(newName, "όνομα");
    if (req) {
      setNameErr(req);
      showToast(req, "error");
      return;
    }
    setAddBusy(true);
    try {
      const res = await fetchWithTimeout("/api/admin/request-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), color: newColor.trim() }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        showToast(j.error ?? "Σφάλμα", "error");
        return;
      }
      setNewName("");
      setNewColor("#6B7280");
      showToast("Η κατηγορία προστέθηκε.", "success");
      await load();
    } finally {
      setAddBusy(false);
    }
  };

  const deleteCategory = async (row: RequestCategoryWithCount) => {
    if (row.request_count > 0) return;
    if (!confirm(`Διαγραφή κατηγορίας «${row.name}»;`)) return;
    const res = await fetchWithTimeout(
      `/api/admin/request-categories/${encodeURIComponent(row.name)}`,
      { method: "DELETE" },
    );
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      showToast(j.error ?? "Σφάλμα", "error");
      return;
    }
    showToast("Η κατηγορία διαγράφηκε.", "success");
    await load();
  };

  return (
    <section className={lux.card}>
      <h2 className={lux.pageTitle + " mb-1"}>Κατηγορίες Αιτημάτων</h2>
      <p className="mb-4 text-sm text-[var(--text-secondary)]">
        Διαχείριση κατηγοριών — μεταφορά αιτημάτων, προσθήκη και διαγραφή (μόνο χωρίς συνδεδεμένα αιτήματα). Η στήλη{" "}
        <code className="text-xs">category</code> στα αιτήματα κρατά κείμενο.
      </p>

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="relative min-w-0 max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            className={lux.input + " !h-10 !pl-9"}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Αναζήτηση…"
            aria-label="Φιλτράρισμα πίνακα"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-lg">
          <HqLabel htmlFor="rc-new-name">Νέα κατηγορία</HqLabel>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="rc-new-name"
              className={[lux.input, nameErr ? lux.inputError : "", "!h-10 min-w-0 flex-1"].join(" ")}
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setNameErr(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addCategory();
                }
              }}
              placeholder="Όνομα"
            />
            <input
              type="color"
              className="h-10 w-12 shrink-0 cursor-pointer rounded border border-[var(--border)]"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              aria-label="Χρώμα"
            />
            <button
              type="button"
              disabled={addBusy}
              onClick={() => void addCategory()}
              className={lux.btnPrimary + " shrink-0 !py-2.5"}
            >
              {addBusy ? "…" : "Αποθήκευση"}
            </button>
          </div>
          <HqFieldError>{nameErr}</HqFieldError>
        </div>
      </div>

      {loadErr && <p className="mb-2 text-sm text-amber-200">{loadErr}</p>}

      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">Φόρτωση…</p>
      ) : (
        <div className="space-y-3">
          <div className="w-full min-w-0 overflow-x-auto rounded-lg border border-[var(--border)]">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className={lux.tableHead + " border-b border-[var(--border)]"}>
                  <th className="p-2 pl-3 text-left">Όνομα</th>
                  <th className="p-2 text-right">Αιτήματα</th>
                  <th className="w-56 p-2 pr-3 text-right">Ενέργειες</th>
                </tr>
              </thead>
              <tbody>
                {totalCount === 0 && (
                  <tr>
                    <td colSpan={3} className="p-4 text-center text-[var(--text-muted)]">
                      Δεν βρέθηκαν.
                    </td>
                  </tr>
                )}
                {pageItems.map((r) => (
                  <tr key={r.name} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-elevated)]/50">
                    <td className="p-2 pl-3 font-medium text-[var(--text-primary)]">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="h-3 w-3 shrink-0 rounded-full border border-[var(--border)]"
                          style={{ background: r.color }}
                        />
                        {r.name}
                      </span>
                    </td>
                    <td className="p-2 text-right tabular-nums text-[var(--text-secondary)]">{r.request_count}</td>
                    <td className="p-2 pr-3 text-right">
                      <div className="inline-flex flex-wrap justify-end gap-1">
                        <button
                          type="button"
                          className={lux.btnSecondary + " !px-2 !py-1.5 text-xs"}
                          disabled={r.request_count === 0}
                          onClick={() => setTransferFrom(r)}
                        >
                          Μεταφορά αιτημάτων
                        </button>
                        <button
                          type="button"
                          className={lux.btnDanger + " !px-2 !py-1.5 text-xs"}
                          disabled={r.request_count > 0}
                          title={r.request_count > 0 ? "Υπάρχουν αιτήματα με αυτή την κατηγορία" : undefined}
                          onClick={() => void deleteCategory(r)}
                        >
                          Διαγραφή
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ClientPaginationBar page={page} totalPages={totalPages} onPrev={goToPrev} onNext={goToNext} />
        </div>
      )}

      {transferFrom && (
        <RequestCategoryTransferModal
          from={transferFrom}
          categories={rows}
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

function RequestCategoryTransferModal({
  from,
  categories,
  onClose,
  onTransferred,
}: {
  from: RequestCategoryWithCount;
  categories: RequestCategoryWithCount[];
  onClose: () => void;
  onTransferred: () => Promise<void>;
}) {
  const { showToast } = useFormToast();
  const [toName, setToName] = useState("");
  const [busy, setBusy] = useState(false);

  const options = useMemo(
    () => categories.filter((c) => c.name !== from.name).sort((a, b) => a.name.localeCompare(b.name, "el")),
    [categories, from.name],
  );

  useEffect(() => {
    setToName(options[0]?.name ?? "");
  }, [from.name, options]);

  const submit = async () => {
    if (!toName) {
      showToast("Επιλέξτε προορισμό.", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await fetchWithTimeout("/api/admin/request-categories/transfer", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from_name: from.name, to_name: toName }),
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

  const toLabel = toName;

  return (
    <CenteredModal
      open
      onClose={onClose}
      title="Μεταφορά αιτημάτων"
      ariaLabel="Μεταφορά αιτημάτων ανά κατηγορία"
      className="!max-w-md"
      footer={
        <>
          <button type="button" onClick={onClose} className={lux.btnSecondary} disabled={busy}>
            Άκυρο
          </button>
          <button type="button" onClick={() => void submit()} className={lux.btnPrimary} disabled={busy || !toName}>
            {busy ? "…" : `Μεταφορά ${from.request_count} αιτημάτων`}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-[var(--text-secondary)]">
          Από: <strong className="text-[var(--text-primary)]">{from.name}</strong>
        </p>
        <div>
          <HqLabel htmlFor="rc-to">Προς</HqLabel>
          <HqSelect id="rc-to" className={lux.select + " mt-1"} value={toName} onChange={(e) => setToName(e.target.value)}>
            {options.length === 0 && <option value="">— (δεν υπάρχει άλλη κατηγορία) —</option>}
            {options.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </HqSelect>
          {toLabel ? (
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Τα αιτήματα θα ενημερωθούν στο πεδίο category: «{toLabel}».
            </p>
          ) : null}
        </div>
      </div>
    </CenteredModal>
  );
}
