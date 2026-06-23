"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { lux } from "@/lib/luxury-styles";
import { CenteredModal } from "@/components/ui/centered-modal";
import { HqFieldError, HqLabel } from "@/components/ui/hq-form-primitives";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useFormToast } from "@/contexts/form-toast-context";
import {
  formatUnlinkedLegacyNameLabel,
  type StaffAlias,
  type StaffProfileRow,
  type UnlinkedLegacyName,
} from "@/lib/staff-aliases";

export function StaffAliasesSettingsSection() {
  const [profiles, setProfiles] = useState<StaffProfileRow[]>([]);
  const [unlinked, setUnlinked] = useState<UnlinkedLegacyName[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [addForProfile, setAddForProfile] = useState<StaffProfileRow | null>(null);
  const [prefillAlias, setPrefillAlias] = useState("");
  const { showToast } = useFormToast();

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetchWithTimeout("/api/admin/staff-aliases");
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(j.error ?? "Φόρτωση απέτυχε");
        setProfiles([]);
        setUnlinked([]);
        return;
      }
      const j = (await res.json()) as {
        profiles?: StaffProfileRow[];
        unlinked?: UnlinkedLegacyName[];
      };
      setProfiles(j.profiles ?? []);
      setUnlinked(j.unlinked ?? []);
    } catch {
      setErr("Σφάλμα δικτύου");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const removeAlias = async (alias: StaffAlias) => {
    if (!confirm(`Αφαίρεση alias «${alias.alias_name}»;`)) return;
    const res = await fetchWithTimeout(`/api/admin/staff-aliases/${encodeURIComponent(alias.id)}`, {
      method: "DELETE",
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      showToast(j.error ?? "Σφάλμα", "error");
      return;
    }
    showToast("Το alias αφαιρέθηκε.", "success");
    await load();
  };

  const openAdd = (profile: StaffProfileRow, aliasName = "") => {
    setAddForProfile(profile);
    setPrefillAlias(aliasName);
  };

  return (
    <section className={lux.card}>
      <h2 className={lux.pageTitle + " mb-1"}>Χειριστές</h2>
      <p className="mb-4 text-sm text-[var(--text-secondary)]">
        Σύνδεση παλαιών ονομάτων (εισαγωγή) με προφίλ CRM. Τα συνδεδεμένα ονόματα εμφανίζονται ως το
        τρέχον όνομα του χειριστή σε σημειώσεις, επαφές και αιτήματα.
      </p>

      {err && (
        <p className="mb-3 text-sm text-amber-200" role="status">
          {err}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">Φόρτωση…</p>
      ) : (
        <div className="space-y-6">
          <div className="w-full min-w-0 overflow-x-auto rounded-lg border border-[var(--border)]">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className={lux.tableHead + " border-b border-[var(--border)]"}>
                  <th className="p-3 pl-4 text-left">Προφίλ CRM</th>
                  <th className="p-3 text-left">Συνδεδεμένα παλαιά ονόματα</th>
                  <th className="w-40 p-3 pr-4 text-right">Ενέργειες</th>
                </tr>
              </thead>
              <tbody>
                {profiles.length === 0 && (
                  <tr>
                    <td colSpan={3} className="p-6 text-center text-[var(--text-muted)]">
                      Δεν βρέθηκαν προφίλ CRM.
                    </td>
                  </tr>
                )}
                {profiles.map((p) => (
                  <tr key={p.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-elevated)]/50">
                    <td className="p-3 pl-4 align-top font-medium text-[var(--text-primary)]">
                      {p.full_name?.trim() || "—"}
                    </td>
                    <td className="p-3 align-top">
                      {p.aliases.length === 0 ? (
                        <span className="text-xs text-[var(--text-muted)]">—</span>
                      ) : (
                        <ul className="space-y-1.5">
                          {p.aliases.map((a) => (
                            <li
                              key={a.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)]/40 px-2.5 py-1.5"
                            >
                              <span className="text-[var(--text-secondary)]">{a.alias_name}</span>
                              <button
                                type="button"
                                className={lux.btnDanger + " !px-2 !py-1 text-[10px]"}
                                onClick={() => void removeAlias(a)}
                              >
                                Αφαίρεση
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="p-3 pr-4 align-top text-right">
                      <button
                        type="button"
                        className={lux.btnSecondary + " !px-2 !py-1.5 text-xs"}
                        onClick={() => openAdd(p)}
                      >
                        Προσθήκη alias
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">
              Μη συνδεδεμένα παλαιά ονόματα
            </h3>
            <p className="mb-3 text-xs text-[var(--text-secondary)]">
              Κορυφαία ονόματα από σημειώσεις επαφών και αιτημάτων που δεν έχουν αντιστοιχιστεί ακόμη.
            </p>
            {unlinked.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">Όλα τα γνωστά ονόματα είναι συνδεδεμένα.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
                {unlinked.map((row) => (
                  <li
                    key={row.name}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"
                  >
                    <span className="font-medium text-[var(--text-primary)]">
                      {formatUnlinkedLegacyNameLabel(row)}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className={lux.btnSecondary + " !px-2 !py-1 text-xs"}
                        onClick={() => {
                          const target = profiles.find((p) => p.full_name?.trim());
                          if (!target) {
                            showToast("Δεν υπάρχει προφίλ CRM.", "error");
                            return;
                          }
                          openAdd(target, row.name);
                        }}
                      >
                        Σύνδεση…
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {addForProfile && (
        <AddAliasModal
          profile={addForProfile}
          unlinked={unlinked}
          initialAlias={prefillAlias}
          onClose={() => {
            setAddForProfile(null);
            setPrefillAlias("");
          }}
          onSaved={async () => {
            setAddForProfile(null);
            setPrefillAlias("");
            await load();
          }}
        />
      )}
    </section>
  );
}

function AddAliasModal({
  profile,
  unlinked,
  initialAlias,
  onClose,
  onSaved,
}: {
  profile: StaffProfileRow;
  unlinked: UnlinkedLegacyName[];
  initialAlias: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { showToast } = useFormToast();
  const [profileId, setProfileId] = useState(profile.id);
  const [crmProfiles, setCrmProfiles] = useState<{ id: string; full_name: string | null }[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [profilesErr, setProfilesErr] = useState<string | null>(null);
  const [aliasName, setAliasName] = useState(initialAlias);
  const [busy, setBusy] = useState(false);
  const [aliasErr, setAliasErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setProfilesLoading(true);
    setProfilesErr(null);
    void fetchWithTimeout("/api/admin/users")
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          setProfilesErr(j.error ?? "Φόρτωση προφίλ απέτυχε");
          setCrmProfiles([]);
          return;
        }
        const j = (await res.json()) as { users?: { id: string; full_name: string | null }[] };
        setCrmProfiles(j.users ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setProfilesErr("Σφάλμα δικτύου");
          setCrmProfiles([]);
        }
      })
      .finally(() => {
        if (!cancelled) setProfilesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const aliasOptions = useMemo(() => {
    const opts = unlinked.map((row) => ({
      value: row.name,
      label: formatUnlinkedLegacyNameLabel(row),
    }));
    if (initialAlias && !opts.some((o) => o.value === initialAlias)) {
      opts.unshift({ value: initialAlias, label: initialAlias });
    }
    return opts;
  }, [unlinked, initialAlias]);

  useEffect(() => {
    setProfileId(profile.id);
    setAliasName(initialAlias);
  }, [profile.id, initialAlias]);

  const save = async () => {
    setAliasErr(null);
    if (!aliasName.trim()) {
      setAliasErr("Επιλέξτε παλαιό όνομα από τη λίστα");
      return;
    }
    setBusy(true);
    try {
      const res = await fetchWithTimeout("/api/admin/staff-aliases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_id: profileId, alias_name: aliasName.trim() }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        showToast(j.error ?? "Σφάλμα", "error");
        return;
      }
      showToast("Το alias προστέθηκε.", "success");
      await onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <CenteredModal
      open
      onClose={onClose}
      title="Προσθήκη alias"
      ariaLabel="Προσθήκη alias χειριστή"
      className="!max-w-md"
      footer={
        <>
          <button type="button" onClick={onClose} className={lux.btnSecondary} disabled={busy}>
            Άκυρο
          </button>
          <button type="button" onClick={() => void save()} className={lux.btnPrimary} disabled={busy || aliasOptions.length === 0 || profilesLoading || crmProfiles.length === 0}>
            {busy ? "…" : "Αποθήκευση"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <HqLabel htmlFor="sa-profile">Προφίλ CRM</HqLabel>
          {profilesLoading ? (
            <p className="mt-1 text-sm text-[var(--text-muted)]">Φόρτωση προφίλ…</p>
          ) : profilesErr ? (
            <p className="mt-1 text-sm text-amber-200" role="status">
              {profilesErr}
            </p>
          ) : (
            <select
              id="sa-profile"
              className={lux.select + " mt-1"}
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
              disabled={crmProfiles.length === 0}
            >
              {crmProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name?.trim() || p.id}
                </option>
              ))}
            </select>
          )}
        </div>
        <div>
          <HqLabel htmlFor="sa-alias" required>
            Παλαιό όνομα (από εισαγωγή)
          </HqLabel>
          {aliasOptions.length === 0 ? (
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Δεν υπάρχουν μη συνδεδεμένα παλαιά ονόματα.
            </p>
          ) : (
            <SearchableSelect
              id="sa-alias"
              className="mt-1"
              options={aliasOptions}
              value={aliasName}
              onChange={(v) => {
                setAliasName(v);
                setAliasErr(null);
              }}
              placeholder="Επιλέξτε παλαιό όνομα…"
              searchPlaceholder="Αναζήτηση ονόματος…"
              emptyText="Δεν βρέθηκε όνομα"
              aria-label="Παλαιό όνομα από εισαγωγή"
            />
          )}
          <HqFieldError>{aliasErr}</HqFieldError>
        </div>
      </div>
    </CenteredModal>
  );
}
