"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useProfile } from "@/contexts/profile-context";
import type { Role } from "@/lib/roles";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { hasMinRole } from "@/lib/roles";
import { lux } from "@/lib/luxury-styles";
import { CenteredModal } from "@/components/ui/centered-modal";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { HqSelect } from "@/components/ui/hq-select";
import { HqFieldError, HqLabel } from "@/components/ui/hq-form-primitives";
import { useFormToast } from "@/contexts/form-toast-context";
import { validateEmail, requiredText } from "@/lib/form-validation";
import { ElectoralSettingsSection } from "@/components/settings/electoral-settings-section";
import { GeographicDataSection } from "@/components/settings/geographic-data-section";
import { SavedFiltersSection } from "@/components/settings/saved-filters-section";
import { PortalNewsSection } from "@/components/settings/portal-news-section";
import { SocialMediaSettingsSection } from "@/components/settings/social-media-settings-section";
import { TelegramSettingsSection } from "@/components/settings/telegram-settings-section";
import { EmailSettingsSection } from "@/components/settings/email-settings-section";
import { WhatsappSettingsSection } from "@/components/settings/whatsapp-settings-section";
import { CampaignTypesSettingsSection } from "@/components/settings/campaign-types-section";
import { RetellAgentsSettingsSection } from "@/components/settings/retell-agents-section";
import type { ContactGroupRow } from "@/lib/contact-groups";
import type { EventCategoryRow } from "@/lib/event-categories";
import { CAL_EVENT_TYPE_KEYS, CALENDAR_EVENT_TYPES, SCHEDULE_EVENT_COLORS, type CalendarEventType } from "@/lib/calendar-event-types";
import type { ContactTagDefinitionRow } from "@/lib/contact-tag-definitions";
import type { PriorityLevelRow } from "@/lib/priority-levels";
import type { RequestCategoryRow } from "@/lib/request-categories";

type UserRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  joined_at: string;
  last_sign_in_at: string | null;
};

function GoogleCalendarReturnHandler({ onConnected }: { onConnected: () => void | Promise<void> }) {
  const sp = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    if (sp.get("g") !== "calendar_ok") return;
    void (async () => {
      await onConnected();
      router.replace("/settings", { scroll: false });
    })();
  }, [sp, router, onConnected]);
  return null;
}

export default function SettingsPage() {
  const { profile } = useProfile();
  const isAdmin = profile?.role === "admin";
  const canAccess = hasMinRole(profile?.role, "manager");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [integrations, setIntegrations] = useState<{
    retell: boolean;
    googleOAuthConfigured: boolean;
    hasStoredGoogleTokens: boolean;
  } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { showToast } = useFormToast();

  const loadUsers = useCallback(async () => {
    const res = await fetchWithTimeout("/api/admin/users");
    if (!res.ok) return;
    const data = await res.json();
    setUsers(data.users ?? []);
  }, []);

  const loadInt = useCallback(async () => {
    const res = await fetchWithTimeout("/api/admin/integrations");
    if (!res.ok) return;
    setIntegrations(await res.json());
  }, []);

  useEffect(() => {
    if (isAdmin) {
      void loadUsers();
    }
  }, [isAdmin, loadUsers]);

  useEffect(() => {
    if (canAccess) {
      void loadInt();
    }
  }, [canAccess, loadInt]);

  const googleConnected = Boolean(integrations?.hasStoredGoogleTokens);

  const setRole = async (userId: string, role: Role) => {
    setErr(null);
    const res = await fetchWithTimeout(`/api/admin/users/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      const msg = j.error ?? "Σφάλμα";
      setErr(msg);
      showToast(msg, "error");
      return;
    }
    showToast("Ο ρόλος ενημερώθηκε.", "success");
    await loadUsers();
  };

  const resetPassword = async (userId: string) => {
    setErr(null);
    const res = await fetchWithTimeout(`/api/admin/users/${userId}/reset-password`, { method: "POST" });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      const msg = j.error ?? "Σφάλμα";
      setErr(msg);
      showToast(msg, "error");
      return;
    }
    const msg = "Στάλθηκε email επαναφοράς (ελέγξτε spam).";
    setErr(msg);
    showToast(msg, "success");
  };

  const deleteUser = async (userId: string) => {
    setErr(null);
    const res = await fetchWithTimeout(`/api/admin/users/${userId}`, { method: "DELETE" });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      const msg = j.error ?? "Σφάλμα";
      setErr(msg);
      showToast(msg, "error");
      return;
    }
    showToast("Ο χρήστης διαγράφηκε.", "success");
    setDeleteId(null);
    await loadUsers();
  };

  const disconnectGoogle = async () => {
    await fetchWithTimeout("/api/auth/google/disconnect", { method: "DELETE" });
    await loadInt();
  };

  if (!canAccess) {
    return (
      <div className="w-full min-w-0 max-w-full overflow-x-hidden">
        <div className={lux.card + " w-full min-w-0 max-w-full !border-amber-500/40 !bg-[var(--status-noanswer-bg)] !shadow-sm"}>
          <p className="text-sm text-[var(--status-noanswer-text)]">Δεν έχετε πρόσβαση.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 max-w-full overflow-x-hidden">
    <div className="w-full min-w-0 max-w-full space-y-6 [&>section]:w-full [&>section]:min-w-0 [&>section]:max-w-full">
      {canAccess && (
        <Suspense fallback={null}>
          <GoogleCalendarReturnHandler onConnected={loadInt} />
        </Suspense>
      )}

      <TelegramSettingsSection />

      <EmailSettingsSection />

      <WhatsappSettingsSection />

      {isAdmin && (
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
        <div className="w-full min-w-0 overflow-x-auto rounded-lg border border-[var(--border)]">
            <table className="w-full min-w-[720px] text-sm">
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
                      <HqSelect
                        className="!h-9 max-w-[200px]"
                        value={u.role}
                        onChange={(e) => setRole(u.id, e.target.value as Role)}
                        disabled={u.id === profile?.id}
                        aria-label={`Ρόλος για ${u.email}`}
                      >
                        <option value="caller">Καλείς</option>
                        <option value="manager">Υπεύθυνος</option>
                        <option value="admin">Διαχειριστής</option>
                      </HqSelect>
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
      </section>
      )}

      {isAdmin && addOpen && (
        <AddUserModal
          onClose={() => setAddOpen(false)}
          onCreated={async () => {
            setAddOpen(false);
            await loadUsers();
          }}
        />
      )}

      {isAdmin && deleteId && (
        <ConfirmModal
          title="Διαγραφή χρήστη"
          body="Θα διαγραφούν ο λογαριασμός auth και το προφίλ. Η ενέργεια δεν ανακαλείται."
          confirmLabel="Διαγραφή"
          onCancel={() => setDeleteId(null)}
          onConfirm={() => void deleteUser(deleteId)}
        />
      )}

      {isAdmin && <EventCategoriesSection />}

      {isAdmin && <GroupsSection />}

      {isAdmin && <TagsSection />}

      {isAdmin && <ElectoralSettingsSection />}

      {isAdmin && <GeographicDataSection />}

      <SavedFiltersSection isAdmin={isAdmin} />

      <section className={lux.card}>
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h2 className={lux.sectionTitle + " mb-0"}>Σύνδεση Google Calendar</h2>
          {integrations && googleConnected && (
            <span className="inline-flex items-center rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-medium text-emerald-300 ring-1 ring-emerald-500/40">
              Συνδεδεμένο
            </span>
          )}
        </div>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">OAuth 2.0 — το ημερολόγιο εμφανίζεται μετά τη σύνδεση</p>
        <div className="flex flex-wrap items-center gap-2">
          {integrations === null && <span className="text-sm text-[var(--text-muted)]">Φόρτωση…</span>}
          {integrations && !googleConnected && (
            <a href="/api/auth/google" className={lux.btnPrimary}>
              Σύνδεση Google Calendar
            </a>
          )}
          {integrations && googleConnected && (
            <button
              type="button"
              onClick={() => void disconnectGoogle()}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-[var(--bg-card)] px-4 py-2.5 text-sm font-medium text-red-300 transition-all duration-150 hover:bg-red-500/10"
            >
              Αποσύνδεση
            </button>
          )}
        </div>
        {integrations && (
          <p className="mt-3 text-xs text-[var(--text-secondary)]">
            Ρυθμίσεις env: {integrations.googleOAuthConfigured ? "OK" : "Όχι"}
          </p>
        )}
      </section>

      {isAdmin && (
        <section className={lux.card}>
          <h2 className={lux.sectionTitle + " mb-2"}>Retell AI</h2>
          {integrations && (
            <p className="text-sm text-[var(--text-primary)]">
              Κατάσταση API:{" "}
              <span className="font-semibold text-[#16A34A]">{integrations.retell ? "Συνδεδεμένο" : "Μη ρυθμισμένο"}</span>
            </p>
          )}
        </section>
      )}

      {isAdmin && <CampaignTypesSettingsSection />}

      {isAdmin && <RetellAgentsSettingsSection />}

      {isAdmin && <NamedaySyncSection />}

      {isAdmin && <PriorityLevelsSection />}

      {isAdmin && <RequestCategoriesSettingsSection />}

      {isAdmin && <PortalNewsSection />}

      {isAdmin && <SocialMediaSettingsSection />}

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
    </div>
  );
}

function NamedaySyncSection() {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <section className={lux.card}>
      <h2 className={lux.pageTitle + " mb-1"}>Εορτολόγιο (βάση)</h2>
      <p className="mb-3 text-sm text-[var(--text-secondary)]">
        Αντικαθιστά όλα τα δεδομένα <code className="text-xs">name_days</code> με πλήρες ελληνικό ορθόδοξο εορτολόγιο
        (συγχώνευση παγίων ημερομηνιών + παραλλαγές). Εκτέλεση μία φορά μετά τη δημιουργία πινάκων.
      </p>
      {msg && (
        <p className="mb-2 text-sm text-amber-200" role="status">
          {msg}
        </p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setMsg(null);
          setBusy(true);
          try {
            const res = await fetchWithTimeout("/api/admin/nameday-sync", { method: "POST" });
            const j = (await res.json().catch(() => ({}))) as { error?: string; inserted?: number };
            if (!res.ok) {
              setMsg(j.error ?? "Σφάλμα");
              return;
            }
            setMsg(`Εισήχθησαν ${j.inserted ?? 0} ημέρες εορτολογίου.`);
          } finally {
            setBusy(false);
          }
        }}
        className={lux.btnPrimary + " w-full !py-2.5 sm:w-auto"}
      >
        {busy ? "…" : "Συγχρονισμός εορτολογίου"}
      </button>
    </section>
  );
}

function PriorityLevelsSection() {
  const [rows, setRows] = useState<PriorityLevelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetchWithTimeout("/api/admin/priority-levels");
      if (!res.ok) return;
      const d = (await res.json()) as { levels?: PriorityLevelRow[] };
      setRows(d.levels ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byKey = (k: string) => rows.find((r) => r.key === k);

  const setField = (key: string, field: "label" | "color", value: string) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  };

  const save = async () => {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetchWithTimeout("/api/admin/priority-levels", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ levels: rows.map((r) => ({ key: r.key, label: r.label.trim(), color: r.color.trim() })) }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErr(j.error ?? "Σφάλμα");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={lux.card}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className={lux.pageTitle + " mb-1"}>Προτεραιότητες</h2>
          <p className="text-sm text-[var(--text-secondary)]">Υψηλή / Μεσαία / Χαμηλή — ετικέτες και χρώμα (εργασίες, φίλτρα)</p>
        </div>
        <button type="button" onClick={() => void save()} disabled={busy || loading} className={lux.btnPrimary + " w-full !py-2.5 sm:w-auto"}>
          {busy ? "…" : "Αποθήκευση"}
        </button>
      </div>
      {err && (
        <p className="mb-2 text-sm text-amber-200" role="status">
          {err}
        </p>
      )}
      {loading && <p className="text-sm text-[var(--text-muted)]">Φόρτωση…</p>}
      <div className="w-full min-w-0 overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full min-w-[400px] text-sm">
          <thead>
            <tr className={lux.tableHead + " border-b border-[var(--border)]"}>
              <th className="p-3 pl-4 text-left">Κλειδί</th>
              <th className="p-3 text-left">Ετικέτα</th>
              <th className="p-3 pr-4 text-left">Χρώμα</th>
            </tr>
          </thead>
          <tbody>
            {["High", "Medium", "Low"].map((k) => {
              const r = byKey(k);
              if (!r) return null;
              return (
                <tr key={k} className="border-b border-[var(--border)] last:border-0">
                  <td className="p-3 pl-4 font-mono text-xs text-[var(--text-muted)]">{k}</td>
                  <td className="p-3">
                    <input className={lux.input + " !h-9"} value={r.label} onChange={(e) => setField(k, "label", e.target.value)} />
                  </td>
                  <td className="p-3 pr-4">
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        className="h-9 w-12 cursor-pointer rounded border border-[var(--border)]"
                        value={r.color}
                        onChange={(e) => setField(k, "color", e.target.value)}
                      />
                      <input
                        className={lux.input + " h-9 max-w-[120px] font-mono text-xs"}
                        value={r.color}
                        onChange={(e) => setField(k, "color", e.target.value)}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RequestCategoriesSettingsSection() {
  const [rows, setRows] = useState<RequestCategoryRow[]>([]);
  const [editing, setEditing] = useState<RequestCategoryRow | "new" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [delId, setDelId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetchWithTimeout("/api/admin/request-categories");
    if (!res.ok) return;
    const d = (await res.json()) as { categories?: RequestCategoryRow[] };
    setRows(d.categories ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className={lux.card}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className={lux.pageTitle + " mb-1"}>Κατηγορίες Αιτημάτων</h2>
          <p className="text-sm text-[var(--text-secondary)]">Ονομασία και χρώμα (η στήλη `category` στα αιτήματα κρατά κείμενο)</p>
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
        <p className="mb-2 text-sm text-amber-200" role="status">
          {err}
        </p>
      )}
      <div className="w-full min-w-0 overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full min-w-[360px] text-sm">
          <thead>
            <tr className={lux.tableHead + " border-b border-[var(--border)]"}>
              <th className="p-3 pl-4 text-left">Όνομα</th>
              <th className="p-3 text-left">Χρώμα</th>
              <th className="p-3 pr-4 text-right">Ενέργειες</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.id} className="border-b border-[var(--border)] last:border-0">
                <td className="p-3 pl-4 font-medium text-[var(--text-primary)]">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full border border-[var(--border)]"
                      style={{ background: g.color }}
                    />
                    {g.name}
                  </span>
                </td>
                <td className="p-3 font-mono text-xs text-[var(--text-secondary)]">{g.color}</td>
                <td className="p-3 pr-4 text-right">
                  <button
                    type="button"
                    className={lux.btnSecondary + " !px-2 !py-1.5 text-xs"}
                    onClick={() => {
                      setErr(null);
                      setEditing(g);
                    }}
                  >
                    Επεξεργασία
                  </button>{" "}
                  <button type="button" className={lux.btnDanger + " !px-2 !py-1.5 text-xs"} onClick={() => setDelId(g.id)}>
                    Διαγραφή
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <RequestCategoryModal
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
          title="Διαγραφή κατηγορίας"
          body="Υπάρχοντα αιτήματα κρατούν το παλιό κείμενο category."
          confirmLabel="Διαγραφή"
          onCancel={() => setDelId(null)}
          onConfirm={async () => {
            setErr(null);
            const res = await fetchWithTimeout(`/api/admin/request-categories/${delId}`, { method: "DELETE" });
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

function RequestCategoryModal({
  initial,
  onClose,
  onSaved,
  onError,
}: {
  initial: RequestCategoryRow | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onError: (e: string | null) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? "#6B7280");
  const [sort, setSort] = useState(initial != null ? String(initial.sort_order) : "0");
  const [busy, setBusy] = useState(false);
  const [nameErr, setNameErr] = useState<string | null>(null);
  useEffect(() => {
    setName(initial?.name ?? "");
    setColor(initial?.color ?? "#6B7280");
    setSort(initial != null ? String(initial.sort_order) : "0");
  }, [initial]);
  const save = async () => {
    onError(null);
    setNameErr(null);
    const req = requiredText(name, "όνομα");
    if (req) {
      setNameErr(req);
      onError(req);
      return;
    }
    const so = parseInt(sort, 10);
    setBusy(true);
    try {
      const isNew = !initial;
      const res = await fetchWithTimeout(
        isNew ? "/api/admin/request-categories" : `/api/admin/request-categories/${initial!.id}`,
        {
          method: isNew ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), color: color.trim(), sort_order: Number.isFinite(so) ? so : 0 }),
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
    <CenteredModal
      open
      onClose={onClose}
      title={initial ? "Επεξεργασία κατηγορίας" : "Νέα κατηγορία"}
      ariaLabel={initial ? "Επεξεργασία κατηγορίας" : "Νέα κατηγορία"}
      className="!max-w-md"
      footer={
        <>
          <button type="button" className={lux.btnSecondary} onClick={onClose} disabled={busy}>
            Άκυρο
          </button>
          <button type="button" className={lux.btnPrimary} onClick={() => void save()} disabled={busy}>
            {busy ? "…" : "Αποθήκευση"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <HqLabel htmlFor="rc-name" required>
            Όνομα
          </HqLabel>
          <input
            id="rc-name"
            className={[lux.input, nameErr ? lux.inputError : ""].join(" ")}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameErr(null);
            }}
            autoFocus={!initial}
          />
          <HqFieldError>{nameErr}</HqFieldError>
        </div>
        <div>
          <HqLabel>Χρώμα</HqLabel>
          <div className="mt-1 flex items-center gap-2">
            <input type="color" className="h-10 w-14 cursor-pointer rounded border" value={color} onChange={(e) => setColor(e.target.value)} />
            <input className={lux.input + " font-mono text-sm"} value={color} onChange={(e) => setColor(e.target.value)} />
          </div>
        </div>
        <div>
          <HqLabel htmlFor="rc-sort">Σειρά</HqLabel>
          <input
            id="rc-sort"
            className={lux.input}
            inputMode="numeric"
            value={sort}
            onChange={(e) => setSort(e.target.value.replace(/[^\d-]/g, ""))}
          />
        </div>
      </div>
    </CenteredModal>
  );
}

function buildDefaultEventCategories() {
  return CAL_EVENT_TYPE_KEYS.map((k) => ({
    type_key: k,
    name: CALENDAR_EVENT_TYPES[k].label,
    color: SCHEDULE_EVENT_COLORS[k],
  }));
}

function EventCategoriesSection() {
  type CatRow = ReturnType<typeof buildDefaultEventCategories>[number];
  const [rows, setRows] = useState<CatRow[]>(() => buildDefaultEventCategories());
  const [draft, setDraft] = useState<CatRow[]>(() => buildDefaultEventCategories());
  const [modalOpen, setModalOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetchWithTimeout("/api/admin/event-categories");
      if (res.status === 401) return;
      if (!res.ok) {
        setErr("Φόρτωση κατηγοριών απέτυχε. Χρήση προεπιλογών.");
        setRows(buildDefaultEventCategories());
        return;
      }
      const d = (await res.json()) as { categories?: EventCategoryRow[] };
      const by = new Map((d.categories ?? []).map((c) => [c.type_key, c] as const));
      setRows(
        buildDefaultEventCategories().map((def) => {
          const found = by.get(def.type_key);
          return found
            ? { type_key: def.type_key, name: found.name, color: found.color }
            : def;
        }),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openModal = () => {
    setErr(null);
    setDraft(rows.map((r) => ({ ...r })));
    setModalOpen(true);
  };

  const persist = async (cats: CatRow[]) => {
    setErr(null);
    for (const r of cats) {
      if (!r.name?.trim()) {
        setErr("Όλες οι γραμμές χρειάζονται μη κενό όνομα");
        return false;
      }
    }
    setBusy(true);
    try {
      const res = await fetchWithTimeout("/api/admin/event-categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categories: cats.map((r) => ({ type_key: r.type_key, name: r.name.trim(), color: r.color.trim() })) }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErr(j.error ?? "Σφάλμα αποθήκευσης");
        return false;
      }
      await load();
      return true;
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={lux.card}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className={lux.pageTitle + " mb-1"}>Κατηγορίες Events</h2>
          <p className="text-sm text-[var(--text-secondary)]">Χρώματα και εμφανιζόμενα ονόματα τύπων στο πρόγραμμα (4 τύποι συστήματος)</p>
        </div>
        <button type="button" onClick={openModal} disabled={loading} className={lux.btnPrimary + " w-full !py-2.5 sm:w-auto"}>
          Επεξεργασία στο παράθυρο
        </button>
      </div>
      {err && !modalOpen && (
        <p className="mb-3 text-sm text-amber-200" role="status">
          {err}
        </p>
      )}
      {loading && <p className="mb-3 text-sm text-[var(--text-muted)]">Φόρτωση…</p>}
      <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
        {rows.map((r) => (
          <li key={r.type_key} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <span
              className="h-3 w-3 shrink-0 rounded-full border border-[var(--border)]"
              style={{ background: r.color }}
              title={r.color}
            />
            <span className="min-w-0 flex-1 font-medium text-[var(--text-primary)]">{r.name}</span>
            <span className="text-xs text-[var(--text-muted)]">
              {CALENDAR_EVENT_TYPES[r.type_key as CalendarEventType].label} · <span className="font-mono">{r.type_key}</span>
            </span>
          </li>
        ))}
      </ul>

      <CenteredModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setErr(null);
        }}
        title="Κατηγορίες events"
        ariaLabel="Επεξεργασία κατηγοριών events"
        className="!max-w-lg"
        footer={
          <>
            <button
              type="button"
              className={lux.btnSecondary}
              disabled={busy}
              onClick={() => {
                setModalOpen(false);
                setErr(null);
              }}
            >
              Άκυρο
            </button>
            <button type="button" className={lux.btnPrimary} disabled={busy} onClick={() => void persist(draft).then((ok) => ok && setModalOpen(false))}>
              {busy ? "…" : "Αποθήκευση"}
            </button>
          </>
        }
      >
        {err && (
          <p className="mb-3 text-sm text-amber-200" role="status">
            {err}
          </p>
        )}
        <div className="w-full min-w-0 overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className={lux.tableHead + " border-b border-[var(--border)]"}>
                <th className="p-3 pl-4 text-left">Τύπος (σύστημα)</th>
                <th className="p-3 text-left">Όνομα</th>
                <th className="p-3 pr-4 text-left">Χρώμα</th>
              </tr>
            </thead>
            <tbody>
              {draft.map((r) => (
                <tr key={r.type_key} className="border-b border-[var(--border)] last:border-0">
                  <td className="p-3 pl-4 text-[var(--text-secondary)]">
                    {CALENDAR_EVENT_TYPES[r.type_key as CalendarEventType].label}
                    <span className="mt-0.5 block text-[10px] font-mono text-[var(--text-muted)]">{r.type_key}</span>
                  </td>
                  <td className="p-3">
                    <input
                      className={lux.input + " !h-9"}
                      value={r.name}
                      onChange={(e) =>
                        setDraft((prev) => prev.map((x) => (x.type_key === r.type_key ? { ...x, name: e.target.value } : x)))
                      }
                    />
                  </td>
                  <td className="p-3 pr-4">
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        className="h-9 w-12 cursor-pointer rounded border border-[var(--border)] bg-[var(--input-bg)]"
                        value={r.color}
                        onChange={(e) =>
                          setDraft((prev) => prev.map((x) => (x.type_key === r.type_key ? { ...x, color: e.target.value } : x)))
                        }
                      />
                      <input
                        className={lux.input + " h-9 max-w-[120px] font-mono text-xs"}
                        value={r.color}
                        onChange={(e) =>
                          setDraft((prev) => prev.map((x) => (x.type_key === r.type_key ? { ...x, color: e.target.value } : x)))
                        }
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CenteredModal>
    </section>
  );
}

function TagsSection() {
  const [rows, setRows] = useState<ContactTagDefinitionRow[]>([]);
  const [editing, setEditing] = useState<ContactTagDefinitionRow | null | "new">(null);
  const [err, setErr] = useState<string | null>(null);
  const [delId, setDelId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetchWithTimeout("/api/admin/contact-tags");
    if (!res.ok) return;
    const d = (await res.json()) as { tags: ContactTagDefinitionRow[] };
    setRows(d.tags ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className={lux.card}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className={lux.pageTitle + " mb-1"}>Ετικέτες</h2>
          <p className="text-sm text-[var(--text-secondary)]">Λεξιλόγιο ετικετών και χρώμα εμφάνισης· το πεδίο tags στις επαφές παραμένει ως έχει.</p>
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
        <table className="w-full min-w-[360px] text-sm">
          <thead>
            <tr className={lux.tableHead + " border-b border-[var(--border)]"}>
              <th className="p-3 pl-4 text-left">Όνομα</th>
              <th className="p-3 text-left">Χρώμα</th>
              <th className="p-3 pr-4 text-right">Ενέργειες</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-elevated)]">
                <td className="p-3 pl-4 font-medium text-[var(--text-primary)]">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full border border-[var(--border)]"
                      style={{ background: g.color || "#6B7280" }}
                    />
                    {g.name}
                  </span>
                </td>
                <td className="p-3 font-mono text-xs text-[var(--text-secondary)]">{g.color}</td>
                <td className="p-3 pr-4 text-right">
                  <button
                    type="button"
                    className={lux.btnSecondary + " !px-2 !py-1.5 text-xs"}
                    onClick={() => {
                      setErr(null);
                      setEditing(g);
                    }}
                  >
                    Επεξεργασία
                  </button>{" "}
                  <button type="button" className={lux.btnDanger + " !px-2 !py-1.5 text-xs"} onClick={() => setDelId(g.id)}>
                    Διαγραφή
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-6 text-center text-sm text-[var(--text-muted)]">Καμία ετικέτα ακόμη — Προσθέστε.</p>}
      </div>

      {editing != null && (
        <TagEditModal
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
          title="Διαγραφή ετικέτας"
          body="Η ετικέτα διαγράφεται από το λεξιλόγιο. Τα υπάρχοντα tags στις επαφές δεν αλλάζουν αυτόματα."
          confirmLabel="Διαγραφή"
          onCancel={() => setDelId(null)}
          onConfirm={async () => {
            setErr(null);
            const res = await fetchWithTimeout(`/api/admin/contact-tags/${delId}`, { method: "DELETE" });
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

function TagEditModal({
  initial,
  onClose,
  onSaved,
  onError,
}: {
  initial: ContactTagDefinitionRow | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onError: (e: string | null) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? "#6B7280");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(initial?.name ?? "");
    setColor(initial?.color ?? "#6B7280");
  }, [initial]);

  const save = async () => {
    onError(null);
    if (!name.trim()) {
      onError("Υποχρεωτικό όνομα");
      return;
    }
    setBusy(true);
    try {
      const isNew = !initial;
      const res = await fetchWithTimeout(
        isNew ? "/api/admin/contact-tags" : `/api/admin/contact-tags/${initial!.id}`,
        {
          method: isNew ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), color: color.trim() || "#6B7280" }),
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
    <CenteredModal
      open
      onClose={onClose}
      title={initial ? "Επεξεργασία ετικέτας" : "Νέα ετικέτα"}
      ariaLabel={initial ? "Επεξεργασία ετικέτας" : "Νέα ετικέτα"}
      className="!max-w-lg"
      footer={
        <>
          <button type="button" onClick={onClose} className={lux.btnSecondary} disabled={busy}>
            Άκυρο
          </button>
          <button type="button" onClick={() => void save()} className={lux.btnPrimary} disabled={busy}>
            {busy ? "…" : "Αποθήκευση"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <HqLabel htmlFor="tag-name" required>
            Όνομα
          </HqLabel>
          <input
            id="tag-name"
            className={lux.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus={!initial}
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
    </CenteredModal>
  );
}

function GroupsSection() {
  const [rows, setRows] = useState<ContactGroupRow[]>([]);
  const [editing, setEditing] = useState<ContactGroupRow | null | "new">(null);
  const [err, setErr] = useState<string | null>(null);
  const [delId, setDelId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetchWithTimeout("/api/groups");
    if (!res.ok) return;
    const d = (await res.json()) as { groups: ContactGroupRow[] };
    setRows(d.groups ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className={lux.card}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className={lux.pageTitle + " mb-1"}>Ομάδες Επαφών</h2>
          <p className="text-sm text-[var(--text-secondary)]">Ομάδες επαφών (χρώμα, έτος, περιγραφή) — εμφάνιση στην λίστα επαφών</p>
        </div>
        <button type="button" onClick={() => { setErr(null); setEditing("new"); }} className={lux.btnPrimary + " w-full !py-2.5 sm:w-auto"}>
          Προσθήκη
        </button>
      </div>
      {err && (
        <p className="mb-3 text-sm text-[var(--status-negative-text)]" role="status">
          {err}
        </p>
      )}
      <div className="w-full min-w-0 overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className={lux.tableHead + " border-b border-[var(--border)]"}>
              <th className="p-3 pl-4 text-left">Όνομα</th>
              <th className="p-3 text-left">Χρώμα</th>
              <th className="p-3 text-left">Έτος</th>
              <th className="p-3 text-left">Περιγραφή</th>
              <th className="p-3 pr-4 text-right">Ενέργειες</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-elevated)]">
                <td className="p-3 pl-4 font-medium text-[var(--text-primary)]">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full border border-[var(--border)]"
                      style={{ background: g.color || "#003476" }}
                      title={g.color}
                    />
                    {g.name}
                  </span>
                </td>
                <td className="p-3 font-mono text-xs text-[var(--text-secondary)]">{g.color}</td>
                <td className="p-3 text-[var(--text-secondary)]">{g.year != null ? g.year : "—"}</td>
                <td className="max-w-xs truncate p-3 text-[var(--text-secondary)]" title={g.description ?? ""}>
                  {g.description || "—"}
                </td>
                <td className="p-3 pr-4 text-right">
                  <button
                    type="button"
                    className={lux.btnSecondary + " !px-2 !py-1.5 text-xs"}
                    onClick={() => {
                      setErr(null);
                      setEditing(g);
                    }}
                  >
                    Επεξεργασία
                  </button>{" "}
                  <button type="button" className={lux.btnDanger + " !px-2 !py-1.5 text-xs"} onClick={() => setDelId(g.id)}>
                    Διαγραφή
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-6 text-center text-sm text-[var(--text-muted)]">Καμία ομάδα ακόμη.</p>}
      </div>

      {editing != null && (
        <GroupEditModal
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
          title="Διαγραφή ομάδας"
          body="Οι επαφές δεν θα διαγραφούν· απλώς θα αφαιρεθεί η σύνδεση (group_id = κενό)."
          confirmLabel="Διαγραφή"
          onCancel={() => setDelId(null)}
          onConfirm={async () => {
            setErr(null);
            const res = await fetchWithTimeout(`/api/groups/${delId}`, { method: "DELETE" });
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

function GroupEditModal({
  initial,
  onClose,
  onSaved,
  onError,
}: {
  initial: ContactGroupRow | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onError: (e: string | null) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? "#003476");
  const [year, setYear] = useState(initial?.year != null ? String(initial.year) : "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(initial?.name ?? "");
    setColor(initial?.color ?? "#003476");
    setYear(initial?.year != null ? String(initial.year) : "");
    setDescription(initial?.description ?? "");
  }, [initial]);

  const save = async () => {
    onError(null);
    if (!name.trim()) {
      onError("Υποχρεωτικό το όνομα");
      return;
    }
    setBusy(true);
    try {
      const y = year.trim() === "" ? null : parseInt(year, 10);
      const payload = {
        name: name.trim(),
        color: color.trim() || "#003476",
        year: y != null && Number.isFinite(y) ? y : null,
        description: description.trim() ? description.trim() : null,
      };
      const isNew = !initial;
      const res = await fetchWithTimeout(isNew ? "/api/groups" : `/api/groups/${initial!.id}`, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
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
    <CenteredModal
      open
      onClose={onClose}
      title={initial ? "Επεξεργασία ομάδας" : "Νέα ομάδα"}
      ariaLabel={initial ? "Επεξεργασία ομάδας" : "Νέα ομάδα"}
      className="!max-w-lg"
      footer={
        <>
          <button type="button" onClick={onClose} className={lux.btnSecondary} disabled={busy}>
            Άκυρο
          </button>
          <button type="button" onClick={() => void save()} className={lux.btnPrimary} disabled={busy}>
            {busy ? "…" : "Αποθήκευση"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <HqLabel htmlFor="grp-name" required>
            Όνομα
          </HqLabel>
          <input id="grp-name" className={lux.input} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <HqLabel>Χρώμα</HqLabel>
          <div className="mt-1 flex items-center gap-3">
            <input type="color" className="h-10 w-14 cursor-pointer rounded border border-[var(--border)] bg-[var(--input-bg)]" value={color} onChange={(e) => setColor(e.target.value)} />
            <input className={lux.input + " flex-1 font-mono text-sm"} value={color} onChange={(e) => setColor(e.target.value)} />
          </div>
        </div>
        <div>
          <HqLabel htmlFor="grp-year">Έτος (π.χ. 2025)</HqLabel>
          <input
            id="grp-year"
            className={lux.input}
            inputMode="numeric"
            placeholder="Κενό = οποιοδήποτε"
            value={year}
            onChange={(e) => setYear(e.target.value.replace(/\D/g, ""))}
          />
        </div>
        <div>
          <HqLabel htmlFor="grp-desc">Περιγραφή (εμφανίζεται στο ? στην λίστα)</HqLabel>
          <textarea id="grp-desc" className={lux.textarea} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>
    </CenteredModal>
  );
}

function AddUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void | Promise<void> }) {
  const { showToast } = useFormToast();
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
      showToast("Συμπληρώστε όλα τα πεδία.", "error");
      return;
    }
    const em = validateEmail(email);
    if (em) {
      setLocalErr(em);
      showToast(em, "error");
      return;
    }
    if (password.length < 8) {
      setLocalErr("Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες");
      showToast("Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες.", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await fetchWithTimeout("/api/admin/users/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: full_name.trim(), email: email.trim(), password, role }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        const msg = j.error ?? "Σφάλμα";
        setLocalErr(msg);
        showToast(msg, "error");
        return;
      }
      showToast("Ο χρήστης δημιουργήθηκε.", "success");
      await onCreated();
    } catch {
      showToast("Σφάλμα δικτύου.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <CenteredModal
      open
      onClose={onClose}
      title="Νέος χρήστης"
      ariaLabel="Νέος χρήστης"
      className="!max-w-md"
      footer={
        <>
          <button type="button" onClick={onClose} className={lux.btnSecondary} disabled={busy}>
            Άκυρο
          </button>
          <FormSubmitButton type="button" variant="gold" loading={busy} onClick={() => void submit()}>
            Δημιουργία χρήστη
          </FormSubmitButton>
        </>
      }
    >
      <div className="space-y-4">
        {localErr && <p className="text-sm text-red-300">{localErr}</p>}
        <div>
          <HqLabel required>Πλήρες όνομα</HqLabel>
          <input className={lux.input} value={full_name} onChange={(e) => setFull(e.target.value)} autoComplete="name" />
        </div>
        <div>
          <HqLabel required>Email</HqLabel>
          <input className={lux.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        </div>
        <div>
          <HqLabel required>Κωδικός (ελάχ. 8)</HqLabel>
          <input
            className={lux.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <div>
          <HqLabel>Ρόλος</HqLabel>
          <HqSelect value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="caller">Καλείς</option>
            <option value="manager">Υπεύθυνος</option>
            <option value="admin">Διαχειριστής</option>
          </HqSelect>
        </div>
      </div>
    </CenteredModal>
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
    <CenteredModal
      open
      onClose={onCancel}
      title={title}
      ariaLabel={title}
      className="!max-w-sm"
      footer={
        <>
          <button type="button" onClick={onCancel} className={lux.btnSecondary + " w-full sm:w-auto"}>
            Άκυρο
          </button>
          <button type="button" onClick={onConfirm} className={lux.btnDanger + " w-full sm:w-auto"}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-[var(--text-secondary)]">{body}</p>
    </CenteredModal>
  );
}
