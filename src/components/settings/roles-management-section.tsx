"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { lux } from "@/lib/luxury-styles";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { useFormToast } from "@/contexts/form-toast-context";
import { PERMISSION_CATEGORIES, PERMISSION_LABELS, type PermissionKey } from "@/lib/permissions";
import { CenteredModal } from "@/components/ui/centered-modal";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { HqLabel } from "@/components/ui/hq-form-primitives";
import { HqSelect } from "@/components/ui/hq-select";

type RoleRow = {
  id: string;
  name: string;
  label: string;
  color: string;
  description: string | null;
  is_system: boolean;
  access_tier: string;
  created_at: string;
};

function Toggle({
  checked,
  disabled,
  onChange,
  id,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  id: string;
  label: string;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-full border border-[var(--border)] bg-[var(--bg-card)] transition-colors checked:bg-emerald-600 disabled:opacity-50"
      />
    </label>
  );
}

export function RolesManagementSection() {
  const { showToast } = useFormToast();
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [permMap, setPermMap] = useState<Record<string, Record<string, boolean>>>({});
  const [loading, setLoading] = useState(true);
  const [editRole, setEditRole] = useState<RoleRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithTimeout("/api/admin/roles");
      if (!res.ok) {
        showToast("Αποτυχία φόρτωσης ρόλων.", "error");
        return;
      }
      const j = (await res.json()) as { roles: RoleRow[] };
      const list = j.roles ?? [];
      setRoles(list);
      const next: Record<string, Record<string, boolean>> = {};
      await Promise.all(
        list.map(async (r) => {
          const pr = await fetchWithTimeout(`/api/admin/roles/${encodeURIComponent(r.name)}/permissions`);
          if (!pr.ok) return;
          const pj = (await pr.json()) as { permissions: Record<string, boolean> };
          next[r.name] = pj.permissions ?? {};
        }),
      );
      setPermMap(next);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const scheduleSave = useCallback(
    (roleName: string, next: Record<string, boolean>) => {
      if (saveTimers.current[roleName]) clearTimeout(saveTimers.current[roleName]);
      saveTimers.current[roleName] = setTimeout(async () => {
        const res = await fetchWithTimeout(`/api/admin/roles/${encodeURIComponent(roleName)}/permissions`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ permissions: next }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          showToast(j.error ?? "Αποτυχία αποθήκευσης", "error");
          return;
        }
        showToast("Οι δικαιοδοσίες αποθηκεύτηκαν.", "success");
      }, 450);
    },
    [showToast],
  );

  const setPerm = useCallback(
    (roleName: string, key: PermissionKey, allowed: boolean) => {
      setPermMap((prev) => {
        const cur = { ...(prev[roleName] ?? {}) };
        cur[key] = allowed;
        const merged = { ...prev, [roleName]: cur };
        scheduleSave(roleName, cur);
        return merged;
      });
    },
    [scheduleSave],
  );

  const orderedRoles = useMemo(() => {
    const sys = roles.filter((r) => r.is_system);
    const rest = roles.filter((r) => !r.is_system);
    return [...sys.sort((a, b) => a.name.localeCompare(b.name)), ...rest.sort((a, b) => a.name.localeCompare(b.name))];
  }, [roles]);

  if (loading) {
    return (
      <section className={lux.card}>
        <p className="text-sm text-[var(--text-muted)]">Φόρτωση ρόλων…</p>
      </section>
    );
  }

  return (
    <section className={lux.card}>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className={lux.pageTitle + " mb-1"}>Ρόλοι και δικαιοδοσίες</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Διαχείριση ρόλων CRM, δικαιωμάτων και εργαλείων Αλεξάνδρας ανά ρόλο.
          </p>
        </div>
        <button type="button" onClick={() => setCreateOpen(true)} className={lux.btnPrimary + " w-full !py-2.5 sm:w-auto"}>
          Νέος προσαρμοσμένος ρόλος
        </button>
      </div>

      <div className="space-y-8">
        {orderedRoles.map((r) => (
          <article
            key={r.id}
            className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-sm"
            style={{ borderLeftWidth: 4, borderLeftColor: r.color || "#003476" }}
          >
            <div className="flex flex-col gap-3 border-b border-[var(--border)] p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-lg font-bold text-[var(--text-primary)]">{r.name}</p>
                <p className="text-sm font-medium text-[var(--text-secondary)]">{r.label}</p>
                {r.description ? <p className="mt-1 text-sm text-[var(--text-muted)]">{r.description}</p> : null}
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  {r.is_system ? "Σύστημα — δεν διαγράφεται" : "Προσαρμοσμένος"} · Πλοήγηση: {r.access_tier}
                </p>
              </div>
              <button type="button" className={lux.btnSecondary + " shrink-0"} onClick={() => setEditRole(r)}>
                Επεξεργασία
              </button>
            </div>

            <div className="space-y-6 p-4">
              {PERMISSION_CATEGORIES.map((cat) => (
                <div key={cat.id}>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{cat.label}</h3>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {cat.keys.map((key) => (
                      <Toggle
                        key={key}
                        id={`${r.name}-${key}`}
                        label={PERMISSION_LABELS[key]}
                        checked={Boolean(permMap[r.name]?.[key])}
                        onChange={(v) => setPerm(r.name, key, v)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>

      {editRole && (
        <EditRoleModal
          role={editRole}
          onClose={() => setEditRole(null)}
          onSaved={async () => {
            setEditRole(null);
            await loadAll();
          }}
        />
      )}

      {createOpen && (
        <CreateRoleModal
          onClose={() => setCreateOpen(false)}
          onCreated={async () => {
            setCreateOpen(false);
            await loadAll();
          }}
        />
      )}
    </section>
  );
}

function EditRoleModal({
  role,
  onClose,
  onSaved,
}: {
  role: RoleRow;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const { showToast } = useFormToast();
  const [label, setLabel] = useState(role.label);
  const [color, setColor] = useState(role.color);
  const [description, setDescription] = useState(role.description ?? "");
  const [accessTier, setAccessTier] = useState(role.access_tier);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        id: role.id,
        label: label.trim(),
        color: color.trim() || "#003476",
        description: description.trim() || null,
      };
      if (!role.is_system) {
        body.access_tier = accessTier;
      }
      const res = await fetchWithTimeout("/api/admin/roles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        showToast(j.error ?? "Σφάλμα", "error");
        return;
      }
      showToast("Αποθηκεύτηκε.", "success");
      await onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <CenteredModal
      open
      onClose={onClose}
      title={`Επεξεργασία: ${role.name}`}
      ariaLabel="Επεξεργασία ρόλου"
      className="!max-w-md"
      footer={
        <>
          <button type="button" onClick={onClose} className={lux.btnSecondary} disabled={busy}>
            Άκυρο
          </button>
          <FormSubmitButton type="button" variant="gold" loading={busy} onClick={() => void save()}>
            Αποθήκευση
          </FormSubmitButton>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <HqLabel>Εμφανιζόμενο όνομα</HqLabel>
          <input className={lux.input} value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div>
          <HqLabel>Χρώμα (hex)</HqLabel>
          <input className={lux.input} value={color} onChange={(e) => setColor(e.target.value)} />
        </div>
        <div>
          <HqLabel>Περιγραφή</HqLabel>
          <textarea className={lux.textarea} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        {!role.is_system && (
          <div>
            <HqLabel>Επίπεδο πλοήγησης</HqLabel>
            <HqSelect value={accessTier} onChange={(e) => setAccessTier(e.target.value)}>
              <option value="caller">Περιορισμένο (όπως καλών)</option>
              <option value="manager">Πλήρες CRM (όπως διευθυντής)</option>
              <option value="admin">Πλήρες + διαχειριστικό</option>
            </HqSelect>
          </div>
        )}
      </div>
    </CenteredModal>
  );
}

function CreateRoleModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void | Promise<void> }) {
  const { showToast } = useFormToast();
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("#64748b");
  const [description, setDescription] = useState("");
  const [accessTier, setAccessTier] = useState("caller");
  const [cloneFrom, setCloneFrom] = useState("manager");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const n = name.trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{1,48}$/.test(n)) {
      showToast("Όνομα: latin μικρά, αριθμοί και _, π.χ. coordinator_north", "error");
      return;
    }
    if (!label.trim()) {
      showToast("Συμπληρώστε εμφανιζόμενο όνομα.", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await fetchWithTimeout("/api/admin/roles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: n,
          label: label.trim(),
          color: color.trim(),
          description: description.trim() || null,
          access_tier: accessTier,
          clone_from_role: cloneFrom,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        showToast(j.error ?? "Σφάλμα", "error");
        return;
      }
      showToast("Ο ρόλος δημιουργήθηκε. Ενεργοποιήστε δικαιοδοσίες παρακάτω.", "success");
      await onCreated();
    } finally {
      setBusy(false);
    }
  };

  return (
    <CenteredModal
      open
      onClose={onClose}
      title="Νέος ρόλος"
      ariaLabel="Νέος ρόλος"
      className="!max-w-md"
      footer={
        <>
          <button type="button" onClick={onClose} className={lux.btnSecondary} disabled={busy}>
            Άκυρο
          </button>
          <FormSubmitButton type="button" variant="gold" loading={busy} onClick={() => void submit()}>
            Δημιουργία
          </FormSubmitButton>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <HqLabel required>Όνομα (μοναδικό, latin)</HqLabel>
          <input className={lux.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="field_lead" autoComplete="off" />
        </div>
        <div>
          <HqLabel required>Εμφανιζόμενο όνομα</HqLabel>
          <input className={lux.input} value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div>
          <HqLabel>Χρώμα</HqLabel>
          <input className={lux.input} value={color} onChange={(e) => setColor(e.target.value)} />
        </div>
        <div>
          <HqLabel>Περιγραφή</HqLabel>
          <textarea className={lux.textarea} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <HqLabel>Πλοήγηση</HqLabel>
          <HqSelect value={accessTier} onChange={(e) => setAccessTier(e.target.value)}>
            <option value="caller">Περιορισμένη</option>
            <option value="manager">CRM πλήρες</option>
            <option value="admin">Διαχειριστικό</option>
          </HqSelect>
        </div>
        <div>
          <HqLabel>Αντιγραφή δικαιωδοσιών από</HqLabel>
          <HqSelect value={cloneFrom} onChange={(e) => setCloneFrom(e.target.value)}>
            <option value="caller">caller (Καλητής)</option>
            <option value="manager">manager (Διευθυντής)</option>
            <option value="admin">admin (Διαχειριστής)</option>
          </HqSelect>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Μετά μπορείτε να τις ρυθμίσετε ανά ρόλο παρακάτω.</p>
        </div>
      </div>
    </CenteredModal>
  );
}
