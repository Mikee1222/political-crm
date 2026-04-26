"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { HeartHandshake, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useProfile } from "@/contexts/profile-context";
import { hasMinRole } from "@/lib/roles";
import { lux } from "@/lib/luxury-styles";
import { fetchWithTimeout } from "@/lib/client-fetch";

type V = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  volunteer_role: string | null;
  volunteer_area: string | null;
  volunteer_since: string | null;
  task_count: number;
};

function VolunteersBody() {
  const { profile } = useProfile();
  const can = hasMinRole(profile?.role, "manager");
  const router = useRouter();
  const [list, setList] = useState<V[]>([]);
  const [nd, setNd] = useState({ first_name: "", last_name: "", phone: "" });
  const [tOpen, setTOpen] = useState(false);
  const [sel, setSel] = useState<V | null>(null);
  const [t, setT] = useState({ title: "", due: "" });

  const load = useCallback(async () => {
    const r = await fetchWithTimeout("/api/volunteers");
    const j = (await r.json()) as { volunteers?: V[] };
    setList((j.volunteers as V[]) ?? []);
  }, []);

  useEffect(() => {
    if (can) void load();
  }, [can, load]);

  if (!can) {
    return <p className="p-4 text-sm">Δεν έχετε πρόσβαση.</p>;
  }

  return (
    <div className="w-full min-w-0 max-w-5xl space-y-4">
      <div className="flex items-center gap-2">
        <HeartHandshake className="h-7 w-7 text-[var(--accent-gold)]" />
        <h1 className={lux.pageTitle}>Εθελοντές</h1>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={lux.btnPrimary + " inline-flex items-center gap-1"}
          onClick={async () => {
            if (!nd.first_name.trim() || !nd.last_name.trim() || !nd.phone.trim()) return;
            const res = await fetchWithTimeout("/api/contacts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...nd,
                call_status: "Pending",
                is_volunteer: true,
                priority: "Medium",
              }),
            });
            const j = (await res.json().catch(() => ({}))) as { contact?: { id: string } };
            if (j.contact?.id) {
              setNd({ first_name: "", last_name: "", phone: "" });
              void load();
              router.push(`/contacts/${j.contact.id}`);
            }
          }}
        >
          <Plus className="h-4 w-4" />
          Νέος εθελοντής
        </button>
        <div className="flex flex-1 flex-wrap items-end gap-2 min-w-0 max-w-md">
          <input
            className={lux.input}
            placeholder="Όνομα"
            value={nd.first_name}
            onChange={(e) => setNd((x) => ({ ...x, first_name: e.target.value }))}
          />
          <input
            className={lux.input}
            placeholder="Επίθετο"
            value={nd.last_name}
            onChange={(e) => setNd((x) => ({ ...x, last_name: e.target.value }))}
          />
          <input
            className={lux.input}
            placeholder="Τηλέφωνο"
            value={nd.phone}
            onChange={(e) => setNd((x) => ({ ...x, phone: e.target.value }))}
          />
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full min-w-[800px] text-sm">
          <thead>
            <tr className={lux.tableHead}>
              <th className="p-2 text-left">Όνομα</th>
              <th className="p-2">Τηλέφωνο</th>
              <th className="p-2">Ρόλος</th>
              <th className="p-2">Περιοχή</th>
              <th className="p-2">Από</th>
              <th className="p-2">Tasks</th>
              <th className="p-2 text-left">Ενέργειες</th>
            </tr>
          </thead>
          <tbody>
            {list.map((v) => (
              <tr key={v.id} className="border-t border-[var(--border)]">
                <td className="p-2">
                  <Link className="font-medium text-[#003476] hover:underline" href={`/contacts/${v.id}`}>
                    {v.first_name} {v.last_name}
                  </Link>
                </td>
                <td className="p-2 font-mono text-xs">{v.phone}</td>
                <td className="p-2">{v.volunteer_role ?? "—"}</td>
                <td className="p-2">{v.volunteer_area ?? "—"}</td>
                <td className="p-2">{v.volunteer_since ?? "—"}</td>
                <td className="p-2">{v.task_count}</td>
                <td className="p-2">
                  <button type="button" className="text-xs text-[var(--accent-gold)]" onClick={() => { setSel(v); setTOpen(true); }}>
                    Task
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {tOpen && sel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <p className="text-sm font-medium">
              {sel.first_name} {sel.last_name}
            </p>
            <input
              className={lux.input + " mt-2"}
              placeholder="Τίτλος εργασίας"
              value={t.title}
              onChange={(e) => setT((x) => ({ ...x, title: e.target.value }))}
            />
            <input
              className={lux.input + " mt-1"}
              type="date"
              value={t.due}
              onChange={(e) => setT((x) => ({ ...x, due: e.target.value }))}
            />
            <div className="mt-2 flex justify-end gap-2">
              <button type="button" className={lux.btnSecondary} onClick={() => setTOpen(false)}>
                Άκυρο
              </button>
              <button
                type="button"
                className={lux.btnPrimary}
                onClick={async () => {
                  if (!t.title.trim()) return;
                  await fetchWithTimeout("/api/tasks", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ contact_id: sel.id, title: t.title.trim(), due_date: t.due || null }),
                  });
                  setTOpen(false);
                  setT({ title: "", due: "" });
                  void load();
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function VolunteersPage() {
  return (
    <Suspense fallback={<p>Φόρτωση…</p>}>
      <VolunteersBody />
    </Suspense>
  );
}
