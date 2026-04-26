"use client";

import { useCallback, useEffect, useState } from "react";
import { useProfile } from "@/contexts/profile-context";
import type { Role } from "@/lib/roles";
import { lux } from "@/lib/luxury-styles";

type UserRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  joined_at: string;
  last_sign_in_at: string | null;
};

export default function SettingsPage() {
  const { profile } = useProfile();
  const isAdmin = profile?.role === "admin";
  const [users, setUsers] = useState<UserRow[]>([]);
  const [integrations, setIntegrations] = useState<{
    retell: boolean;
    googleOAuthConfigured: boolean;
    hasStoredGoogleTokens: boolean;
  } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (!res.ok) return;
    const data = await res.json();
    setUsers(data.users ?? []);
  }, []);

  const loadInt = useCallback(async () => {
    const res = await fetch("/api/admin/integrations");
    if (!res.ok) return;
    setIntegrations(await res.json());
  }, []);

  useEffect(() => {
    if (isAdmin) {
      void loadUsers();
      void loadInt();
    }
  }, [isAdmin, loadUsers, loadInt]);

  const setRole = async (userId: string, role: Role) => {
    setErr(null);
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(j.error ?? "Σφάλμα");
      return;
    }
    await loadUsers();
  };

  const resetPassword = async (userId: string) => {
    setErr(null);
    const res = await fetch(`/api/admin/users/${userId}/reset-password`, { method: "POST" });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(j.error ?? "Σφάλμα");
      return;
    }
    setErr("Στάλθηκε email επαναφοράς (ελέγξτε spam).");
  };

  const deleteUser = async (userId: string) => {
    setErr(null);
    const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(j.error ?? "Σφάλμα");
      return;
    }
    setDeleteId(null);
    await loadUsers();
  };

  const disconnectGoogle = async () => {
    await fetch("/api/auth/google/disconnect", { method: "DELETE" });
    await loadInt();
  };

  if (!isAdmin) {
    return (
      <div className={lux.card + " border-amber-200/80 bg-amber-50 !shadow-sm"}>
        <p className="text-sm text-amber-900">Δεν έχετε πρόσβαση.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className={lux.card}>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className={lux.pageTitle + " mb-1"}>Διαχείριση Χρηστών</h2>
            <p className="text-sm text-[var(--text-secondary)]">Ρόλοι, σύνδεση και ενέργειες λογαριασμού</p>
          </div>
          <button type="button" onClick={() => setAddOpen(true)} className={lux.btnPrimary + " w-full !py-2.5 sm:w-auto"}>
            Προσθήκη χρήστη
          </button>
        </div>
        {err && (
          <p className="mb-3 text-sm text-amber-200" role="status">
            {err}
          </p>
        )}
        <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
          <div className="min-w-[720px]">
            <table className="w-full text-sm">
              <thead>
                <tr className={lux.tableHead + " border-b border-[var(--border)]"}>
                  <th className="sticky left-0 z-10 min-w-[140px] bg-[var(--bg-elevated)] p-3 pl-4">Όνομα</th>
                  <th className="p-3">Email</th>
                  <th className="p-3 min-w-[200px]">Ρόλος (επεξεργασία)</th>
                  <th className="p-3">Τελ. σύνδεση</th>
                  <th className="p-3 pr-4">Ημ/νία</th>
                  <th className="p-3 pr-4 text-right">Ενέργειες</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-elevated)]">
                    <td className="sticky left-0 z-10 bg-[var(--bg-card)] p-3 pl-4 font-medium text-[var(--text-primary)]">
                      {u.full_name ?? "—"}
                    </td>
                    <td className="p-3 text-[var(--text-secondary)]">{u.email}</td>
                    <td className="p-3">
                      <select
                        className={lux.select + " !h-9 max-w-[200px]"}
                        value={u.role}
                        onChange={(e) => setRole(u.id, e.target.value as Role)}
                        disabled={u.id === profile?.id}
                        aria-label={`Ρόλος για ${u.email}`}
                      >
                        <option value="caller">Καλείς</option>
                        <option value="manager">Υπεύθυνος</option>
                        <option value="admin">Διαχειριστής</option>
                      </select>
                    </td>
                    <td className="p-3 text-[var(--text-secondary)]">
                      {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString("el-GR") : "—"}
                    </td>
                    <td className="p-3 text-[var(--text-secondary)]">
                      {u.joined_at ? new Date(u.joined_at).toLocaleDateString("el-GR") : "—"}
                    </td>
                    <td className="p-3 pr-4 text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        <button
                          type="button"
                          className={lux.btnSecondary + " !px-2 !py-1.5 text-xs"}
                          onClick={() => void resetPassword(u.id)}
                        >
                          Επαναφορά κωδικού
                        </button>
                        <button
                          type="button"
                          className={lux.btnDanger + " !px-2 !py-1.5 text-xs"}
                          disabled={u.id === profile?.id}
                          onClick={() => setDeleteId(u.id)}
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
        </div>
      </section>

      {addOpen && (
        <AddUserModal
          onClose={() => setAddOpen(false)}
          onCreated={async () => {
            setAddOpen(false);
            await loadUsers();
          }}
        />
      )}

      {deleteId && (
        <ConfirmModal
          title="Διαγραφή χρήστη"
          body="Θα διαγραφούν ο λογαριασμός auth και το προφίλ. Η ενέργεια δεν ανακαλείται."
          confirmLabel="Διαγραφή"
          onCancel={() => setDeleteId(null)}
          onConfirm={() => void deleteUser(deleteId)}
        />
      )}

      <section className={lux.card}>
        <h2 className={lux.sectionTitle + " mb-1"}>Σύνδεση Google Calendar</h2>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">OAuth 2.0 — το ημερολόγιο εμφανίζεται μετά τη σύνδεση</p>
        <div className="flex flex-wrap gap-2">
          <a href="/api/auth/google" className={lux.btnPrimary}>
            Σύνδεση / ανανέωση
          </a>
          <button
            type="button"
            onClick={() => void disconnectGoogle()}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-[var(--bg-card)] px-4 py-2.5 text-sm font-medium text-red-300 transition-all duration-150 hover:bg-red-500/10"
          >
            Αποσύνδεση
          </button>
        </div>
        {integrations && (
          <p className="mt-3 text-xs text-[var(--text-secondary)]">
            Ρυθμίσεις env: {integrations.googleOAuthConfigured ? "OK" : "Όχι"} · Αποθηκευμένα tokens:{" "}
            {integrations.hasStoredGoogleTokens ? "Ναι" : "Όχι"}
          </p>
        )}
      </section>

      <section className={lux.card}>
        <h2 className={lux.sectionTitle + " mb-2"}>Retell AI</h2>
        {integrations && (
          <p className="text-sm text-[var(--text-primary)]">
            Κατάσταση API:{" "}
            <span className="font-semibold text-[#16A34A]">{integrations.retell ? "Συνδεδεμένο" : "Μη ρυθμισμένο"}</span>
          </p>
        )}
      </section>

      <section className={lux.card}>
        <h2 className={lux.sectionTitle + " mb-2"}>Γενικά</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Όνομα εφαρμογής: <strong className="text-[var(--text-primary)]">Καραγκούνης CRM</strong>
        </p>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Πολιτική φιγούρα: <strong className="text-[var(--text-primary)]">Κώστας Καραγκούνης</strong>
        </p>
      </section>
    </div>
  );
}

function AddUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void | Promise<void> }) {
  const [full_name, setFull] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("caller");
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setLocalErr(null);
    if (!full_name.trim() || !email.trim() || !password) {
      setLocalErr("Συμπληρώστε όλα τα πεδία");
      return;
    }
    if (password.length < 8) {
      setLocalErr("Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/users/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: full_name.trim(), email: email.trim(), password, role }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setLocalErr(j.error ?? "Σφάλμα");
        return;
      }
      await onCreated();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={lux.modalOverlay}>
      <div className={lux.modalPanel}>
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4 sm:px-6">
          <h3 className="text-lg font-bold text-[var(--text-primary)]">Νέος χρήστης</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
            aria-label="Κλείσιμο"
          >
            <span className="text-2xl leading-none">×</span>
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
          {localErr && <p className="text-sm text-red-300">{localErr}</p>}
          <div>
            <label className={lux.label}>Πλήρες όνομα *</label>
            <input className={lux.input} value={full_name} onChange={(e) => setFull(e.target.value)} autoComplete="name" />
          </div>
          <div>
            <label className={lux.label}>Email *</label>
            <input className={lux.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          </div>
          <div>
            <label className={lux.label}>Κωδικός (ελάχ. 8) *</label>
            <input
              className={lux.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className={lux.label}>Ρόλος</label>
            <select className={lux.select} value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="caller">Καλείς</option>
              <option value="manager">Υπεύθυνος</option>
              <option value="admin">Διαχειριστής</option>
            </select>
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-[var(--border)] px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button type="button" onClick={onClose} className={lux.btnSecondary} disabled={busy}>
            Άκυρο
          </button>
          <button type="button" onClick={() => void submit()} className={lux.btnPrimary} disabled={busy}>
            {busy ? "…" : "Δημιουργία χρήστη"}
          </button>
        </div>
      </div>
    </div>
  );
}

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
    <div className={lux.modalOverlay}>
      <div className="mx-4 w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-2xl sm:mx-0 sm:max-h-[90vh] sm:self-center">
        <h4 className="text-lg font-bold text-[var(--text-primary)]">{title}</h4>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">{body}</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} className={lux.btnSecondary + " w-full sm:w-auto"}>
            Άκυρο
          </button>
          <button type="button" onClick={onConfirm} className={lux.btnDanger + " w-full sm:w-auto"}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
