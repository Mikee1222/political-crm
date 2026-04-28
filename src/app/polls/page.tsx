"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { el } from "date-fns/locale";
import { Plus, Minus, Sparkles } from "lucide-react";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { lux } from "@/lib/luxury-styles";
import { CenteredModal } from "@/components/ui/centered-modal";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { HqSelect } from "@/components/ui/hq-select";
import { useFormToast } from "@/contexts/form-toast-context";
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
  option_counts?: Record<string, number>;
};

function statusPill(status: string) {
  const s = status.toLowerCase();
  if (s === "active" || s === "open") {
    return "bg-emerald-500/15 text-emerald-200 ring-emerald-500/40";
  }
  if (s === "closed" || s === "ended") {
    return "bg-slate-500/15 text-slate-200 ring-slate-500/35";
  }
  return "bg-amber-500/15 text-amber-100 ring-amber-500/40";
}

function Countdown({ endsAt }: { endsAt: string | null }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!endsAt) return;
    const id = window.setInterval(() => setTick((x) => x + 1), 30_000);
    return () => window.clearInterval(id);
  }, [endsAt]);
  void tick;
  if (!endsAt) {
    return <span className="text-[11px] text-[var(--text-muted)]">Χωρίς ημερομηνία λήξης</span>;
  }
  const end = new Date(endsAt).getTime();
  if (Number.isNaN(end)) {
    return <span className="text-[11px] text-[var(--text-muted)]">—</span>;
  }
  const now = Date.now();
  if (end <= now) {
    return <span className="text-[11px] font-semibold text-amber-200/95">Έληξε</span>;
  }
  return (
    <span className="text-[11px] text-[var(--text-secondary)]">
      Λήξη{" "}
      <span className="font-semibold text-[var(--accent-gold)]">
        {formatDistanceToNow(new Date(endsAt), { locale: el, addSuffix: true })}
      </span>
    </span>
  );
}

export default function PollsPage() {
  const { showToast } = useFormToast();
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
    try {
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
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        showToast(j.error ?? "Αποτυχία δημιουργίας.", "error");
        return;
      }
      showToast("Η δημοσκόπηση δημιουργήθηκε.", "success");
      setOpen(false);
      setTitle("");
      setQuestion("");
      setOpts([
        { id: "a", text: "" },
        { id: "b", text: "" },
      ]);
      setGroupId("");
      setEnds("");
      void load();
    } catch {
      showToast("Σφάλμα δικτύου.", "error");
    } finally {
      setSaving(false);
    }
  };

  const addOption = () => {
    setOpts((x) => [...x, { id: `o${Date.now()}`, text: "" }]);
  };

  const removeOption = (index: number) => {
    setOpts((x) => (x.length <= 2 ? x : x.filter((_, i) => i !== index)));
  };

  if (!can) {
    return <p className="p-6 text-sm text-amber-200">Δεν έχετε πρόσβαση.</p>;
  }

  return (
    <div className="min-h-0 space-y-8 p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className={lux.pageTitle}>Δημοσκοπήσεις</h1>
          <p className="mt-1 max-w-xl text-sm text-[var(--text-secondary)]">
            Επισκόπηση απαντήσεων ανά επιλογή· δημιουργία νέων δημοσκοπήσεων με δυναμικές επιλογές.
          </p>
        </div>
        <button type="button" className={lux.btnPrimary + " shrink-0"} onClick={() => setOpen(true)}>
          Νέα δημοσκόπηση
        </button>
      </div>

      {polls.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-card)]/60 px-6 py-16 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#C9A84C]/15 ring-1 ring-[#C9A84C]/35">
            <Sparkles className="h-8 w-8 text-[#C9A84C]" />
          </div>
          <p className="text-sm font-medium text-[var(--text-primary)]">Δεν υπάρχουν δημοσκοπήσεις ακόμη</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Δημιουργήστε την πρώτη για να συλλέξετε απόψεις.</p>
        </div>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {polls.map((p) => (
            <PollCard key={p.id} poll={p} />
          ))}
        </ul>
      )}

      <CenteredModal
        open={open}
        onClose={() => setOpen(false)}
        title="Νέα δημοσκόπηση"
        ariaLabel="Νέα δημοσκόπηση"
        className="!max-w-lg"
        footer={
          <>
            <button type="button" className={lux.btnSecondary} onClick={() => setOpen(false)}>
              Άκυρο
            </button>
            <FormSubmitButton type="submit" form="poll-create-form" variant="gold" loading={saving}>
              Αποθήκευση
            </FormSubmitButton>
          </>
        }
      >
        <form id="poll-create-form" onSubmit={create} className="space-y-4">
          <input className={lux.input} placeholder="Τίτλος" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <textarea
            className={lux.textarea}
            placeholder="Ερώτημα"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            required
          />
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Επιλογές</p>
            {opts.map((o, i) => (
              <div key={o.id + String(i)} className="flex gap-2">
                <input
                  className={lux.input + " min-w-0 flex-1"}
                  value={o.text}
                  onChange={(e) => {
                    const n = [...opts];
                    n[i] = { ...o, text: e.target.value, id: o.id || `o${i}` };
                    setOpts(n);
                  }}
                  placeholder={`Επιλογή ${i + 1}`}
                />
                <button
                  type="button"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition hover:border-red-500/40 hover:text-red-200 disabled:opacity-40"
                  onClick={() => removeOption(i)}
                  disabled={opts.length <= 2}
                  aria-label="Αφαίρεση επιλογής"
                >
                  <Minus className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl border border-dashed border-[#C9A84C]/50 bg-[#C9A84C]/10 px-4 py-2 text-sm font-medium text-[#E8C96B] transition hover:bg-[#C9A84C]/20"
              onClick={addOption}
            >
              <Plus className="h-4 w-4" />
              Προσθήκη επιλογής
            </button>
          </div>
          <HqSelect className={lux.select} value={groupId} onChange={(e) => setGroupId(e.target.value)} aria-label="Ομάδα στόχου">
            <option value="">— Ομάδα (για αποστολή, προαιρετικό) —</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </HqSelect>
          <input type="datetime-local" className={lux.input} value={ends} onChange={(e) => setEnds(e.target.value)} />
        </form>
      </CenteredModal>
    </div>
  );
}

const POLL_BAR_GRADIENTS = [
  "from-[#003476] to-[#2563eb]",
  "from-[#C9A84C] to-[#b45309]",
  "from-emerald-600 to-emerald-400",
  "from-violet-600 to-violet-400",
  "from-rose-600 to-rose-400",
];

function PollCard({ poll: p }: { poll: Poll }) {
  const counts = p.option_counts ?? {};
  const total = Math.max(1, p.response_count ?? 0);

  return (
    <li className="group flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-[0_8px_30px_rgba(0,0,0,0.25)] transition hover:border-[#C9A84C]/35">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <Link href={`/polls/${p.id}`} className="min-w-0 flex-1 text-base font-bold leading-snug text-[var(--text-primary)] hover:underline">
          {p.question || p.title}
        </Link>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${statusPill(p.status)}`}>
          {p.status}
        </span>
      </div>
      <p className="mb-4 line-clamp-2 text-xs text-[var(--text-secondary)]">{p.title}</p>

      <div className="mt-auto space-y-3">
        {p.options.map((o, idx) => {
          const n = counts[o.id] ?? 0;
          const pct = total > 0 ? Math.round((100 * n) / total) : 0;
          const grad = POLL_BAR_GRADIENTS[idx % POLL_BAR_GRADIENTS.length];
          return (
            <div key={o.id}>
              <div className="mb-1 flex justify-between gap-2 text-[11px] text-[var(--text-secondary)]">
                <span className="min-w-0 truncate font-medium text-[var(--text-primary)]">{o.text || "—"}</span>
                <span className="shrink-0 tabular-nums text-[var(--accent-gold)]">{pct}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-[var(--bg-elevated)] ring-1 ring-[var(--border)]/60">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${grad} transition-[width] duration-700 ease-out motion-safe:transition-[width]`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)]/80 pt-4">
        <span className="inline-flex items-center rounded-lg bg-[var(--bg-elevated)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-primary)] ring-1 ring-[var(--border)]">
          {p.response_count ?? 0} απαντήσεις
        </span>
        <Countdown endsAt={p.ends_at} />
      </div>

      <Link
        href={`/polls/${p.id}`}
        className="mt-4 block text-center text-sm font-semibold text-[#C9A84C] opacity-90 transition hover:opacity-100"
      >
        Λεπτομέρειες →
      </Link>
    </li>
  );
}
