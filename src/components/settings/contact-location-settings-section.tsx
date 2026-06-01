"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { lux } from "@/lib/luxury-styles";
import { CenteredModal } from "@/components/ui/centered-modal";
import { HqSelect } from "@/components/ui/hq-select";
import { HqLabel } from "@/components/ui/hq-form-primitives";
import { useFormToast } from "@/contexts/form-toast-context";
import type { MunicipalityWithCount, ToponymWithCount } from "@/lib/contact-location-admin";

type Tab = "municipalities" | "toponyms";

const tabs: { id: Tab; label: string }[] = [
  { id: "municipalities", label: "Δήμοι" },
  { id: "toponyms", label: "Τοπωνύμια" },
];

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function ContactLocationSettingsSection() {
  const [tab, setTab] = useState<Tab>("municipalities");
  const [q, setQ] = useState("");
  const [munis, setMunis] = useState<MunicipalityWithCount[]>([]);
  const [tops, setTops] = useState<ToponymWithCount[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [transferMuni, setTransferMuni] = useState<MunicipalityWithCount | null>(null);
  const [transferTop, setTransferTop] = useState<ToponymWithCount | null>(null);
  const { showToast } = useFormToast();

  const load = useCallback(async () => {
    setLoadErr(null);
    setLoading(true);
    try {
      const [rm, rt] = await Promise.all([
        fetchWithTimeout("/api/admin/municipalities/with-counts"),
        fetchWithTimeout("/api/admin/toponyms/with-counts"),
      ]);
      if (rm.ok) {
        const data = (await rm.json()) as { municipalities?: MunicipalityWithCount[] };
        setMunis(data.municipalities || []);
      } else {
        setMunis([]);
        const j = (await rm.json().catch(() => ({}))) as { error?: string };
        setLoadErr(j.error ?? "Φόρτωση δήμων");
      }
      if (rt.ok) {
        const data = (await rt.json()) as ToponymWithCount[] | { toponyms?: ToponymWithCount[] };
        setTops(
          (!Array.isArray(data) && data.toponyms) ||
            (Array.isArray(data) ? data : []) ||
            [],
        );
      } else {
        setTops([]);
      }
    } catch {
      setLoadErr("Σφάλμα δικτύου");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredMunis = useMemo(() => {
    const t = norm(q.trim());
    if (!t) return munis;
    return munis.filter((m) => norm(m.name).includes(t));
  }, [munis, q]);

  const filteredTops = useMemo(() => {
    const t = norm(q.trim());
    if (!t) return tops;
    return tops.filter((r) => norm(r.name).includes(t));
  }, [tops, q]);

  const addMunicipality = async () => {
    const name = newName.trim();
    if (!name) {
      showToast("Υποχρεωτικό όνομα.", "error");
      return;
    }
    setAddBusy(true);
    try {
      const res = await fetchWithTimeout("/api/admin/municipalities/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        showToast(j.error ?? "Σφάλμα", "error");
        return;
      }
      setNewName("");
      showToast("Ο δήμος προστέθηκε.", "success");
      await load();
    } finally {
      setAddBusy(false);
    }
  };

  const addToponym = async () => {
    const name = newName.trim();
    if (!name) {
      showToast("Υποχρεωτικό όνομα.", "error");
      return;
    }
    setAddBusy(true);
    try {
      const res = await fetchWithTimeout("/api/admin/toponyms/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        showToast(j.error ?? "Σφάλμα", "error");
        return;
      }
      setNewName("");
      showToast("Το τοπωνύμιο προστέθηκε.", "success");
      await load();
    } finally {
      setAddBusy(false);
    }
  };

  const deleteMunicipality = async (row: MunicipalityWithCount) => {
    if (row.contact_count > 0) return;
    if (!confirm(`Διαγραφή δήμου «${row.name}»;`)) return;
    const res = await fetchWithTimeout(`/api/admin/municipalities/by-name/${encodeURIComponent(row.name)}`, {
      method: "DELETE",
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      showToast(j.error ?? "Σφάλμα", "error");
      return;
    }
    showToast("Ο δήμος αφαιρέθηκε από το μητρώο.", "success");
    await load();
  };

  const deleteToponym = async (row: ToponymWithCount) => {
    if (row.contact_count > 0) return;
    if (!confirm(`Διαγραφή τοπωνυμίου «${row.name}»;`)) return;
    const res = await fetchWithTimeout(`/api/admin/toponyms/${row.id}`, { method: "DELETE" });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      showToast(j.error ?? "Σφάλμα", "error");
      return;
    }
    showToast("Το τοπωνύμιο διαγράφηκε.", "success");
    await load();
  };

  return (
    <section className={lux.card}>
      <h2 className={lux.pageTitle + " mb-1"}>Δήμοι &amp; τοπωνύμια επαφών</h2>
      <p className="mb-4 text-sm text-[var(--text-secondary)]">
        Διαχείριση τιμών πεδίων επαφών — μεταφορά επαφών, προσθήκη και διαγραφή (μόνο χωρίς συνδεδεμένες επαφές).
      </p>

      <div className="mb-4 flex flex-wrap gap-1 border-b border-[var(--border)] pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              setQ("");
              setNewName("");
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
        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-md">
          <HqLabel htmlFor="loc-new-name">Νέο {tab === "municipalities" ? "όνομα δήμου" : "τοπωνύμιο"}</HqLabel>
          <div className="flex gap-2">
            <input
              id="loc-new-name"
              className={lux.input + " !h-10 min-w-0 flex-1"}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void (tab === "municipalities" ? addMunicipality() : addToponym());
                }
              }}
            />
            <button
              type="button"
              disabled={addBusy}
              onClick={() => void (tab === "municipalities" ? addMunicipality() : addToponym())}
              className={lux.btnPrimary + " shrink-0 !py-2.5"}
            >
              {addBusy ? "…" : "Αποθήκευση"}
            </button>
          </div>
        </div>
      </div>

      {loadErr && <p className="mb-2 text-sm text-amber-200">{loadErr}</p>}

      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">Φόρτωση…</p>
      ) : (
        <div className="w-full min-w-0 overflow-x-auto rounded-lg border border-[var(--border)]">
          {tab === "municipalities" ? (
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className={lux.tableHead + " border-b border-[var(--border)]"}>
                  <th className="p-2 pl-3 text-left">Όνομα</th>
                  <th className="p-2 text-right">Επαφές</th>
                  <th className="w-56 p-2 pr-3 text-right">Ενέργειες</th>
                </tr>
              </thead>
              <tbody>
                {filteredMunis.length === 0 && (
                  <tr>
                    <td colSpan={3} className="p-4 text-center text-[var(--text-muted)]">
                      Δεν βρέθηκαν.
                    </td>
                  </tr>
                )}
                {filteredMunis.map((r) => (
                  <tr key={r.name} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-elevated)]/50">
                    <td className="p-2 pl-3 font-medium text-[var(--text-primary)]">{r.name}</td>
                    <td className="p-2 text-right tabular-nums text-[var(--text-secondary)]">{r.contact_count}</td>
                    <td className="p-2 pr-3 text-right">
                      <div className="inline-flex flex-wrap justify-end gap-1">
                        <button
                          type="button"
                          className={lux.btnSecondary + " !px-2 !py-1.5 text-xs"}
                          disabled={r.contact_count === 0}
                          onClick={() => setTransferMuni(r)}
                        >
                          Μεταφορά επαφών
                        </button>
                        <button
                          type="button"
                          className={lux.btnDanger + " !px-2 !py-1.5 text-xs"}
                          disabled={r.contact_count > 0}
                          title={r.contact_count > 0 ? "Υπάρχουν επαφές με αυτόν τον δήμο" : undefined}
                          onClick={() => void deleteMunicipality(r)}
                        >
                          Διαγραφή
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className={lux.tableHead + " border-b border-[var(--border)]"}>
                  <th className="p-2 pl-3 text-left">Όνομα</th>
                  <th className="p-2 text-right">Επαφές</th>
                  <th className="w-56 p-2 pr-3 text-right">Ενέργειες</th>
                </tr>
              </thead>
              <tbody>
                {filteredTops.length === 0 && (
                  <tr>
                    <td colSpan={3} className="p-4 text-center text-[var(--text-muted)]">
                      Δεν βρέθηκαν.
                    </td>
                  </tr>
                )}
                {filteredTops.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-elevated)]/50">
                    <td className="p-2 pl-3 font-medium text-[var(--text-primary)]">{r.name}</td>
                    <td className="p-2 text-right tabular-nums text-[var(--text-secondary)]">{r.contact_count}</td>
                    <td className="p-2 pr-3 text-right">
                      <div className="inline-flex flex-wrap justify-end gap-1">
                        <button
                          type="button"
                          className={lux.btnSecondary + " !px-2 !py-1.5 text-xs"}
                          disabled={r.contact_count === 0}
                          onClick={() => setTransferTop(r)}
                        >
                          Μεταφορά επαφών
                        </button>
                        <button
                          type="button"
                          className={lux.btnDanger + " !px-2 !py-1.5 text-xs"}
                          disabled={r.contact_count > 0}
                          title={r.contact_count > 0 ? "Υπάρχουν επαφές με αυτό το τοπωνύμιο" : undefined}
                          onClick={() => void deleteToponym(r)}
                        >
                          Διαγραφή
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

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

function MunicipalityTransferModal({
  from,
  municipalities,
  onClose,
  onTransferred,
}: {
  from: MunicipalityWithCount;
  municipalities: MunicipalityWithCount[];
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
      const res = await fetchWithTimeout("/api/admin/municipalities/transfer", {
        method: "PATCH",
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
          Από: <strong className="text-[var(--text-primary)]">{from.name}</strong>
        </p>
        <div>
          <HqLabel htmlFor="muni-to">Προς</HqLabel>
          <HqSelect id="muni-to" className={lux.select + " mt-1"} value={to} onChange={(e) => setTo(e.target.value)}>
            {options.length === 0 && <option value="">— (δεν υπάρχει άλλος δήμος) —</option>}
            {options.map((m) => (
              <option key={m.name} value={m.name}>
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
  from: ToponymWithCount;
  toponyms: ToponymWithCount[];
  onClose: () => void;
  onTransferred: () => Promise<void>;
}) {
  const { showToast } = useFormToast();
  const [toId, setToId] = useState("");
  const [busy, setBusy] = useState(false);
  const options = useMemo(
    () => toponyms.filter((t) => t.id !== from.id).sort((a, b) => a.name.localeCompare(b.name, "el")),
    [toponyms, from.id],
  );

  useEffect(() => {
    setToId(options[0]?.id ?? "");
  }, [from.id, options]);

  const submit = async () => {
    if (!toId) {
      showToast("Επιλέξτε προορισμό.", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await fetchWithTimeout("/api/admin/toponyms/transfer", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from_id: from.id, to_id: toId }),
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

  const toLabel = options.find((t) => t.id === toId)?.name ?? "";

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
          <button type="button" onClick={() => void submit()} className={lux.btnPrimary} disabled={busy || !toId}>
            {busy ? "…" : `Μεταφορά ${from.contact_count} επαφών`}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-[var(--text-secondary)]">
          Από: <strong className="text-[var(--text-primary)]">{from.name}</strong>
        </p>
        <div>
          <HqLabel htmlFor="top-to">Προς</HqLabel>
          <HqSelect id="top-to" className={lux.select + " mt-1"} value={toId} onChange={(e) => setToId(e.target.value)}>
            {options.length === 0 && <option value="">— (δεν υπάρχει άλλο τοπωνύμιο) —</option>}
            {options.map((t) => (
              <option key={t.id} value={t.id}>
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
