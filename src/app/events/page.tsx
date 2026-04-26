"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import { useProfile } from "@/contexts/profile-context";
import { hasMinRole } from "@/lib/roles";
import { lux } from "@/lib/luxury-styles";
import { fetchWithTimeout } from "@/lib/client-fetch";

type Ev = {
  id: string;
  title: string;
  date: string;
  location: string | null;
  type: string;
  status: string;
  attendee_count?: number;
};

function EventsBody() {
  const { profile } = useProfile();
  const can = hasMinRole(profile?.role, "manager");
  const [list, setList] = useState<Ev[]>([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", date: "", location: "", type: "Εκδήλωση" });

  const load = useCallback(async () => {
    const r = await fetchWithTimeout("/api/events");
    const j = (await r.json()) as { events?: Ev[] };
    setList(j.events ?? []);
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
        <CalendarCheck className="h-7 w-7 text-[var(--accent-gold)]" />
        <h1 className={lux.pageTitle}>Εκδηλώσεις</h1>
      </div>
      <button type="button" className={lux.btnPrimary} onClick={() => setOpen(true)}>
        Νέα εκδήλωση
      </button>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((e) => (
          <Link
            key={e.id}
            href={`/events/${e.id}`}
            className="block rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 transition hover:border-[var(--accent-gold)]/40"
          >
            <p className="text-xs text-[var(--text-muted)]">{e.date}</p>
            <p className="mt-1 font-semibold text-[var(--text-primary)]">{e.title}</p>
            <p className="text-sm text-[var(--text-secondary)]">{e.location || "—"}</p>
            <span className="mt-2 inline-block rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px]">
              {e.type}
            </span>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Συμμετέχοντες: {e.attendee_count ?? 0}</p>
          </Link>
        ))}
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <h3 className="font-semibold">Νέα εκδήλωση</h3>
            <div className="mt-2 space-y-2">
              <input className={lux.input} placeholder="Τίτλος" value={f.title} onChange={(e) => setF((x) => ({ ...x, title: e.target.value }))} />
              <input className={lux.input} type="date" value={f.date} onChange={(e) => setF((x) => ({ ...x, date: e.target.value }))} />
              <input className={lux.input} placeholder="Τοποθεσία" value={f.location} onChange={(e) => setF((x) => ({ ...x, location: e.target.value }))} />
              <select className={lux.select} value={f.type} onChange={(e) => setF((x) => ({ ...x, type: e.target.value }))}>
                {["Εκδήλωση", "Συνάντηση", "Προεκλογικό", "Άλλο"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className={lux.btnSecondary} onClick={() => setOpen(false)}>
                Άκυρο
              </button>
              <button
                type="button"
                className={lux.btnPrimary}
                onClick={async () => {
                  await fetchWithTimeout("/api/events", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(f),
                  });
                  setOpen(false);
                  setF({ title: "", date: "", location: "", type: "Εκδήλωση" });
                  void load();
                }}
              >
                Αποθήκευση
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EventsPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm">Φόρτωση…</p>}>
      <EventsBody />
    </Suspense>
  );
}
