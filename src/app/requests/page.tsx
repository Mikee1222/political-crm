"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { lux } from "@/lib/luxury-styles";

type RequestRow = {
  id: string;
  request_code: string | null;
  contact_id: string;
  title: string;
  description: string | null;
  category: string | null;
  status: string | null;
  assigned_to: string | null;
  created_at: string | null;
  contacts: { first_name: string; last_name: string } | null;
};

type ContactOption = { id: string; first_name: string; last_name: string };

export default function RequestsPage() {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [selected, setSelected] = useState<RequestRow | null>(null);
  const [create, setCreate] = useState({
    contact_id: "",
    title: "",
    description: "",
    category: "Άλλο",
    status: "Νέο",
    assigned_to: "",
  });

  const load = useCallback(async () => {
    const q = new URLSearchParams({ status, category });
    const res = await fetchWithTimeout(`/api/requests?${q.toString()}`);
    const data = await res.json();
    setRows(data.requests ?? []);
  }, [status, category]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetchWithTimeout("/api/contacts")
      .then((res) => res.json())
      .then((data) => setContacts(data.contacts ?? []));
  }, []);

  const categories = useMemo(() => {
    return Array.from(new Set(rows.map((r) => r.category).filter(Boolean))) as string[];
  }, [rows]);

  const createRequest = async () => {
    await fetchWithTimeout("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(create),
    });
    setCreate({ contact_id: "", title: "", description: "", category: "Άλλο", status: "Νέο", assigned_to: "" });
    await load();
  };

  return (
    <div className="space-y-6">
      <div className={lux.card}>
        <h2 className={lux.pageTitle + " mb-1"}>Αιτήματα</h2>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">Φιλτράρισμα & διαχείριση αιτημάτων πολιτών</p>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className={lux.label} htmlFor="r-st">
              Κατάσταση
            </label>
            <select
              id="r-st"
              className={lux.select}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Όλες οι καταστάσεις</option>
              <option value="Νέο">Νέο</option>
              <option value="Σε εξέλιξη">Σε εξέλιξη</option>
              <option value="Ολοκληρώθηκε">Ολοκληρώθηκε</option>
              <option value="Απορρίφθηκε">Απορρίφθηκε</option>
            </select>
          </div>
          <div>
            <label className={lux.label} htmlFor="r-cat">
              Κατηγορία
            </label>
            <select
              id="r-cat"
              className={lux.select}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Όλες οι κατηγορίες</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className={lux.card}>
        <h3 className={lux.sectionTitle + " mb-4"}>Νέο αίτημα</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className={lux.label}>Επαφή</label>
            <select
              className={lux.select}
              value={create.contact_id}
              onChange={(e) => setCreate({ ...create, contact_id: e.target.value })}
            >
              <option value="">Επιλέξτε επαφή *</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.first_name} {c.last_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={lux.label}>Τίτλος</label>
            <input
              className={lux.input}
              placeholder="Τίτλος *"
              value={create.title}
              onChange={(e) => setCreate({ ...create, title: e.target.value })}
            />
          </div>
          <div>
            <label className={lux.label}>Ανάθεση σε</label>
            <input
              className={lux.input}
              value={create.assigned_to}
              onChange={(e) => setCreate({ ...create, assigned_to: e.target.value })}
            />
          </div>
          <div>
            <label className={lux.label}>Κατηγορία</label>
            <select
              className={lux.select}
              value={create.category}
              onChange={(e) => setCreate({ ...create, category: e.target.value })}
            >
              <option>Υγεία</option>
              <option>Εκπαίδευση</option>
              <option>Εργασία</option>
              <option>Υποδομές</option>
              <option>Άλλο</option>
            </select>
          </div>
          <div>
            <label className={lux.label}>Κατάσταση</label>
            <select
              className={lux.select}
              value={create.status}
              onChange={(e) => setCreate({ ...create, status: e.target.value })}
            >
              <option>Νέο</option>
              <option>Σε εξέλιξη</option>
              <option>Ολοκληρώθηκε</option>
              <option>Απορρίφθηκε</option>
            </select>
          </div>
          <div className="flex items-end">
            <button type="button" onClick={createRequest} className={lux.btnGold + " w-full !py-2.5 sm:w-auto"}>
              Προσθήκη
            </button>
          </div>
          <div className="md:col-span-2">
            <label className={lux.label}>Περιγραφή</label>
            <textarea
              className={lux.textarea}
              placeholder="Λεπτομέρειες αιτήματος…"
              value={create.description}
              onChange={(e) => setCreate({ ...create, description: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[12px] border border-[var(--border)] bg-[var(--bg-card)] shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
        <table className="min-w-full text-sm">
          <thead>
            <tr className={lux.tableHead + " border-b border-[var(--border)]"}>
              <th className="p-3 pl-4 text-left">Κωδικός</th>
              <th className="p-3 text-left">Επαφή</th>
              <th className="p-3 text-left">Τίτλος</th>
              <th className="p-3 text-left">Κατηγορία</th>
              <th className="p-3 text-left">Κατάσταση</th>
              <th className="p-3 text-left">Ανάθεση</th>
              <th className="p-3 pr-4 text-left">Ημ/νία</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className="cursor-pointer border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-elevated)]"
                onClick={() => setSelected(r)}
              >
                <td className="p-3 pl-4 font-mono text-[13px] text-[var(--text-secondary)]">
                  {r.request_code ?? "—"}
                </td>
                <td className="p-3 text-[var(--text-primary)]">
                  {r.contacts ? `${r.contacts.first_name} ${r.contacts.last_name}` : "—"}
                </td>
                <td className="p-3 font-medium text-[var(--text-primary)]">{r.title}</td>
                <td className="p-3 text-[var(--text-secondary)]">{r.category ?? "—"}</td>
                <td className="p-3">
                  <StatusBadge status={r.status ?? "Νέο"} />
                </td>
                <td className="p-3 text-[var(--text-secondary)]">{r.assigned_to ?? "—"}</td>
                <td className="p-3 pr-4 text-[var(--text-secondary)]">
                  {r.created_at ? new Date(r.created_at).toLocaleDateString("el-GR") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && <EditRequestModal request={selected} onClose={() => setSelected(null)} onSaved={load} />}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    "Νέο": "bg-[var(--status-req-new-bg)] text-[var(--status-req-new-fg)] ring-1 ring-inset ring-[var(--status-req-new-ring)]",
    "Σε εξέλιξη": "bg-[var(--status-req-prog-bg)] text-[var(--status-req-prog-fg)] ring-1 ring-inset ring-[var(--status-req-prog-ring)]",
    "Ολοκληρώθηκε": "bg-[var(--status-req-done-bg)] text-[var(--status-req-done-fg)] ring-1 ring-inset ring-[var(--status-req-done-ring)]",
    "Απορρίφθηκε": "bg-[var(--status-req-rej-bg)] text-[var(--status-req-rej-fg)] ring-1 ring-inset ring-[var(--status-req-rej-ring)]",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        styles[status] ?? styles["Νέο"]
      }`}
    >
      {status}
    </span>
  );
}

function EditRequestModal({
  request,
  onClose,
  onSaved,
}: {
  request: RequestRow;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    title: request.title,
    description: request.description ?? "",
    category: request.category ?? "Άλλο",
    status: request.status ?? "Νέο",
    assigned_to: request.assigned_to ?? "",
  });

  const save = async () => {
    await fetchWithTimeout(`/api/requests/${request.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    await onSaved();
    onClose();
  };

  const remove = async () => {
    await fetchWithTimeout(`/api/requests/${request.id}`, { method: "DELETE" });
    await onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm [background:var(--overlay-scrim)]">
      <div className="w-full max-w-xl rounded-[12px] border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-2xl">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-lg border-2 border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 font-mono text-sm font-bold tracking-tight text-[var(--text-card-title)]">
            {request.request_code ?? "—"}
          </span>
        </div>
        <h3 className="text-lg font-bold text-[var(--text-primary)]">Επεξεργασία αιτήματος</h3>
        <p className="mt-1 line-clamp-2 text-sm text-[var(--text-secondary)]">{request.title}</p>
        <div className="mt-4 grid gap-3">
          <div>
            <label className={lux.label}>Τίτλος</label>
            <input
              className={lux.input}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div>
            <label className={lux.label}>Περιγραφή</label>
            <textarea className={lux.textarea} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <label className={lux.label}>Κατηγορία</label>
            <select className={lux.select} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option>Υγεία</option>
              <option>Εκπαίδευση</option>
              <option>Εργασία</option>
              <option>Υποδομές</option>
              <option>Άλλο</option>
            </select>
          </div>
          <div>
            <label className={lux.label}>Κατάσταση</label>
            <select className={lux.select} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option>Νέο</option>
              <option>Σε εξέλιξη</option>
              <option>Ολοκληρώθηκε</option>
              <option>Απορρίφθηκε</option>
            </select>
          </div>
          <div>
            <label className={lux.label}>Ανάθεση</label>
            <input
              className={lux.input}
              value={form.assigned_to}
              onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
            />
          </div>
        </div>
        <div className="mt-6 flex flex-col justify-between gap-3 border-t border-[var(--border)] pt-4 sm:flex-row sm:items-center">
          <button type="button" onClick={remove} className="text-sm font-medium text-[#DC2626] hover:underline">
            Διαγραφή
          </button>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onClose} className={lux.btnSecondary}>
              Ακύρωση
            </button>
            <button type="button" onClick={save} className={lux.btnPrimary}>
              Αποθήκευση
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
