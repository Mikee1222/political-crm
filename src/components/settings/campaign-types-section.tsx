"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { lux } from "@/lib/luxury-styles";
import { CenteredModal } from "@/components/ui/centered-modal";
import { HqLabel } from "@/components/ui/hq-form-primitives";
import type { CampaignTypeRow } from "@/lib/campaign-types";

function ConfirmModal({
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <CenteredModal open onClose={onCancel} className="!w-[min(420px,calc(100vw-2rem))] !max-w-sm p-0" ariaLabel={title}>
      <div className="p-6">
        <h4 className="text-lg font-bold text-[var(--text-primary)]">{title}</h4>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">{body}</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} className={lux.btnSecondary}>
            Άκυρο
          </button>
          <button type="button" onClick={onConfirm} className={lux.btnDanger}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </CenteredModal>
  );
}

function TypeModal({
  initial,
  onClose,
  onSaved,
  onError,
}: {
  initial: CampaignTypeRow | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onError: (e: string | null) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [retell_agent_id, setRetellAgentId] = useState(initial?.retell_agent_id ?? "");
  const [color, setColor] = useState(initial?.color ?? "#003476");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(initial?.name ?? "");
    setDescription(initial?.description ?? "");
    setRetellAgentId(initial?.retell_agent_id ?? "");
    setColor(initial?.color ?? "#003476");
  }, [initial]);

  const save = async () => {
    onError(null);
    if (!name.trim()) {
      onError("Υποχρεωτικό όνομα");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() ? description.trim() : null,
        retell_agent_id: retell_agent_id.trim() ? retell_agent_id.trim() : null,
        color: color.trim() || "#003476",
      };
      const isNew = !initial;
      const res = await fetchWithTimeout(
        isNew ? "/api/admin/campaign-types" : `/api/admin/campaign-types/${initial!.id}`,
        {
          method: isNew ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        onError(j.error ?? "Σφάλμα");
        return;
      }
      await onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <CenteredModal open onClose={onClose} className="flex !max-w-lg flex-col" ariaLabel={initial ? "Τύπος καμπάνιας" : "Νέος τύπος"}>
      <div className="border-b border-[var(--border)] px-5 py-4 sm:px-6">
        <h3 className="text-lg font-bold text-[var(--text-primary)]">{initial ? "Επεξεργασία τύπου" : "Νέος τύπος καμπάνιας"}</h3>
      </div>
      <div className="min-h-0 max-h-[min(70dvh,560px)] space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
        <div>
          <HqLabel htmlFor="ct-name" required>
            Όνομα
          </HqLabel>
          <input id="ct-name" className={lux.input} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <HqLabel htmlFor="ct-desc">Περιγραφή</HqLabel>
          <textarea id="ct-desc" className={lux.textarea} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <HqLabel htmlFor="ct-agent">Retell agent ID</HqLabel>
          <input
            id="ct-agent"
            className={lux.input + " font-mono text-sm"}
            value={retell_agent_id}
            onChange={(e) => setRetellAgentId(e.target.value)}
            placeholder="agent_…"
          />
        </div>
        <div>
          <HqLabel>Χρώμα</HqLabel>
          <div className="mt-1 flex items-center gap-3">
            <input
              type="color"
              className="h-10 w-14 cursor-pointer rounded border border-[var(--border)] bg-[var(--input-bg)]"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
            <input className={lux.input + " flex-1 font-mono text-sm"} value={color} onChange={(e) => setColor(e.target.value)} />
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2 border-t border-[var(--border)] px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
        <button type="button" onClick={onClose} className={lux.btnSecondary} disabled={busy}>
          Άκυρο
        </button>
        <button type="button" onClick={() => void save()} className={lux.btnPrimary} disabled={busy}>
          {busy ? "…" : "Αποθήκευση"}
        </button>
      </div>
    </CenteredModal>
  );
}

export function CampaignTypesSettingsSection() {
  const [rows, setRows] = useState<CampaignTypeRow[]>([]);
  const [editing, setEditing] = useState<CampaignTypeRow | null | "new">(null);
  const [err, setErr] = useState<string | null>(null);
  const [delId, setDelId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetchWithTimeout("/api/campaign-types");
    if (!res.ok) return;
    const d = (await res.json()) as { types: CampaignTypeRow[] };
    setRows(d.types ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className={lux.card}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className={lux.pageTitle + " mb-1"}>Τύποι Καμπάνιας</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Όνομα, περιγραφή, Retell agent και χρώμα· χρησιμοποιούνται κατά τη δημιουργία καμπάνιας.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setErr(null);
            setEditing("new");
          }}
          className={lux.btnPrimary + " w-full !py-2.5 sm:w-auto"}
        >
          Προσθήκη
        </button>
      </div>
      {err && (
        <p className="mb-3 text-sm text-amber-200" role="status">
          {err}
        </p>
      )}
      <div className="w-full min-w-0 overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className={lux.tableHead + " border-b border-[var(--border)]"}>
              <th className="p-3 pl-4 text-left">Όνομα</th>
              <th className="p-3 text-left">Περιγραφή</th>
              <th className="p-3 text-left font-mono text-xs">Agent ID</th>
              <th className="p-3 text-left">Χρώμα</th>
              <th className="p-3 pr-4 text-right">Ενέργειες</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-elevated)]">
                <td className="p-3 pl-4 font-medium text-[var(--text-primary)]">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full border border-[var(--border)]"
                      style={{ background: r.color || "#003476" }}
                    />
                    {r.name}
                  </span>
                </td>
                <td className="max-w-[220px] p-3 text-[var(--text-secondary)] break-words">{r.description || "—"}</td>
                <td className="p-3 font-mono text-xs text-[var(--text-secondary)]">{r.retell_agent_id || "—"}</td>
                <td className="p-3 font-mono text-xs">{r.color}</td>
                <td className="p-3 pr-4 text-right">
                  <button
                    type="button"
                    className={lux.btnSecondary + " !px-2 !py-1.5 text-xs"}
                    onClick={() => {
                      setErr(null);
                      setEditing(r);
                    }}
                  >
                    Επεξεργασία
                  </button>{" "}
                  <button type="button" className={lux.btnDanger + " !px-2 !py-1.5 text-xs"} onClick={() => setDelId(r.id)}>
                    Διαγραφή
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-6 text-center text-sm text-[var(--text-muted)]">Κανένας τύπος — Προσθέστε.</p>}
      </div>

      {editing != null && (
        <TypeModal
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
          onError={setErr}
        />
      )}

      {delId && (
        <ConfirmModal
          title="Διαγραφή τύπου"
          body="Ο τύπος διαγράφεται. Οι καμπάνιες που τον αναφέρουν θα αποσυνδεθούν (SET NULL)."
          confirmLabel="Διαγραφή"
          onCancel={() => setDelId(null)}
          onConfirm={async () => {
            setErr(null);
            const res = await fetchWithTimeout(`/api/admin/campaign-types/${delId}`, { method: "DELETE" });
            if (!res.ok) {
              const j = (await res.json().catch(() => ({}))) as { error?: string };
              setErr(j.error ?? "Σφάλμα");
              return;
            }
            setDelId(null);
            await load();
          }}
        />
      )}
    </section>
  );
}
