"use client";

import { useCallback, useEffect, useState } from "react";
import { lux } from "@/lib/luxury-styles";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { CenteredModal } from "@/components/ui/centered-modal";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import type { ContactGroupRow } from "@/lib/contact-groups";
import { applySavedFilterJson, summarizeContactFilters } from "@/lib/contacts-filters";

type SavedFilterRow = {
  id: string;
  name: string;
  description: string | null;
  filters: Record<string, unknown>;
  created_at: string;
};

function FilterModal({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: SavedFilterRow | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [filtersJson, setFiltersJson] = useState("{}");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    if (initial) {
      setName(initial.name);
      setDescription(initial.description ?? "");
      setFiltersJson(JSON.stringify(initial.filters ?? {}, null, 2));
    } else {
      setName("");
      setDescription("");
      setFiltersJson('{\n  "call_status": ["Negative", "No Answer"]\n}');
    }
  }, [open, initial]);

  const save = async () => {
    setErr(null);
    let filters: Record<string, unknown>;
    try {
      filters = JSON.parse(filtersJson) as Record<string, unknown>;
    } catch {
      setErr("Μη έγκυρο JSON στα φίλτρα");
      return;
    }
    const n = name.trim();
    if (!n) {
      setErr("Όνομα απαιτείται");
      return;
    }
    setSaving(true);
    try {
      if (initial) {
        const res = await fetchWithTimeout(`/api/saved-filters/${initial.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: n, description: description.trim() || null, filters }),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setErr(j.error ?? "Σφάλμα");
          return;
        }
      } else {
        const res = await fetchWithTimeout("/api/saved-filters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: n, description: description.trim() || null, filters }),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setErr(j.error ?? "Σφάλμα");
          return;
        }
      }
      onSave();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <CenteredModal
      open={open}
      onClose={onClose}
      title={initial ? "Επεξεργασία φίλτρου" : "Νέο αποθηκευμένο φίλτρο"}
      className="max-w-lg"
      footer={
        <>
          <button type="button" className={lux.btnSecondary} onClick={onClose} disabled={saving}>
            Άκυρο
          </button>
          <FormSubmitButton type="button" variant="gold" loading={saving} onClick={() => void save()}>
            Αποθήκευση
          </FormSubmitButton>
        </>
      }
    >
      {err && <p className="mb-3 text-sm text-amber-200">{err}</p>}
      <label className="block">
        <span className={lux.label}>Όνομα (μοναδικό)</span>
        <input className={lux.input} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="mt-3 block">
        <span className={lux.label}>Περιγραφή</span>
        <input
          className={lux.input}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Π.χ. Αρνητικός, δεν απαντά, …"
        />
      </label>
      <label className="mt-3 block">
        <span className={lux.label}>Φίλτρα (JSON)</span>
        <textarea
          className={lux.input + " min-h-[200px] font-mono text-xs"}
          value={filtersJson}
          onChange={(e) => setFiltersJson(e.target.value)}
          spellCheck={false}
        />
      </label>
    </CenteredModal>
  );
}

export function SavedFiltersSection({ isAdmin }: { isAdmin: boolean }) {
  const [rows, setRows] = useState<SavedFilterRow[]>([]);
  const [groups, setGroups] = useState<ContactGroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<SavedFilterRow | null | "new">(null);
  const [del, setDel] = useState<SavedFilterRow | null>(null);

  const nameById = new Map<string, string>();
  for (const g of groups) {
    nameById.set(g.id, g.name);
  }
  const groupNameLowerToId = new Map(groups.map((g) => [g.name.toLowerCase(), g.id]));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [gr, fr] = await Promise.all([
        fetchWithTimeout("/api/groups").then((r) => r.json() as Promise<{ groups?: ContactGroupRow[] }>),
        fetchWithTimeout("/api/saved-filters").then((r) => r.json() as Promise<{ saved_filters?: SavedFilterRow[] }>),
      ]);
      setGroups(gr.groups ?? []);
      setRows(fr.saved_filters ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className={lux.card}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className={lux.pageTitle + " mb-1"}>Αποθηκευμένα φίλτρα</h2>
          <p className="text-sm text-[var(--text-secondary)]">Συντομεύσεις για γρήγορα φίλτρα στις επαφές (όλοι οι χρήστες) · διαχείριση: διαχειριστής</p>
        </div>
        {isAdmin && (
          <button type="button" className={lux.btnPrimary + " w-full !py-2.5 sm:w-auto"} onClick={() => setEdit("new")}>
            Νέο σετ φίλτρων
          </button>
        )}
      </div>
      {loading && <p className="text-sm text-[var(--text-muted)]">Φόρτωση…</p>}
      {!loading && rows.length === 0 && (
        <p className="text-sm text-[var(--text-secondary)]">Καμία εγγραφή. {isAdmin ? "Προσθέστε από πάνω." : "Ο διαχειριστής μπορεί να δημιουργήσει βραχείες φίλτρων."}</p>
      )}
      {!loading && rows.length > 0 && (
        <div className="w-full min-w-0 overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className={lux.tableHead + " border-b border-[var(--border)]"}>
                <th className="p-3 pl-4 text-left">Όνομα</th>
                <th className="p-3">Περιγραφή</th>
                <th className="p-3 min-w-[220px]">Περίληψη</th>
                {isAdmin && <th className="p-3 pr-4 text-right">Ενέργειες</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const f = applySavedFilterJson(r.filters, groupNameLowerToId);
                const summary = summarizeContactFilters(f, nameById);
                return (
                  <tr key={r.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-elevated)]">
                    <td className="p-3 pl-4 font-medium text-[var(--text-primary)]">{r.name}</td>
                    <td className="p-3 text-[var(--text-secondary)]">{r.description ?? "—"}</td>
                    <td className="p-3 text-xs text-[var(--text-primary)]">{summary}</td>
                    {isAdmin && (
                      <td className="p-3 pr-4 text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          <button
                            type="button"
                            className={lux.btnSecondary + " !px-2 !py-1.5 text-xs"}
                            onClick={() => setEdit(r)}
                          >
                            Επεξεργασία
                          </button>
                          <button type="button" className={lux.btnDanger + " !px-2 !py-1.5 text-xs"} onClick={() => setDel(r)}>
                            Διαγραφή
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {isAdmin && (
        <FilterModal
          open={edit !== null}
          initial={edit && edit !== "new" ? edit : null}
          onClose={() => setEdit(null)}
          onSave={load}
        />
      )}

      {isAdmin && del && (
        <CenteredModal
          open={!!del}
          onClose={() => setDel(null)}
          title="Διαγραφή φίλτρου"
          className="max-w-sm"
          footer={
            <>
              <button type="button" className={lux.btnSecondary} onClick={() => setDel(null)}>
                Άκυρο
              </button>
              <button
                type="button"
                className={lux.btnDanger}
                onClick={() => {
                  void (async () => {
                    const res = await fetchWithTimeout(`/api/saved-filters/${del.id}`, { method: "DELETE" });
                    if (res.ok) {
                      setDel(null);
                      await load();
                    }
                  })();
                }}
              >
                Διαγραφή
              </button>
            </>
          }
        >
          <p className="text-sm text-[var(--text-primary)]">Να διαγραφεί το &quot;{del.name}&quot;;</p>
        </CenteredModal>
      )}
    </section>
  );
}
