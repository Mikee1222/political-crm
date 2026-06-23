"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Search, Trash2 } from "lucide-react";
import { fetchWithTimeout, CLIENT_FETCH_TIMEOUT_MS } from "@/lib/client-fetch";
import { lux } from "@/lib/luxury-styles";
import type { MunicipalityWithCountRow } from "@/app/api/municipalities/route";
import type { ElectoralDistrictListRow } from "@/app/api/electoral-districts/route";
import type { ToponymWithCountRow } from "@/app/api/toponyms/route";
import { CenteredModal } from "@/components/ui/centered-modal";
import { HqSelect } from "@/components/ui/hq-select";
import { HqLabel } from "@/components/ui/hq-form-primitives";
import { useFormToast } from "@/contexts/form-toast-context";
import { ClientPaginationBar } from "@/components/ui/client-pagination-bar";
import { useClientPagination } from "@/hooks/use-client-pagination";

type Tab = "municipalities" | "districts" | "toponyms";

type GeographicRow = MunicipalityWithCountRow | ElectoralDistrictListRow | ToponymWithCountRow;

const tabs: { id: Tab; label: string }[] = [
  { id: "municipalities", label: "Δήμοι" },
  { id: "districts", label: "Εκλογικά διαμερίσματα" },
  { id: "toponyms", label: "Τοπωνύμια" },
];

export function GeographicDataSection() {
  const [tab, setTab] = useState<Tab>("municipalities");
  const [q, setQ] = useState("");
  const [munis, setMunis] = useState<MunicipalityWithCountRow[]>([]);
  const [dists, setDists] = useState<ElectoralDistrictListRow[]>([]);
  const [tops, setTops] = useState<ToponymWithCountRow[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [editM, setEditM] = useState<MunicipalityWithCountRow | null | "add">(null);
  const [editD, setEditD] = useState<ElectoralDistrictListRow | null | "add">(null);
  const [editT, setEditT] = useState<ToponymWithCountRow | null | "add">(null);
  const [transferMuni, setTransferMuni] = useState<MunicipalityWithCountRow | null>(null);
  const [transferTop, setTransferTop] = useState<ToponymWithCountRow | null>(null);

  const load = useCallback(async () => {
    setLoadErr(null);
    setLoading(true);
    try {
      const fetchOpts = { timeoutMs: CLIENT_FETCH_TIMEOUT_MS * 3 };
      const [rm, rd, rt] = await Promise.all([
        fetchWithTimeout("/api/municipalities?with_counts=1", fetchOpts),
        fetchWithTimeout("/api/electoral-districts", fetchOpts),
        fetchWithTimeout("/api/toponyms?with_counts=1", fetchOpts),
      ]);
      const errors: string[] = [];
      if (rm.ok) {
        const data = (await rm.json()) as { municipalities?: MunicipalityWithCountRow[] };
        setMunis(data.municipalities ?? []);
      } else {
        setMunis([]);
        const j = (await rm.json().catch(() => ({}))) as { error?: string };
        errors.push(j.error ?? "Φόρτωση δήμων");
      }
      if (rd.ok) {
        const data = (await rd.json()) as { districts?: ElectoralDistrictListRow[] };
        setDists(data.districts ?? []);
      } else {
        setDists([]);
        const j = (await rd.json().catch(() => ({}))) as { error?: string };
        errors.push(j.error ?? "Φόρτωση διαμερισμάτων");
      }
      if (rt.ok) {
        const data = (await rt.json()) as { toponyms?: ToponymWithCountRow[] };
        setTops(data.toponyms ?? []);
      } else {
        setTops([]);
        const j = (await rt.json().catch(() => ({}))) as { error?: string };
        errors.push(j.error ?? "Φόρτωση τοπωνυμίων");
      }
      if (errors.length) setLoadErr(errors.join(" · "));
    } catch {
      setLoadErr("Σφάλμα δικτύου");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeItems = useMemo((): GeographicRow[] => {
    if (tab === "municipalities") return munis;
    if (tab === "districts") return dists;
    return tops;
  }, [tab, munis, dists, tops]);

  const { pageItems, page, totalPages, goToPrev, goToNext } = useClientPagination({
    items: activeItems,
    pageSize: 50,
    searchQuery: q,
    getSearchText: (r) => r.name,
    resetWhen: tab,
  });

  return (
    <section className={lux.card}>
      <h2 className={lux.pageTitle + " mb-1"}>Γεωγραφικά δεδομένα</h2>
      <p className="mb-4 text-sm text-[var(--text-secondary)]">
        Δήμοι, εκλογικά διαμερίσματα και τοπωνύμια για αναπτυσσόμενες λίστες στις επαφές.
      </p>

      <div className="mb-4 flex flex-wrap gap-1 border-b border-[var(--border)] pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              setQ("");
            }}
            className={[
              "rounded-lg px-3 py-2 text-sm font-medium transition",
              tab === t.id
                ? "bg-[var(--bg-elevated)] text-[var(--accent-gold)] ring-1 ring-[var(--accent-gold)]/40"
                : "text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]/50",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
        <button
          type="button"
          onClick={() => {
            if (tab === "municipalities") setEditM("add");
            if (tab === "districts") setEditD("add");
            if (tab === "toponyms") setEditT("add");
          }}
          className={lux.btnPrimary + " inline-flex w-full items-center justify-center gap-1 !py-2.5 sm:w-auto"}
        >
          <Plus className="h-4 w-4" />
          Προσθήκη
        </button>
      </div>

      {loadErr && <p className="mb-2 text-sm text-amber-200">{loadErr}</p>}

      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">Φόρτωση…</p>
      ) : (
        <div className="space-y-3">
          <div className="w-full min-w-0 overflow-x-auto rounded-lg border border-[var(--border)]">
            {tab === "municipalities" && (
              <MuniTable
                rows={pageItems as MunicipalityWithCountRow[]}
                onEdit={(r) => setEditM(r)}
                onTransfer={(r) => setTransferMuni(r)}
                onDelete={load}
              />
            )}
            {tab === "districts" && (
              <DistTable
                rows={pageItems as ElectoralDistrictListRow[]}
                munis={munis}
                onEdit={(r) => setEditD(r)}
                onDelete={load}
              />
            )}
            {tab === "toponyms" && (
              <TopTable
                rows={pageItems as ToponymWithCountRow[]}
                munis={munis}
                dists={dists}
                onEdit={(r) => setEditT(r)}
                onTransfer={(r) => setTransferTop(r)}
                onDelete={load}
              />
            )}
          </div>
          <ClientPaginationBar page={page} totalPages={totalPages} onPrev={goToPrev} onNext={goToNext} />
        </div>
      )}

      {editM && <MuniModal open={true} v={editM} onClose={() => setEditM(null)} onSave={() => void load()} />}
      {editD && <DistModal open={true} v={editD} munis={munis} onClose={() => setEditD(null)} onSave={() => void load()} />}
      {editT && <TopModal open={true} v={editT} munis={munis} dists={dists} onClose={() => setEditT(null)} onSave={() => void load()} />}

      {transferMuni && (
        <MunicipalityTransferModal
          from={transferMuni}
          municipalities={munis}
          onClose={() => setTransferMuni(null)}
          onTransferred={async () => {
            setTransferMuni(null);
            await load();
          }}
        />
      )}

      {transferTop && (
        <ToponymTransferModal
          from={transferTop}
          toponyms={tops}
          onClose={() => setTransferTop(null)}
          onTransferred={async () => {
            setTransferTop(null);
            await load();
          }}
        />
      )}
    </section>
  );
}

function MuniTable({
  rows,
  onEdit,
  onTransfer,
  onDelete,
}: {
  rows: MunicipalityWithCountRow[];
  onEdit: (r: MunicipalityWithCountRow) => void;
  onTransfer: (r: MunicipalityWithCountRow) => void;
  onDelete: () => void;
}) {
  return (
    <table className="w-full min-w-[480px] text-sm">
      <thead>
        <tr className={lux.tableHead + " border-b border-[var(--border)]"}>
          <th className="p-2 pl-3 text-left">Όνομα</th>
          <th className="p-2 text-right">Επαφές</th>
          <th className="w-44 p-2 pr-3 text-right">Ενέργειες</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td colSpan={3} className="p-4 text-center text-[var(--text-muted)]">
              Δεν βρέθηκαν.
            </td>
          </tr>
        )}
        {rows.map((r) => (
          <tr key={r.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-elevated)]/50">
            <td className="p-2 pl-3 font-medium text-[var(--text-primary)]">{r.name}</td>
            <td className="p-2 text-right tabular-nums text-[var(--text-secondary)]">{r.contact_count}</td>
            <td className="p-2 pr-3 text-right">
              <div className="inline-flex flex-wrap justify-end gap-1">
                <button
                  type="button"
                  className={lux.btnSecondary + " !px-2 !py-1.5 text-xs"}
                  disabled={r.contact_count === 0}
                  onClick={() => onTransfer(r)}
                >
                  Μεταφορά επαφών
                </button>
                <RowActions
                  onEdit={() => onEdit(r)}
                  onDelete={async () => {
                    if (!confirm("Διαγραφή δήμου; Θα διαγραφούν και τα σχετικά διαμερίσματα/τοπωνύμια.")) return;
                    const res = await fetchWithTimeout(`/api/admin/municipalities/${r.id}`, { method: "DELETE" });
                    if (res.ok) onDelete();
                  }}
                />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DistTable({
  rows,
  onEdit,
  onDelete,
}: {
  rows: ElectoralDistrictListRow[];
  munis: MunicipalityWithCountRow[];
  onEdit: (r: ElectoralDistrictListRow) => void;
  onDelete: () => void;
}) {
  return (
    <table className="w-full min-w-[480px] text-sm">
      <thead>
        <tr className={lux.tableHead + " border-b border-[var(--border)]"}>
          <th className="p-2 pl-3 text-left">Όνομα</th>
          <th className="p-2 text-right">Επαφές</th>
          <th className="w-28 p-2 pr-3 text-right">Ενέργειες</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td colSpan={3} className="p-4 text-center text-[var(--text-muted)]">
              Δεν βρέθηκαν.
            </td>
          </tr>
        )}
        {rows.map((r) => (
          <tr key={r.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-elevated)]/50">
            <td className="p-2 pl-3 font-medium text-[var(--text-primary)]">{r.name}</td>
            <td className="p-2 text-right tabular-nums text-[var(--text-secondary)]">{r.contact_count ?? 0}</td>
            <td className="p-2 pr-3 text-right">
              <RowActions
                onEdit={() => onEdit(r)}
                onDelete={async () => {
                  if (!confirm("Διαγραφή διαμερίσματος;")) return;
                  const res = await fetchWithTimeout(`/api/admin/electoral-districts/${r.id}`, { method: "DELETE" });
                  if (res.ok) onDelete();
                }}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TopTable({
  rows,
  onEdit,
  onTransfer,
  onDelete,
}: {
  rows: ToponymWithCountRow[];
  munis: MunicipalityWithCountRow[];
  dists: ElectoralDistrictListRow[];
  onEdit: (r: ToponymWithCountRow) => void;
  onTransfer: (r: ToponymWithCountRow) => void;
  onDelete: () => void;
}) {
  return (
    <table className="w-full min-w-[560px] text-sm">
      <thead>
        <tr className={lux.tableHead + " border-b border-[var(--border)]"}>
          <th className="p-2 pl-3 text-left">Όνομα</th>
          <th className="p-2 text-right">Επαφές</th>
          <th className="w-44 p-2 pr-3 text-right">Ενέργειες</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td colSpan={3} className="p-4 text-center text-[var(--text-muted)]">
              Δεν βρέθηκαν.
            </td>
          </tr>
        )}
        {rows.map((r) => (
          <tr key={r.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-elevated)]/50">
            <td className="p-2 pl-3 font-medium text-[var(--text-primary)]">{r.name}</td>
            <td className="p-2 pr-3 text-right">
              <div className="inline-flex flex-wrap justify-end gap-1">
                <button
                  type="button"
                  className={lux.btnSecondary + " !px-2 !py-1.5 text-xs"}
                  disabled={r.contact_count === 0}
                  onClick={() => onTransfer(r)}
                >
                  Μεταφορά επαφών
                </button>
                <RowActions
                  onEdit={() => onEdit(r)}
                  onDelete={async () => {
                    if (!confirm("Διαγραφή τοπωνυμίου;")) return;
                    const res = await fetchWithTimeout(`/api/admin/toponyms/${r.id}`, { method: "DELETE" });
                    if (res.ok) onDelete();
                  }}
                />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void | Promise<void> }) {
  return (
    <div className="inline-flex justify-end gap-1">
      <button type="button" className={lux.btnIcon + " !h-8 !w-8"} onClick={onEdit} title="Επεξεργασία" aria-label="Επεξεργασία">
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button type="button" className={lux.btnIcon + " !h-8 !w-8 text-red-300"} onClick={() => void onDelete()} title="Διαγραφή" aria-label="Διαγραφή">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function MunicipalityTransferModal({
  from,
  municipalities,
  onClose,
  onTransferred,
}: {
  from: MunicipalityWithCountRow;
  municipalities: MunicipalityWithCountRow[];
  onClose: () => void;
  onTransferred: () => Promise<void>;
}) {
  const { showToast } = useFormToast();
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const options = useMemo(
    () => municipalities.filter((m) => m.name !== from.name).sort((a, b) => a.name.localeCompare(b.name, "el")),
    [municipalities, from.name],
  );

  useEffect(() => {
    setTo(options[0]?.name ?? "");
  }, [from.name, options]);

  const submit = async () => {
    if (!to.trim()) {
      showToast("Επιλέξτε προορισμό.", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await fetchWithTimeout("/api/admin/contacts/bulk-transfer-municipality", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: from.name, to: to.trim() }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; transferred?: number };
      if (!res.ok) {
        showToast(j.error ?? "Σφάλμα", "error");
        return;
      }
      showToast(`Μεταφέρθηκαν ${j.transferred ?? 0} επαφές.`, "success");
      await onTransferred();
    } finally {
      setBusy(false);
    }
  };

  return (
    <CenteredModal
      open
      onClose={onClose}
      title="Μεταφορά επαφών"
      ariaLabel="Μεταφορά επαφών ανά δήμο"
      className="!max-w-md"
      footer={
        <>
          <button type="button" onClick={onClose} className={lux.btnSecondary} disabled={busy}>
            Άκυρο
          </button>
          <button type="button" onClick={() => void submit()} className={lux.btnPrimary} disabled={busy || !to}>
            {busy ? "…" : `Μεταφορά ${from.contact_count} επαφών`}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-[var(--text-secondary)]">
          Μεταφορά <strong className="text-[var(--text-primary)]">{from.contact_count}</strong> επαφών από{" "}
          <strong className="text-[var(--text-primary)]">{from.name}</strong> σε:
        </p>
        <div>
          <HqLabel htmlFor="muni-to">Δήμος προορισμού</HqLabel>
          <HqSelect id="muni-to" className={lux.select + " mt-1"} value={to} onChange={(e) => setTo(e.target.value)}>
            {options.length === 0 && <option value="">— (δεν υπάρχει άλλος δήμος) —</option>}
            {options.map((m) => (
              <option key={m.id} value={m.name}>
                {m.name}
              </option>
            ))}
          </HqSelect>
        </div>
      </div>
    </CenteredModal>
  );
}

function ToponymTransferModal({
  from,
  toponyms,
  onClose,
  onTransferred,
}: {
  from: ToponymWithCountRow;
  toponyms: ToponymWithCountRow[];
  onClose: () => void;
  onTransferred: () => Promise<void>;
}) {
  const { showToast } = useFormToast();
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const options = useMemo(
    () => toponyms.filter((t) => t.name !== from.name).sort((a, b) => a.name.localeCompare(b.name, "el")),
    [toponyms, from.name],
  );

  useEffect(() => {
    setTo(options[0]?.name ?? "");
  }, [from.name, options]);

  const submit = async () => {
    if (!to.trim()) {
      showToast("Επιλέξτε προορισμό.", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await fetchWithTimeout("/api/admin/contacts/bulk-transfer-toponym", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: from.name, to: to.trim() }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; transferred?: number };
      if (!res.ok) {
        showToast(j.error ?? "Σφάλμα", "error");
        return;
      }
      showToast(`Μεταφέρθηκαν ${j.transferred ?? 0} επαφές.`, "success");
      await onTransferred();
    } finally {
      setBusy(false);
    }
  };

  const toLabel = to.trim();

  return (
    <CenteredModal
      open
      onClose={onClose}
      title="Μεταφορά επαφών"
      ariaLabel="Μεταφορά επαφών ανά τοπωνύμιο"
      className="!max-w-md"
      footer={
        <>
          <button type="button" onClick={onClose} className={lux.btnSecondary} disabled={busy}>
            Άκυρο
          </button>
          <button type="button" onClick={() => void submit()} className={lux.btnPrimary} disabled={busy || !to.trim()}>
            {busy ? "…" : `Μεταφορά ${from.contact_count} επαφών`}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-[var(--text-secondary)]">
          Μεταφορά <strong className="text-[var(--text-primary)]">{from.contact_count}</strong> επαφών από{" "}
          <strong className="text-[var(--text-primary)]">{from.name}</strong> σε:
        </p>
        <div>
          <HqLabel htmlFor="top-to">Τοπωνύμιο προορισμού</HqLabel>
          <HqSelect id="top-to" className={lux.select + " mt-1"} value={to} onChange={(e) => setTo(e.target.value)}>
            {options.length === 0 && <option value="">— (δεν υπάρχει άλλο τοπωνύμιο) —</option>}
            {options.map((t) => (
              <option key={t.id} value={t.name}>
                {t.name}
              </option>
            ))}
          </HqSelect>
          {toLabel ? (
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Οι επαφές θα ενημερωθούν στο πεδίο τοπωνυμίου: «{toLabel}».
            </p>
          ) : null}
        </div>
      </div>
    </CenteredModal>
  );
}

function MuniModal({ open, v, onClose, onSave }: { open: boolean; v: MunicipalityWithCountRow | "add" | null; onClose: () => void; onSave: () => void }) {
  const { showToast } = useFormToast();
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const isAdd = v === "add";
  const row = v !== "add" && v != null ? v : null;
  useEffect(() => {
    if (!open) return;
    if (isAdd) {
      setName("");
    } else if (row) {
      setName(row.name);
    }
    setErr(null);
  }, [open, isAdd, row]);

  if (!open || v == null) return null;
  return (
    <CenteredModal
      open={open}
      onClose={onClose}
      title={isAdd ? "Νέος δήμος" : "Επεξεργασία δήμου"}
      ariaLabel={isAdd ? "Νέος δήμος" : "Επεξεργασία δήμου"}
      className="!max-w-md"
      footer={
        <>
          <button type="button" onClick={onClose} className={lux.btnSecondary + " !py-2"}>
            Άκυρο
          </button>
          <button
            type="button"
            onClick={async () => {
              setErr(null);
              const n = name.trim();
              if (!n) {
                setErr("Υποχρεωτικό όνομα");
                showToast("Υποχρεωτικό όνομα.", "error");
                return;
              }
              const bodyOut = { name: n, regional_unit: null };
              const url = isAdd ? "/api/admin/municipalities" : `/api/admin/municipalities/${row!.id}`;
              const res = await fetchWithTimeout(url, {
                method: isAdd ? "POST" : "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(bodyOut),
              });
              if (!res.ok) {
                const j = (await res.json().catch(() => ({}))) as { error?: string };
                const msg = j.error ?? "Σφάλμα";
                setErr(msg);
                showToast(msg, "error");
                return;
              }
              showToast("Αποθηκεύτηκε.", "success");
              onSave();
              onClose();
            }}
            className={lux.btnPrimary + " !py-2"}
          >
            Αποθήκευση
          </button>
        </>
      }
    >
      {err && <p className="mb-2 text-sm text-red-300">{err}</p>}
      <label className={lux.label}>Όνομα *</label>
      <input className={lux.input + " mb-1"} value={name} onChange={(e) => setName(e.target.value)} />
    </CenteredModal>
  );
}

function DistModal({
  open,
  v,
  munis,
  onClose,
  onSave,
}: {
  open: boolean;
  v: ElectoralDistrictListRow | "add" | null;
  munis: MunicipalityWithCountRow[];
  onClose: () => void;
  onSave: () => void;
}) {
  const { showToast } = useFormToast();
  const [name, setName] = useState("");
  const [muni, setMuni] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const isAdd = v === "add";
  const row = v !== "add" && v != null ? v : null;
  useEffect(() => {
    if (!open) return;
    if (isAdd) {
      setName("");
      setMuni(munis[0]?.id ?? "");
    } else if (row) {
      setName(row.name);
      setMuni(row.municipality_id);
    }
    setErr(null);
  }, [open, isAdd, row, munis]);
  if (!open || v == null) return null;
  return (
    <CenteredModal
      open={open}
      onClose={onClose}
      title={isAdd ? "Νέο εκλ. διαμέρισμα" : "Επεξεργασία διαμερίσματος"}
      ariaLabel={isAdd ? "Νέο εκλογικό διαμέρισμα" : "Επεξεργασία εκλογικού διαμερίσματος"}
      className="!max-w-md"
      footer={
        <>
          <button type="button" onClick={onClose} className={lux.btnSecondary + " !py-2"}>
            Άκυρο
          </button>
          <button
            type="button"
            onClick={async () => {
              setErr(null);
              const n = name.trim();
              if (!n || !muni) {
                setErr("Συμπληρώστε όλα τα απαιτούμενα");
                showToast("Συμπληρώστε όλα τα απαιτούμενα πεδία.", "error");
                return;
              }
              const res = isAdd
                ? await fetchWithTimeout("/api/admin/electoral-districts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: n, municipality_id: muni }),
                  })
                : await fetchWithTimeout(`/api/admin/electoral-districts/${row!.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: n, municipality_id: muni }),
                  });
              if (!res.ok) {
                const j = (await res.json().catch(() => ({}))) as { error?: string };
                const msg = j.error ?? "Σφάλμα";
                setErr(msg);
                showToast(msg, "error");
                return;
              }
              showToast("Αποθηκεύτηκε.", "success");
              onSave();
              onClose();
            }}
            className={lux.btnPrimary + " !py-2"}
          >
            Αποθήκευση
          </button>
        </>
      }
    >
      {err && <p className="mb-2 text-sm text-red-300">{err}</p>}
      <label className={lux.label}>Δήμος *</label>
      <HqSelect className={lux.select + " mb-3"} value={muni} onChange={(e) => setMuni(e.target.value)}>
        {munis.length === 0 && <option value="">— (προσθέστε δήμο πρώτα) —</option>}
        {munis.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </HqSelect>
      <label className={lux.label}>Όνομα *</label>
      <input className={lux.input + " mb-1"} value={name} onChange={(e) => setName(e.target.value)} />
    </CenteredModal>
  );
}

function TopModal({
  open,
  v,
  munis,
  dists,
  onClose,
  onSave,
}: {
  open: boolean;
  v: ToponymWithCountRow | "add" | null;
  munis: MunicipalityWithCountRow[];
  dists: ElectoralDistrictListRow[];
  onClose: () => void;
  onSave: () => void;
}) {
  const { showToast } = useFormToast();
  const [name, setName] = useState("");
  const [muni, setMuni] = useState("");
  const [dist, setDist] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const isAdd = v === "add";
  const row = v !== "add" && v != null ? v : null;
  const distsForMuni = useMemo(() => dists.filter((d) => d.municipality_id === muni), [dists, muni]);

  useEffect(() => {
    if (!open) return;
    if (isAdd) {
      setName("");
      setMuni(munis[0]?.id ?? "");
      setDist("");
    } else if (row) {
      setName(row.name);
      setMuni(row.municipality_id ?? munis[0]?.id ?? "");
      setDist(row.electoral_district_id ?? "");
    }
    setErr(null);
  }, [open, isAdd, row, munis]);

  if (!open || v == null) return null;
  return (
    <CenteredModal
      open={open}
      onClose={onClose}
      title={isAdd ? "Νέο τοπωνύμιο" : "Επεξεργασία τοπωνυμίου"}
      ariaLabel={isAdd ? "Νέο τοπωνύμιο" : "Επεξεργασία τοπωνυμίου"}
      className="!max-w-md"
      footer={
        <>
          <button type="button" onClick={onClose} className={lux.btnSecondary + " !py-2"}>
            Άκυρο
          </button>
          <button
            type="button"
            onClick={async () => {
              setErr(null);
              const n = name.trim();
              if (!n || !muni) {
                setErr("Υποχρεωτικά: όνομα, δήμος");
                showToast("Συμπληρώστε όνομα και δήμο.", "error");
                return;
              }
              const body = { name: n, municipality_id: muni, electoral_district_id: dist || null };
              const res = isAdd
                ? await fetchWithTimeout("/api/admin/toponyms", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                  })
                : await fetchWithTimeout(`/api/admin/toponyms/${row!.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                  });
              if (!res.ok) {
                const j = (await res.json().catch(() => ({}))) as { error?: string };
                const msg = j.error ?? "Σφάλμα";
                setErr(msg);
                showToast(msg, "error");
                return;
              }
              showToast("Αποθηκεύτηκε.", "success");
              onSave();
              onClose();
            }}
            className={lux.btnPrimary + " !py-2"}
          >
            Αποθήκευση
          </button>
        </>
      }
    >
      {err && <p className="mb-2 text-sm text-red-300">{err}</p>}
      <label className={lux.label}>Δήμος *</label>
      <HqSelect
        className={lux.select + " mb-3"}
        value={muni}
        onChange={(e) => {
          setMuni(e.target.value);
          setDist("");
        }}
      >
        {munis.length === 0 && <option value="">—</option>}
        {munis.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </HqSelect>
      <label className={lux.label}>Εκλ. διαμέρισμα (προαιρ.)</label>
      <HqSelect className={lux.select + " mb-3"} value={dist} onChange={(e) => setDist(e.target.value)}>
        <option value="">— Όλο/γενικό —</option>
        {distsForMuni.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </HqSelect>
      <label className={lux.label}>Όνομα *</label>
      <input className={lux.input + " mb-1"} value={name} onChange={(e) => setName(e.target.value)} />
    </CenteredModal>
  );
}
