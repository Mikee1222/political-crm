"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useProfile } from "@/contexts/profile-context";
import { hasMinRole } from "@/lib/roles";
import { lux } from "@/lib/luxury-styles";
import { fetchWithTimeout } from "@/lib/client-fetch";

type Rsvp = {
  id: string;
  contact_id: string;
  status: string;
  contact: { first_name: string; last_name: string; phone: string | null } | null;
};
type Evt = Record<string, unknown> & {
  id: string;
  title: string;
  date: string;
  location: string | null;
  type: string;
  description: string | null;
};

const rsvpBadge = (s: string) => {
  if (s === "Επιβεβαιωμένος") return "bg-emerald-500/15 text-emerald-200 border-emerald-500/30";
  if (s === "Αρνήθηκε") return "bg-red-500/15 text-red-200 border-red-500/30";
  if (s === "Σε αναμονή") return "bg-amber-500/15 text-amber-200 border-amber-500/30";
  return "bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border)]";
};

function EventDetail() {
  const { id: raw } = useParams();
  const id = typeof raw === "string" ? raw : "";
  const { profile } = useProfile();
  const can = hasMinRole(profile?.role, "manager");
  const [ev, setEv] = useState<Evt | null>(null);
  const [rsvps, setRsvps] = useState<Rsvp[]>([]);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<
    Array<{ id: string; first_name: string; last_name: string; phone: string }>
  >([]);
  const [taskContactId, setTaskContactId] = useState("");
  const [newT, setNewT] = useState({ title: "", due: "" });

  const load = useCallback(async () => {
    if (!id) return;
    const r = await fetchWithTimeout(`/api/events/${id}`);
    const j = (await r.json()) as { event?: Evt };
    setEv(j.event ?? null);
    const r2 = await fetchWithTimeout(`/api/events/${id}/rsvps`);
    const j2 = (await r2.json()) as { rsvps?: Rsvp[] };
    const list = (j2.rsvps as Rsvp[]) ?? [];
    setRsvps(list);
    if (list.length) {
      setTaskContactId((prev) => {
        if (list.some((x) => x.contact_id === prev)) return prev;
        return list[0]!.contact_id;
      });
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const searchC = async () => {
    const r = await fetchWithTimeout(`/api/contacts?search=${encodeURIComponent(q)}&limit=15`);
    const j = (await r.json()) as {
      contacts: Array<{ id: string; first_name: string; last_name: string; phone: string }>;
    };
    setHits((j.contacts ?? []).slice(0, 15));
  };

  if (!can) {
    return <p className="p-4 text-sm">Δεν έχετε πρόσβαση.</p>;
  }
  if (!ev) {
    return <p className="p-4">Φόρτωση…</p>;
  }

  const st = { Επιβεβαιωμένος: 0, Αρνήθηκε: 0, "Σε αναμονή": 0 };
  for (const r of rsvps) {
    if (r.status in st) {
      st[r.status as keyof typeof st] += 1;
    }
  }

  return (
    <div className="w-full min-w-0 max-w-3xl space-y-4">
      <Link href="/events" className="text-sm text-[#003476] hover:underline dark:text-[var(--accent-blue-bright)]">
        ← Όλες οι εκδηλώσεις
      </Link>
      <h1 className={lux.pageTitle}>{String(ev.title)}</h1>
      <p className="text-sm text-[var(--text-secondary)]">
        {String(ev.date)} {ev.location ? `· ${String(ev.location)}` : ""} · {String(ev.type)}
      </p>
      {ev.description ? <p className="text-sm">{String(ev.description)}</p> : null}
      <p className="text-xs text-[var(--text-muted)]">
        Επιβεβαιωμένοι: {st.Επιβεβαιωμένος} · Αρνήθηκε: {st.Αρνήθηκε} · Αναμονή: {st["Σε αναμονή"]}
      </p>
      <a
        className={lux.btnSecondary + " inline-block no-underline"}
        href={`/api/events/${id}/export`}
        target="_blank"
        rel="noreferrer"
      >
        Εξαγωγή CSV
      </a>
      <div>
        <h2 className="text-sm font-semibold">Προσθήκη επαφής</h2>
        <div className="mt-1 flex flex-wrap gap-2">
          <input
            className={lux.input + " max-w-xs"}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Αναζήτηση"
          />
          <button type="button" className={lux.btnSecondary} onClick={() => void searchC()}>
            Αναζήτηση
          </button>
        </div>
        <ul className="mt-2 text-sm">
          {hits.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between border-b border-[var(--border)] py-1"
            >
              {c.first_name} {c.last_name}
              <button
                type="button"
                className="text-xs text-[var(--accent-gold)]"
                onClick={async () => {
                  await fetchWithTimeout(`/api/events/${id}/rsvps`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ contact_id: c.id }),
                  });
                  void load();
                }}
              >
                RSVP
              </button>
            </li>
          ))}
        </ul>
      </div>
      <h2 className="text-sm font-semibold">Συμμετέχοντες</h2>
      <ul className="space-y-2 text-sm">
        {rsvps.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {r.contact ? (
                <Link
                  className="font-medium text-[#003476] hover:underline dark:text-[var(--accent-blue-bright)]"
                  href={`/contacts/${r.contact_id}`}
                >
                  {r.contact.first_name} {r.contact.last_name}
                </Link>
              ) : (
                r.contact_id
              )}{" "}
              {r.contact?.phone ? (
                <span className="font-mono text-xs text-[var(--text-muted)]">({r.contact.phone})</span>
              ) : null}
            </span>
            <span className={"rounded-full border px-2 py-0.5 text-[10px] " + rsvpBadge(r.status)}>
              {r.status}
            </span>
          </li>
        ))}
      </ul>
      <div>
        <h2 className="text-sm font-semibold">Ανάθεση εργασίας σε εθελοντή</h2>
        <div className="mt-2 max-w-md space-y-2">
          <select
            className={lux.select}
            value={taskContactId}
            onChange={(e) => setTaskContactId(e.target.value)}
            disabled={!rsvps.length}
          >
            {rsvps.map((r) => (
              <option key={r.id} value={r.contact_id}>
                {r.contact
                  ? `${r.contact.first_name} ${r.contact.last_name}`
                  : r.contact_id}
              </option>
            ))}
          </select>
          <input
            className={lux.input}
            placeholder="Τίτλος εργασίας"
            value={newT.title}
            onChange={(e) => setNewT((x) => ({ ...x, title: e.target.value }))}
          />
          <input
            className={lux.input}
            type="date"
            value={newT.due}
            onChange={(e) => setNewT((x) => ({ ...x, due: e.target.value }))}
          />
          {rsvps[0] ? (
            <button
              type="button"
              className={lux.btnPrimary}
              onClick={async () => {
                if (!newT.title.trim() || !taskContactId) return;
                await fetchWithTimeout("/api/tasks", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    contact_id: taskContactId,
                    title: newT.title.trim(),
                    due_date: newT.due || null,
                  }),
                });
                setNewT({ title: "", due: "" });
              }}
            >
              Ανάθεση
            </button>
          ) : (
            <p className="text-xs text-[var(--text-muted)]">Προσθέστε πρώτα συμμετέχοντες.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function EventDetailPage() {
  return (
    <Suspense fallback={<p className="p-4">Φόρτωση…</p>}>
      <EventDetail />
    </Suspense>
  );
}
