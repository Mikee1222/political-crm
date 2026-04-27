"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { lux } from "@/lib/luxury-styles";
import { useProfile } from "@/contexts/profile-context";
import { hasMinRole } from "@/lib/roles";
import type { ContactGroupRow } from "@/lib/contact-groups";

type Poll = {
  id: string;
  title: string;
  question: string;
  options: { id: string; text: string }[];
  status: string;
  created_at: string;
  ends_at: string | null;
  target_group_id: string | null;
  response_count?: number;
};

export default function PollsPage() {
  const { profile } = useProfile();
  const can = hasMinRole(profile?.role, "manager");
  const [polls, setPolls] = useState<Poll[]>([]);
  const [groups, setGroups] = useState<ContactGroupRow[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [question, setQuestion] = useState("");
  const [opts, setOpts] = useState<{ id: string; text: string }[]>([
    { id: "a", text: "" },
    { id: "b", text: "" },
  ]);
  const [groupId, setGroupId] = useState("");
  const [ends, setEnds] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const r = await fetchWithTimeout("/api/polls");
    if (r.ok) {
      const j = (await r.json()) as { polls?: Poll[] };
      setPolls((j.polls as Poll[]) ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void fetchWithTimeout("/api/groups")
      .then((r) => r.json())
      .then((d: { groups?: ContactGroupRow[] }) => setGroups(d.groups ?? []));
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const r = await fetchWithTimeout("/api/polls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        question,
        options: opts.map((o, i) => ({ id: o.id || `o${i}`, text: o.text })).filter((o) => o.text.trim()),
        target_group_id: groupId || null,
        ends_at: ends || null,
      }),
    });
    setSaving(false);
    if (r.ok) {
      setOpen(false);
      setTitle("");
      setQuestion("");
      setOpts([{ id: "a", text: "" }, { id: "b", text: "" }]);
      void load();
    }
  };

  if (!can) {
    return <p className="p-6 text-sm text-amber-200">Δεν έχετε πρόσβαση.</p>;
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className={lux.pageTitle}>Δημοσκοπήσεις</h1>
        <button type="button" className={lux.btnPrimary} onClick={() => setOpen(true)}>
          Νέα δημοσκόπηση
        </button>
      </div>
      <ul className="space-y-2">
        {polls.map((p) => (
          <li key={p.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <Link href={`/polls/${p.id}`} className="font-medium text-[var(--text-primary)] hover:underline">
              {p.title}
            </Link>
            <p className="text-xs text-[var(--text-muted)]">
              {p.status} · {p.response_count ?? 0} απαντήσεις
              {p.ends_at ? ` · λήξη: ${p.ends_at}` : ""}
            </p>
          </li>
        ))}
      </ul>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <form onSubmit={create} className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 sm:rounded-2xl">
            <h2 className="text-lg font-bold">Νέα</h2>
            <div className="mt-2 space-y-2">
              <input className={lux.input} placeholder="Τίτλος" value={title} onChange={(e) => setTitle(e.target.value)} required />
              <textarea className={lux.textarea} placeholder="Ερώτημα" value={question} onChange={(e) => setQuestion(e.target.value)} required />
              {opts.map((o, i) => (
                <input
                  key={i}
                  className={lux.input}
                  value={o.text}
                  onChange={(e) => {
                    const n = [...opts];
                    n[i] = { ...o, text: e.target.value, id: o.id || `o${i}` };
                    setOpts(n);
                  }}
                  placeholder={`Επιλογή ${i + 1}`}
                />
              ))}
              <button type="button" className={lux.btnSecondary + " !text-xs"} onClick={() => setOpts((x) => [...x, { id: `n${x.length}`, text: "" }])}>
                + επιλογή
              </button>
              <select className={lux.select} value={groupId} onChange={(e) => setGroupId(e.target.value)} required>
                <option value="">— Ομάδα (για αποστολή) —</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              <input type="datetime-local" className={lux.input} value={ends} onChange={(e) => setEnds(e.target.value)} />
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" className={lux.btnSecondary} onClick={() => setOpen(false)}>
                Άκυρο
              </button>
              <button type="submit" className={lux.btnPrimary} disabled={saving}>
                {saving ? "…" : "Δημιουργία"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
