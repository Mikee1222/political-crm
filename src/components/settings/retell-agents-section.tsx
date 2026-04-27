"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { lux } from "@/lib/luxury-styles";
import { CenteredModal } from "@/components/ui/centered-modal";
import { HqLabel } from "@/components/ui/hq-form-primitives";
import type { RetellAgentRow } from "@/lib/retell-agents";

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

function AgentModal({
  initial,
  onClose,
  onSaved,
  onError,
}: {
  initial: RetellAgentRow | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onError: (e: string | null) => void;
}) {
  const [agent_id, setAgentId] = useState(initial?.agent_id ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setAgentId(initial?.agent_id ?? "");
    setName(initial?.name ?? "");
    setDescription(initial?.description ?? "");
  }, [initial]);

  const save = async () => {
    onError(null);
    if (!agent_id.trim() || !name.trim()) {
      onError("Υποχρεωτικά agent ID και όνομα");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        agent_id: agent_id.trim(),
        name: name.trim(),
        description: description.trim() ? description.trim() : null,
      };
      const isNew = !initial;
      const res = await fetchWithTimeout(
        isNew ? "/api/admin/retell-agents" : `/api/admin/retell-agents/${initial!.id}`,
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
    <CenteredModal open onClose={onClose} className="flex !max-w-lg flex-col" ariaLabel={initial ? "Retell agent" : "Νέος agent"}>
      <div className="border-b border-[var(--border)] px-5 py-4 sm:px-6">
        <h3 className="text-lg font-bold text-[var(--text-primary)]">{initial ? "Επεξεργασία agent" : "Νέος Retell agent"}</h3>
      </div>
      <div className="min-h-0 max-h-[min(70dvh,560px)] space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
        <div>
          <HqLabel htmlFor="ra-id" required>
            Retell agent ID
          </HqLabel>
          <input
            id="ra-id"
            className={lux.input + " font-mono text-sm"}
            value={agent_id}
            onChange={(e) => setAgentId(e.target.value)}
            placeholder="agent_…"
          />
        </div>
        <div>
          <HqLabel htmlFor="ra-name" required>
            Όνομα εμφάνισης
          </HqLabel>
          <input id="ra-name" className={lux.input} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <HqLabel htmlFor="ra-desc">Περιγραφή</HqLabel>
          <textarea id="ra-desc" className={lux.textarea} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
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

export function RetellAgentsSettingsSection() {
  const [rows, setRows] = useState<RetellAgentRow[]>([]);
  const [editing, setEditing] = useState<RetellAgentRow | null | "new">(null);
  const [err, setErr] = useState<string | null>(null);
  const [delId, setDelId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetchWithTimeout("/api/admin/retell-agents");
    if (!res.ok) return;
    const d = (await res.json()) as { agents: RetellAgentRow[] };
    setRows(d.agents ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className={lux.card}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className={lux.pageTitle + " mb-1"}>Retell Agents</h2>
          <p className="text-sm text-[var(--text-secondary)]">Κατάλογος agent IDs για αναφορά· οι τύποι καμπάνιας δένουν με agent ID.</p>
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
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className={lux.tableHead + " border-b border-[var(--border)]"}>
              <th className="p-3 pl-4 text-left font-mono text-xs">agent_id</th>
              <th className="p-3 text-left">Όνομα</th>
              <th className="p-3 text-left">Περιγραφή</th>
              <th className="p-3 pr-4 text-right">Ενέργειες</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-elevated)]">
                <td className="p-3 pl-4 font-mono text-xs text-[var(--text-secondary)]">{r.agent_id}</td>
                <td className="p-3 font-medium text-[var(--text-primary)]">{r.name}</td>
                <td className="max-w-[280px] p-3 text-[var(--text-secondary)] break-words">{r.description || "—"}</td>
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
                    Αφαίρεση
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-6 text-center text-sm text-[var(--text-muted)]">Κανένας agent — Προσθέστε.</p>}
      </div>

      {editing != null && (
        <AgentModal
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
          title="Αφαίρεση agent"
          body="Ο agent αφαιρείται από τον κατάλογο. Οι τύποι καμπάνιας δεν αλλάζουν αυτόματα."
          confirmLabel="Αφαίρεση"
          onCancel={() => setDelId(null)}
          onConfirm={async () => {
            setErr(null);
            const res = await fetchWithTimeout(`/api/admin/retell-agents/${delId}`, { method: "DELETE" });
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
