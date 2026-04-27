"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Search, Trash2 } from "lucide-react";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { lux } from "@/lib/luxury-styles";
import type { MunicipalityRow } from "@/app/api/geo/municipalities/route";
import type { ElectoralDistrictAdminRow } from "@/app/api/admin/electoral-districts/route";
import type { ToponymAdminRow } from "@/app/api/admin/toponyms/route";
import { CenteredModal } from "@/components/ui/centered-modal";
import { HqSelect } from "@/components/ui/hq-select";
import { useFormToast } from "@/contexts/form-toast-context";

type Tab = "municipalities" | "districts" | "toponyms";

const tabs: { id: Tab; label: string }[] = [
  { id: "municipalities", label: "Δήμοι" },
  { id: "districts", label: "Εκλογικά διαμερίσματα" },
  { id: "toponyms", label: "Τοπωνύμια" },
];

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function GeographicDataSection() {
  const [tab, setTab] = useState<Tab>("municipalities");
  const [q, setQ] = useState("");
  const [munis, setMunis] = useState<MunicipalityRow[]>([]);
  const [dists, setDists] = useState<ElectoralDistrictAdminRow[]>([]);
  const [tops, setTops] = useState<ToponymAdminRow[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [editM, setEditM] = useState<MunicipalityRow | null | "add">(null);
  const [editD, setEditD] = useState<ElectoralDistrictAdminRow | null | "add">(null);
  const [editT, setEditT] = useState<ToponymAdminRow | null | "add">(null);

  const load = useCallback(async () => {
    setLoadErr(null);
    setLoading(true);
    try {
      const [rm, rd, rt] = await Promise.all([
        fetchWithTimeout("/api/admin/municipalities"),
        fetchWithTimeout("/api/admin/electoral-districts"),
        fetchWithTimeout("/api/admin/toponyms"),
      ]);
      if (rm.ok) {
        const d = (await rm.json()) as { municipalities?: MunicipalityRow[] };
        setMunis(d.municipalities ?? []);
      } else {
        setMunis([]);
        const j = (await rm.json().catch(() => ({}))) as { error?: string };
        setLoadErr(j.error ?? "Φόρτωση δήμων");
      }
      if (rd.ok) {
        const d = (await rd.json()) as { districts?: ElectoralDistrictAdminRow[] };
        setDists(d.districts ?? []);
      } else {
        setDists([]);
      }
      if (rt.ok) {
        const d = (await rt.json()) as { toponyms?: ToponymAdminRow[] };
        setTops(d.toponyms ?? []);
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
    return munis.filter((m) => norm(m.name).includes(t) || (m.regional_unit && norm(m.regional_unit).includes(t)));
  }, [munis, q]);

  const filteredDists = useMemo(() => {
    const t = norm(q.trim());
    if (!t) return dists;
    return dists.filter(
      (d) => norm(d.name).includes(t) || (d.municipality_name && norm(d.municipality_name).includes(t)),
    );
  }, [dists, q]);

  const filteredTops = useMemo(() => {
    const t = norm(q.trim());
    if (!t) return tops;
    return tops.filter(
      (r) =>
        norm(r.name).includes(t) ||
        (r.municipality_name && norm(r.municipality_name).includes(t)) ||
        (r.electoral_district_name && norm(r.electoral_district_name).includes(t)),
    );
  }, [tops, q]);

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
        <div className="w-full min-w-0 overflow-x-auto rounded-lg border border-[var(--border)]">
          {tab === "municipalities" && (
            <MuniTable rows={filteredMunis} onEdit={(r) => setEditM(r)} onDelete={load} />
          )}
          {tab === "districts" && <DistTable rows={filteredDists} munis={munis} onEdit={(r) => setEditD(r)} onDelete={load} />}
          {tab === "toponyms" && <TopTable rows={filteredTops} munis={munis} dists={dists} onEdit={(r) => setEditT(r)} onDelete={load} />}
        </div>
      )}

      {editM && <MuniModal open={true} v={editM} onClose={() => setEditM(null)} onSave={() => void load()} />}
      {editD && <DistModal open={true} v={editD} munis={munis} onClose={() => setEditD(null)} onSave={() => void load()} />}
      {editT && <TopModal open={true} v={editT} munis={munis} dists={dists} onClose={() => setEditT(null)} onSave={() => void load()} />}
    </section>
  );
}

function MuniTable({
  rows,
  onEdit,
  onDelete,
}: {
  rows: MunicipalityRow[];
  onEdit: (r: MunicipalityRow) => void;
  onDelete: () => void;
}) {
  return (
    <table className="w-full min-w-[520px] text-sm">
      <thead>
        <tr className={lux.tableHead + " border-b border-[var(--border)]"}>
          <th className="p-2 pl-3 text-left">Όνομα</th>
          <th className="p-2 text-left">Περιφερ. ενότητα</th>
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
            <td className="p-2 text-[var(--text-secondary)]">{r.regional_unit ?? "—"}</td>
            <td className="p-2 pr-3 text-right">
              <RowActions
                onEdit={() => onEdit(r)}
                onDelete={async () => {
                  if (!confirm("Διαγραφή δήμου; Θα διαγραφούν και τα σχετικά διαμερίσματα/τοπωνύμια.")) return;
                  const res = await fetchWithTimeout(`/api/admin/municipalities/${r.id}`, { method: "DELETE" });
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

function DistTable({
  rows,
  munis,
  onEdit,
  onDelete,
}: {
  rows: ElectoralDistrictAdminRow[];
  munis: MunicipalityRow[];
  onEdit: (r: ElectoralDistrictAdminRow) => void;
  onDelete: () => void;
}) {
  return (
    <table className="w-full min-w-[560px] text-sm">
      <thead>
        <tr className={lux.tableHead + " border-b border-[var(--border)]"}>
          <th className="p-2 pl-3 text-left">Δήμος</th>
          <th className="p-2 text-left">Όνομα</th>
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
            <td className="p-2 pl-3 text-[var(--text-secondary)]">
              {r.municipality_name ?? munis.find((m) => m.id === r.municipality_id)?.name ?? "—"}
            </td>
            <td className="p-2 font-medium text-[var(--text-primary)]">{r.name}</td>
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
  munis,
  dists,
  onEdit,
  onDelete,
}: {
  rows: ToponymAdminRow[];
  munis: MunicipalityRow[];
  dists: ElectoralDistrictAdminRow[];
  onEdit: (r: ToponymAdminRow) => void;
  onDelete: () => void;
}) {
  return (
    <table className="w-full min-w-[640px] text-sm">
      <thead>
        <tr className={lux.tableHead + " border-b border-[var(--border)]"}>
          <th className="p-2 pl-3 text-left">Όνομα</th>
          <th className="p-2 text-left">Δήμος</th>
          <th className="p-2 text-left">Διαμέρισμα</th>
          <th className="w-28 p-2 pr-3 text-right">Ενέργειες</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td colSpan={4} className="p-4 text-center text-[var(--text-muted)]">
              Δεν βρέθηκαν.
            </td>
          </tr>
        )}
        {rows.map((r) => (
          <tr key={r.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-elevated)]/50">
            <td className="p-2 pl-3 font-medium text-[var(--text-primary)]">{r.name}</td>
            <td className="p-2 text-[var(--text-secondary)]">
              {r.municipality_name ?? munis.find((m) => m.id === r.municipality_id)?.name ?? "—"}
            </td>
            <td className="p-2 text-[var(--text-secondary)]">
              {r.electoral_district_name ?? dists.find((d) => d.id === r.electoral_district_id)?.name ?? "—"}
            </td>
            <td className="p-2 pr-3 text-right">
              <RowActions
                onEdit={() => onEdit(r)}
                onDelete={async () => {
                  if (!confirm("Διαγραφή τοπωνυμίου;")) return;
                  const res = await fetchWithTimeout(`/api/admin/toponyms/${r.id}`, { method: "DELETE" });
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

function MuniModal({ open, v, onClose, onSave }: { open: boolean; v: MunicipalityRow | "add" | null; onClose: () => void; onSave: () => void }) {
  const { showToast } = useFormToast();
  const [name, setName] = useState("");
  const [reg, setReg] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const isAdd = v === "add";
  const row = v !== "add" && v != null ? v : null;
  useEffect(() => {
    if (!open) return;
    if (isAdd) {
      setName("");
      setReg("");
    } else if (row) {
      setName(row.name);
      setReg(row.regional_unit ?? "");
    }
    setErr(null);
  }, [open, isAdd, row]);

  if (!open || v == null) return null;
  return (
    <CenteredModal
      open={open}
      onClose={onClose}
      className="!max-w-md !p-5"
      ariaLabel={isAdd ? "Νέος δήμος" : "Επεξεργασία δήμου"}
      overlayClassName="z-[10000]"
    >
      <h3 className="mb-3 text-lg font-semibold text-[var(--text-primary)]">{isAdd ? "Νέος δήμος" : "Επεξεργασία δήμου"}</h3>
      {err && <p className="mb-2 text-sm text-red-300">{err}</p>}
      <label className={lux.label}>Όνομα *</label>
      <input className={lux.input + " mb-3"} value={name} onChange={(e) => setName(e.target.value)} />
      <label className={lux.label}>Περιφερ. ενότητα</label>
      <input className={lux.input + " mb-4"} value={reg} onChange={(e) => setReg(e.target.value)} />
      <div className="flex justify-end gap-2">
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
            const ru = reg.trim() || null;
            const bodyOut = { name: n, regional_unit: ru };
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
      </div>
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
  v: ElectoralDistrictAdminRow | "add" | null;
  munis: MunicipalityRow[];
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
      className="!max-w-md !p-5"
      ariaLabel={isAdd ? "Νέο εκλογικό διαμέρισμα" : "Επεξεργασία εκλογικού διαμερίσματος"}
      overlayClassName="z-[10000]"
    >
      <h3 className="mb-3 text-lg font-semibold text-[var(--text-primary)]">{isAdd ? "Νέο εκλ. διαμέρισμα" : "Επεξεργασία"}</h3>
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
      <input className={lux.input + " mb-4"} value={name} onChange={(e) => setName(e.target.value)} />
      <div className="flex justify-end gap-2">
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
      </div>
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
  v: ToponymAdminRow | "add" | null;
  munis: MunicipalityRow[];
  dists: ElectoralDistrictAdminRow[];
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
      setMuni(row.municipality_id);
      setDist(row.electoral_district_id ?? "");
    }
    setErr(null);
  }, [open, isAdd, row, munis]);

  if (!open || v == null) return null;
  return (
    <CenteredModal
      open={open}
      onClose={onClose}
      className="!max-w-md !p-5"
      ariaLabel={isAdd ? "Νέο τοπωνύμιο" : "Επεξεργασία τοπωνυμίου"}
      overlayClassName="z-[10000]"
    >
      <h3 className="mb-3 text-lg font-semibold text-[var(--text-primary)]">{isAdd ? "Νέο τοπωνύμιο" : "Επεξεργασία"}</h3>
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
      <input className={lux.input + " mb-4"} value={name} onChange={(e) => setName(e.target.value)} />
      <div className="flex justify-end gap-2">
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
      </div>
    </CenteredModal>
  );
}
